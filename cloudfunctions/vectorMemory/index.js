/**
 * 微信云函数：向量记忆 (三国沙盒 2.0)
 * 双模型协作：即时检索用 DeepSeek + Zilliz；摘要与存储可用 GLM-4-Flash + 智谱 Embedding。
 * 环境变量：
 *   ZILLIZ_ENDPOINT / ZILLIZ_API_KEY  - Zilliz
 *   DEEPSEEK_API_KEY                  - DeepSeek（embed 直连，若可用）
 *   EMBED_API_URL / EMBED_API_KEY / EMBED_MODEL - 备用 Embed（推荐智谱：https://open.bigmodel.cn/api/paas/v4/embeddings，model=embedding-2，1024 维）
 *   ZHIPU_API_KEY                     - 智谱 Key（用于 GLM-4-Flash 摘要，与 Embed 可同一 Key）
 */

const https = require("https");
const axios = require("axios");

const DEEPSEEK_EMBED_URL = "https://api.deepseek.com/embeddings";
const ZHIPU_CHAT_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const COLLECTION_NAME = "sanguo_memories";
const DEFAULT_LIMIT = 3;
const SUMMARY_MAX_CHARS = 60;
const GLM_SUMMARY_DELAY_MS = 400;

function getEnv(name) {
  return (process.env && process.env[name]) || "";
}

/** 是否配置了备用 Embed 接口（OpenAI 兼容） */
function hasAltEmbed() {
  return !!(getEnv("EMBED_API_URL") && getEnv("EMBED_API_KEY"));
}

/** 获取 Embed 请求 URL：优先备用接口 */
function getEmbedUrl() {
  if (hasAltEmbed()) return getEnv("EMBED_API_URL").trim().replace(/\/$/, "");
  return DEEPSEEK_EMBED_URL;
}

/** 获取 Embed 用的 Key 和模型名 */
function getEmbedAuth() {
  if (hasAltEmbed()) {
    return { apiKey: getEnv("EMBED_API_KEY"), model: getEnv("EMBED_MODEL") || "text-embedding-3-small" };
  }
  return { apiKey: getEnv("DEEPSEEK_API_KEY"), model: "deepseek-embed" };
}

/** 规范集群 Endpoint：只保留 origin。不主动加 19530（本地测试显示该端口 fetch failed）。 */
function normalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "string") return { base: "", withPort: "" };
  const s = endpoint.trim().replace(/\/$/, "");
  try {
    const u = new URL(s);
    const base = u.origin;
    return { base, withPort: base };
  } catch {
    return { base: s, withPort: s };
  }
}

function isConfigured() {
  const endpoint = getEnv("ZILLIZ_ENDPOINT");
  const zillizKey = getEnv("ZILLIZ_API_KEY");
  const hasDeepseek = !!(getEnv("DEEPSEEK_API_KEY"));
  const useAltEmbed = hasAltEmbed();
  return !!(endpoint && zillizKey && (hasDeepseek || useAltEmbed));
}

/**
 * 使用 Node 原生 https 发送 POST（与本地 fetch 行为一致，避免云环境 axios 差异）。
 * 每次请求前打日志：完整 URL，便于与本地对比；非 2xx 时打响应 body。
 */
function httpsPostJson(url, body, apiKey) {
  console.warn("[vectorMemory] 请求 URL:", url);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const raw = JSON.stringify(body);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(raw, "utf8"),
      Authorization: `Bearer ${apiKey}`,
      Host: u.hostname,
      "User-Agent": "Zilliz-Client/1.0 (Node)"
    };
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        headers
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data });
          } else {
            console.error("[vectorMemory] 非 2xx 状态:", res.statusCode, "URL:", url);
            console.error("[vectorMemory] 响应 body:", typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500));
            const err = new Error(`Request failed with status code ${res.statusCode}`);
            err.status = res.statusCode;
            err.data = data;
            err.url = url;
            reject(err);
          }
        });
      }
    );
    req.on("error", (e) => {
      console.error("[vectorMemory] 请求异常:", e.message, "URL:", url);
      reject(e);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.setTimeout(10000);
    req.write(raw);
    req.end();
  });
}

/**
 * 调用 Embed API，返回向量。优先使用 EMBED_API_URL（OpenAI 兼容），否则 DeepSeek。
 * DeepSeek 官方：路径 /embeddings（无 v1），模型 deepseek-embed，input 为字符串，维度 1024。
 */
async function getEmbedding(text, apiKey, embedUrl, model) {
  const url = embedUrl || DEEPSEEK_EMBED_URL;
  const reqModel = model || "deepseek-embed";
  const textStr = String(text).slice(0, 8000);
  const inputPayload = hasAltEmbed() ? textStr : textStr;
  try {
    console.warn("[vectorMemory] Embed URL:", url, "model:", reqModel);
    const res = await axios.post(
      url,
      {
        model: reqModel,
        input: inputPayload
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        timeout: 15000,
        validateStatus: () => true
      }
    );
    if (res.status !== 200) {
      const bodyStr = res.data != null ? (typeof res.data === "object" ? JSON.stringify(res.data) : String(res.data)) : "(无 body)";
      console.error("[vectorMemory] Embed 非 200:", res.status, "body:", bodyStr);
      throw new Error(`Embed 返回 ${res.status}`);
    }
    const data = res.data;
    let embedding;
    if (data && data.data && Array.isArray(data.data) && data.data[0] && Array.isArray(data.data[0].embedding)) {
      embedding = data.data[0].embedding;
    } else if (data && data.data && data.data.data && Array.isArray(data.data.data) && data.data.data[0] && Array.isArray(data.data.data[0].embedding)) {
      embedding = data.data.data[0].embedding;
    }
    if (embedding) return embedding;
    throw new Error("Embed 返回格式异常");
  } catch (e) {
    if (e.response !== undefined) {
      console.error("[vectorMemory] Embed 请求失败 status:", e.response.status, "data:", String(e.response.data || "").slice(0, 300));
    } else {
      console.error("[vectorMemory] Embed 请求异常:", e.message);
    }
    throw e;
  }
}

/**
 * Zilliz 插入：与本地 test-zilliz-local.js 一致，仅用 v2 路径，使用 https 模块避免 axios 差异。
 * POST ${base}/v2/vectordb/entities/insert
 */
async function zillizInsert(endpoint, apiKey, payload) {
  const { base } = normalizeEndpoint(endpoint);
  if (!base) throw new Error("ZILLIZ_ENDPOINT 格式无效");
  const url = base + "/v2/vectordb/entities/insert";
  try {
    const { data } = await httpsPostJson(
      url,
      { collectionName: COLLECTION_NAME, data: [payload] },
      apiKey
    );
    if (data && data.code !== undefined && data.code !== 0) {
      throw new Error(data.message || `Zilliz 返回 code ${data.code}`);
    }
  } catch (err) {
    if (err.status === 404) {
      console.error("[vectorMemory] Zilliz insert 404 URL:", err.url);
      console.error("[vectorMemory] Zilliz insert 404 响应:", typeof err.data === "string" ? err.data.slice(0, 400) : JSON.stringify(err.data).slice(0, 400));
    }
    throw err;
  }
}

/**
 * Zilliz 向量检索：与本地一致，仅用 v2 + 原生 https。响应格式 { code: 0, data: [ { summary, primary_key, distance }, ... ] }
 * POST ${base}/v2/vectordb/entities/search
 */
async function zillizSearch(endpoint, apiKey, queryVector, filterExpr, limit, outputFields) {
  const { base } = normalizeEndpoint(endpoint);
  if (!base) throw new Error("ZILLIZ_ENDPOINT 格式无效");
  const url = base + "/v2/vectordb/entities/search";
  const body = {
    collectionName: COLLECTION_NAME,
    data: [queryVector],
    annsField: "vector",
    limit: Math.min(limit || DEFAULT_LIMIT, 10),
    outputFields: outputFields || ["summary"],
    searchParams: { metricType: "COSINE" }
  };
  if (filterExpr) body.filter = filterExpr;
  try {
    const { data } = await httpsPostJson(url, body, apiKey);
    return data;
  } catch (err) {
    if (err.status === 404) {
      console.error("[vectorMemory] Zilliz 404 详情 URL:", err.url);
      console.error("[vectorMemory] Zilliz 404 响应:", typeof err.data === "string" ? err.data.slice(0, 400) : JSON.stringify(err.data).slice(0, 400));
    }
    throw err;
  }
}

/**
 * 构建 filter 表达式：session_id 必选，npc_id/region_id 可选，memory_type 可选
 */
function buildFilter(sessionId, npcId, regionId, memoryType) {
  const parts = [];
  if (sessionId) parts.push(`session_id == "${String(sessionId).replace(/"/g, '\\"')}"`);
  if (npcId) parts.push(`npc_ids like "%${String(npcId).replace(/"/g, "")}%"`);
  if (regionId) parts.push(`region_id == "${String(regionId).replace(/"/g, '\\"')}"`);
  if (memoryType != null && memoryType !== "") parts.push(`memory_type == "${String(memoryType).replace(/"/g, '\\"')}"`);
  return parts.length ? parts.join(" and ") : null;
}

/**
 * Zilliz 按 filter 删除实体。POST ${base}/v2/vectordb/entities/delete
 */
async function zillizDelete(endpoint, apiKey, collectionName, filterExpr) {
  const { base } = normalizeEndpoint(endpoint);
  if (!base) throw new Error("ZILLIZ_ENDPOINT 格式无效");
  if (!filterExpr || typeof filterExpr !== "string") throw new Error("delete 需要非空 filter");
  const url = base + "/v2/vectordb/entities/delete";
  const { data } = await httpsPostJson(url, { collectionName, filter: filterExpr }, apiKey);
  if (data && data.code !== undefined && data.code !== 0) {
    throw new Error(data.message || `Zilliz delete 返回 code ${data.code}`);
  }
  return data;
}

/**
 * 用 GLM-4-Flash 将对话压缩为约 50 字摘要（异步流程用），带简单延迟以降低 RPM 压力
 */
async function summarizeWithGLM(dialogue, apiKey) {
  await new Promise((r) => setTimeout(r, GLM_SUMMARY_DELAY_MS + Math.floor(Math.random() * 400)));
  const text = String(dialogue).slice(0, 4000).replace(/\n/g, " ");
  const res = await axios.post(
    ZHIPU_CHAT_URL,
    {
      model: "glm-4-flash",
      messages: [
        {
          role: "user",
          content: `请将下面这段三国题材对话总结成一句约50字以内的概要，只输出概要不要解释：\n\n${text}`
        }
      ],
      max_tokens: 80,
      temperature: 0.3
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      timeout: 15000,
      validateStatus: () => true
    }
  );
  if (res.status !== 200 || !res.data || !res.data.choices || !res.data.choices[0]) {
    const msg = res.data?.error?.message || res.data?.message || `智谱返回 ${res.status}`;
    throw new Error(msg);
  }
  const summary = String(res.data.choices[0].message?.content || "").trim().slice(0, SUMMARY_MAX_CHARS);
  if (!summary) throw new Error("智谱未返回摘要内容");
  return summary;
}

/** 用 GLM-4-Flash 将客观战报改写为 30 字以内江湖传闻（说书人风格） */
async function literarizeReportWithGLM(report, apiKey) {
  await new Promise((r) => setTimeout(r, GLM_SUMMARY_DELAY_MS + Math.floor(Math.random() * 400)));
  const res = await axios.post(
    ZHIPU_CHAT_URL,
    {
      model: "glm-4-flash",
      messages: [
        {
          role: "user",
          content: `你是一位汉末的茶馆说书人。请将以下客观战报改写为一段 30 字以内的江湖传闻，语气生动、带一点时代感。只输出改写后的句子，不要解释。\n\n战报：${String(report).slice(0, 200)}`
        }
      ],
      max_tokens: 60,
      temperature: 0.5
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      timeout: 15000,
      validateStatus: () => true
    }
  );
  if (res.status !== 200 || !res.data?.choices?.[0]) {
    return String(report).slice(0, 80);
  }
  const text = String(res.data.choices[0].message?.content || "").trim().slice(0, 80);
  return text || String(report).slice(0, 80);
}

exports.main = async (event, context) => {
  const { action } = event || {};
  if (!isConfigured()) {
    if (action === "save") return { saved: false, reason: "未配置 Zilliz/DeepSeek" };
    if (action === "summarizeAndSave") return { saved: false, reason: "未配置 Zilliz 或 Embed 或 ZHIPU_API_KEY" };
    if (action === "retrieve") return { memories: [] };
    return { error: "未配置 ZILLIZ_ENDPOINT / ZILLIZ_API_KEY / DEEPSEEK 或 EMBED" };
  }

  const endpoint = getEnv("ZILLIZ_ENDPOINT");
  const zillizKey = getEnv("ZILLIZ_API_KEY");
  const zhipuKey = getEnv("ZHIPU_API_KEY");
  const { apiKey: embedKey, model: embedModel } = getEmbedAuth();
  const embedUrl = getEmbedUrl();
  const { base } = normalizeEndpoint(endpoint);
  if (base) console.warn("[vectorMemory] 使用 Base URL:", base);

  try {
    if (action === "save") {
      const { summary, npc_ids, region_id, year, session_id } = event;
      if (!summary || !session_id) {
        return { saved: false, reason: "缺少 summary 或 session_id" };
      }
      console.warn("[vectorMemory] save: 调用 embed");
      const vector = await getEmbedding(summary, embedKey, embedUrl, embedModel);
      console.warn("[vectorMemory] save: embed 成功，调用 Zilliz insert");
      const primary_key = Math.floor(Date.now() * 1000) + Math.floor(Math.random() * 1000);
      const nowMs = Date.now();
      await zillizInsert(endpoint, zillizKey, {
        primary_key,
        vector,
        npc_ids: String(npc_ids ?? "").slice(0, 256),
        region_id: String(region_id ?? "").slice(0, 64),
        year: Math.round(Number(year) || 184),
        session_id: String(session_id).slice(0, 128),
        summary: String(summary).slice(0, 500),
        created_at: nowMs,
        memory_type: String(event.memory_type || "default").slice(0, 32)
      });
      return { saved: true };
    }

    if (action === "summarizeAndSave") {
      const { dialogue, npc_ids, region_id, year, session_id } = event;
      if (!dialogue || !session_id) {
        return { saved: false, reason: "缺少 dialogue 或 session_id" };
      }
      if (!zhipuKey) {
        return { saved: false, reason: "未配置 ZHIPU_API_KEY，无法调用 GLM-4-Flash 摘要" };
      }
      console.warn("[vectorMemory] summarizeAndSave: 调用 GLM-4-Flash 摘要");
      const summary = await summarizeWithGLM(dialogue, zhipuKey);
      console.warn("[vectorMemory] summarizeAndSave: 摘要成功，embed 并写入 Zilliz");
      const vector = await getEmbedding(summary, embedKey, embedUrl, embedModel);
      const primary_key = Math.floor(Date.now() * 1000) + Math.floor(Math.random() * 1000);
      const nowMs = Date.now();
      await zillizInsert(endpoint, zillizKey, {
        primary_key,
        vector,
        npc_ids: String(npc_ids ?? "").slice(0, 256),
        region_id: String(region_id ?? "").slice(0, 64),
        year: Math.round(Number(year) || 184),
        session_id: String(session_id).slice(0, 128),
        summary: String(summary).slice(0, 500),
        created_at: nowMs,
        memory_type: "default"
      });
      return { saved: true, summary };
    }

    if (action === "saveOrigin") {
      const { content, session_id } = event;
      if (!content || !session_id || String(session_id).trim() === "") {
        return { saved: false, reason: "缺少 content 或 session_id" };
      }
      const summary = String(content).slice(0, 500);
      console.warn("[vectorMemory] saveOrigin: 调用 embed");
      const vector = await getEmbedding(summary, embedKey, embedUrl, embedModel);
      const primary_key = Math.floor(Date.now() * 1000) + Math.floor(Math.random() * 1000);
      const nowMs = Date.now();
      await zillizInsert(endpoint, zillizKey, {
        primary_key,
        vector,
        npc_ids: "",
        region_id: "",
        year: 184,
        session_id: String(session_id).slice(0, 128),
        summary,
        created_at: nowMs,
        memory_type: "origin"
      });
      console.warn("[vectorMemory] saveOrigin 已执行");
      return { saved: true };
    }

    if (action === "retrieve") {
      const { npc_id, region_id, session_id, limit, include_origin } = event;
      if (!session_id || String(session_id).trim() === "") {
        return { memories: [] };
      }
      const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, 10);
      const queryText = [npc_id, region_id, "三国记忆"].filter(Boolean).join(" ") || "往事";
      console.warn("[vectorMemory] retrieve: 调用 embed");
      const queryVector = await getEmbedding(queryText, embedKey, embedUrl, embedModel);

      let originMemories = [];
      if (include_origin !== false) {
        try {
          const filterOrigin = buildFilter(session_id, null, null, "origin");
          if (filterOrigin) {
            const originRes = await zillizSearch(endpoint, zillizKey, queryVector, filterOrigin, 1, ["summary"]);
            const hits = Array.isArray(originRes?.data) ? originRes.data : [];
            originMemories = hits.map((h) => (h && h.summary != null ? h.summary : null)).filter(Boolean);
          }
        } catch (e) {
          console.warn("[vectorMemory] retrieve 召回 origin 失败（可能集合无 memory_type 字段）:", e?.message);
        }
      }

      let interpersonalList = [];
      if (npc_id && String(npc_id).trim() !== "") {
        try {
          const filterInterpersonal = buildFilter(session_id, String(npc_id).trim(), null, "interpersonal");
          if (filterInterpersonal) {
            const interRes = await zillizSearch(endpoint, zillizKey, queryVector, filterInterpersonal, 2, ["summary", "created_at"]);
            const hits = Array.isArray(interRes?.data) ? interRes.data : [];
            interpersonalList = hits
              .map((h) => (h && h.summary != null ? { summary: h.summary, created_at: h.created_at != null ? Number(h.created_at) : 0 } : null))
              .filter(Boolean);
            interpersonalList.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          }
        } catch (e) {
          console.warn("[vectorMemory] retrieve 召回 interpersonal 失败:", e?.message);
        }
      }

      const filterExpr = buildFilter(session_id, npc_id, region_id, null);
      console.warn("[vectorMemory] retrieve: embed 成功，调用 Zilliz search");
      const searchRes = await zillizSearch(endpoint, zillizKey, queryVector, filterExpr, effectiveLimit + 15, ["summary", "created_at", "memory_type"]);
      const hits = Array.isArray(searchRes?.data) ? searchRes.data : [];
      const originSet = new Set(originMemories);
      const interSummarySet = new Set(interpersonalList.map((i) => i.summary));
      const defaultList = [];
      const rumorList = [];
      for (const h of hits) {
        const s = h && h.summary != null ? h.summary : null;
        if (!s || originSet.has(s) || interSummarySet.has(s)) continue;
        const mt = (h && h.memory_type) ? String(h.memory_type) : "default";
        if (mt === "global_rumor") {
          rumorList.push({ summary: s, created_at: h.created_at != null ? Number(h.created_at) : 0 });
        } else if (mt !== "interpersonal") {
          defaultList.push(s);
        }
      }
      rumorList.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const interSummaries = interpersonalList.map((i) => i.summary);
      const normalMemories = [...interSummaries, ...defaultList, ...rumorList.map((r) => r.summary)].slice(0, effectiveLimit - originMemories.length);
      const memories = [...originMemories, ...normalMemories].slice(0, effectiveLimit);
      return { memories };
    }

    if (action === "literarizeAndSaveRumors") {
      const { reports, session_id, region_id, year } = event;
      if (!Array.isArray(reports) || reports.length === 0 || !session_id || String(session_id).trim() === "") {
        return { saved: false, reason: "缺少 reports 或 session_id" };
      }
      if (!zhipuKey) {
        return { saved: false, reason: "未配置 ZHIPU_API_KEY，无法调用 GLM-4-Flash 文学化" };
      }
      const regionId = String(region_id ?? "").slice(0, 64);
      const y = Math.round(Number(year) || 184);
      const saved = [];
      for (let i = 0; i < reports.length; i++) {
        try {
          const rewritten = await literarizeReportWithGLM(reports[i], zhipuKey);
          const vector = await getEmbedding(rewritten, embedKey, embedUrl, embedModel);
          const primary_key = Math.floor(Date.now() * 1000) + Math.floor(Math.random() * 1000) + i;
          const nowMs = Date.now();
          await zillizInsert(endpoint, zillizKey, {
            primary_key,
            vector,
            npc_ids: "",
            region_id: regionId,
            year: y,
            session_id: String(session_id).slice(0, 128),
            summary: String(rewritten).slice(0, 500),
            created_at: nowMs,
            memory_type: "global_rumor"
          });
          saved.push(rewritten);
        } catch (e) {
          console.warn("[vectorMemory] literarizeAndSaveRumors 单条失败:", e?.message);
        }
      }
      console.warn("[vectorMemory] literarizeAndSaveRumors 已执行，写入", saved.length, "条");
      return { saved: true, count: saved.length };
    }

    if (action === "deleteBySessionId") {
      const { session_id } = event;
      if (!session_id || String(session_id).trim() === "") {
        return { deleted: 0, reason: "缺少 session_id" };
      }
      const filterExpr = buildFilter(session_id, null, null);
      await zillizDelete(endpoint, zillizKey, COLLECTION_NAME, filterExpr);
      console.warn("[vectorMemory] deleteBySessionId 已执行:", session_id);
      return { deleted: true };
    }

    if (action === "deleteOlderThan") {
      const days = Math.max(1, Math.min(365, Number(event.days) || 30));
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const filterExpr = `created_at < ${cutoffMs}`;
      await zillizDelete(endpoint, zillizKey, COLLECTION_NAME, filterExpr);
      console.warn("[vectorMemory] deleteOlderThan 已执行: 早于", days, "天");
      return { deleted: true, days };
    }

    return { error: "未知 action，支持 save / saveOrigin / retrieve / summarizeAndSave / literarizeAndSaveRumors / deleteBySessionId / deleteOlderThan" };
  } catch (err) {
    console.error("[vectorMemory]", err.message || err);
    if (action === "save" || action === "summarizeAndSave" || action === "saveOrigin") return { saved: false, reason: err.message || "写入失败" };
    if (action === "literarizeAndSaveRumors") return { saved: false, reason: err.message };
    if (action === "retrieve") return { memories: [], reason: err.message || "检索失败" };
    if (action === "deleteBySessionId" || action === "deleteOlderThan") return { deleted: false, reason: err.message };
    return { error: err.message || "vectorMemory 执行失败" };
  }
};
