/**
 * 微信云函数：裁决 API
 * 接收小游戏提交的玩家意图与状态，调用 LLM 生成剧情，返回 narrative + state_changes
 *
 * 支持的模型（任选其一配置即可）：
 * - DeepSeek：在云开发控制台 → 云函数 → adjudication → 配置 → 环境变量
 *   添加 DEEPSEEK_API_KEY = sk-xxx
 * - 腾讯混元：添加 HUNYUAN_API_KEY = 你的混元 API Key
 *   （混元控制台 https://console.cloud.tencent.com/hunyuan/start 创建）
 * 优先使用 HUNYUAN_API_KEY，若未配置则使用 DEEPSEEK_API_KEY
 */
const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
const HUNYUAN_API = "https://api.hunyuan.cloud.tencent.com/v1/chat/completions";

const SYSTEM_PROMPT = `你是一名三国文字冒险游戏的剧情裁决者。根据玩家当前状态、世界状态和玩家意图，生成简短的剧情叙述（narrative）和可选的状态变更（effects）。

规则：
1. narrative：1～3 句古风旁白，描述玩家的举动带来的结果，50～150 字。
2. effects：可选，字符串数组，格式如 "intelligence+2"、"gold+10"、"legend+5"、"reputation-3"。只输出有变动的属性。
3. 保持三国时代背景，语言简洁古风。
4. 必须严格输出 JSON，格式：{"narrative":"...", "effects":[]}`;

function buildUserPrompt(payload) {
  const { player_state, world_state, npc_state, player_intent, event_context } = payload;
  return `【玩家意图】${player_intent}

【玩家状态】
- 武力${player_state?.attrs?.strength ?? 0} 智力${player_state?.attrs?.intelligence ?? 0} 魅力${player_state?.attrs?.charm ?? 0} 运气${player_state?.attrs?.luck ?? 0}
- 传奇度${player_state?.legend ?? 0} 声望${player_state?.reputation ?? 0}
- 资源：金${player_state?.resources?.gold ?? 0} 粮${player_state?.resources?.food ?? 0} 兵${player_state?.resources?.soldiers ?? 0}
- 位置：${player_state?.location?.region ?? ""} ${player_state?.location?.scene ?? ""}

【世界状态】时代${world_state?.era ?? ""}
${event_context?.recent_dialogue?.length ? `【近期对话】${event_context.recent_dialogue.join("; ")}` : ""}

请输出 JSON：{"narrative":"...", "effects":[]}`;
}

function callLLM(url, apiKey, model, messages) {
  return new Promise((resolve, reject) => {
    const https = require("https");
    const data = JSON.stringify({
      model,
      messages,
      temperature: 0.8,
      max_tokens: 512
    });
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (resp) => {
        let body = "";
        resp.on("data", (chunk) => (body += chunk));
        resp.on("end", () => {
          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error("LLM 返回解析失败"));
            }
          } else {
            reject(new Error(`LLM API ${resp.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function parseLLMOutput(content) {
  let raw = (content || "").trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("[adjudication] LLM 输出无有效 JSON:", raw.slice(0, 200));
    return { narrative: "你的举动引起了注意。", effects: [] };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      narrative: parsed.narrative || "你的举动引起了注意。",
      effects: Array.isArray(parsed.effects) ? parsed.effects : []
    };
  } catch (e) {
    console.warn("[adjudication] JSON 解析失败:", e?.message, jsonMatch[0].slice(0, 100));
    return { narrative: raw.slice(0, 150) || "你的举动引起了注意。", effects: [] };
  }
}

function makeResponse(result, state_changes) {
  return { result, state_changes };
}

exports.main = async (event, context) => {
  const hunyuanKey = process.env.HUNYUAN_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const useHunyuan = hunyuanKey && String(hunyuanKey).trim().length > 0;
  const useDeepSeek = deepseekKey && deepseekKey.startsWith("sk-");
  const apiKey = useHunyuan ? hunyuanKey : useDeepSeek ? deepseekKey : null;
  const isHttp = !!event.body;

  if (!apiKey) {
    const res = makeResponse(
      { narrative: "裁决服务配置异常，请配置 HUNYUAN_API_KEY 或 DEEPSEEK_API_KEY。", effects: [] },
      undefined
    );
    return isHttp ? { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify(res) } : res;
  }

  let payload = event;
  if (event.body) {
    try {
      payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return isHttp
        ? { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "请求体 JSON 解析失败" }) }
        : makeResponse({ narrative: "请求格式错误。", effects: [] }, undefined);
    }
  }

  const { player_intent } = payload;
  if (!player_intent) {
    const res = makeResponse({ narrative: "缺少意图。", effects: [] }, undefined);
    return isHttp ? { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify(res) } : res;
  }

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(payload) }
    ];
    const url = useHunyuan ? HUNYUAN_API : DEEPSEEK_API;
    const model = useHunyuan ? "hunyuan-turbos-latest" : "deepseek-chat";
    const res = await callLLM(url, apiKey, model, messages);
    const content = res?.choices?.[0]?.message?.content?.trim() ?? "";
    const { narrative, effects } = parseLLMOutput(content);

    const response = makeResponse(
      { narrative, effects },
      effects.length ? { player: effects } : undefined
    );

    return isHttp
      ? { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) }
      : response;
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("裁决失败:", err);
    const hint =
      msg.includes("401") || msg.includes("403")
        ? "API 密钥可能无效或已过期，请检查云函数环境变量。"
        : msg.includes("429")
          ? "请求过于频繁，请稍后再试。"
          : msg.includes("timeout") || msg.includes("ETIMEDOUT")
            ? "大模型响应超时，请检查云函数超时配置（建议 20 秒以上）。"
            : msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")
              ? "无法连接大模型服务，请检查网络。"
              : `大模型调用失败：${msg.slice(0, 80)}`;
    const res = makeResponse(
      { narrative: `天有不测风云，你的举动暂时未能得到回应。${hint}`, effects: [] },
      undefined
    );
    return isHttp ? { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify(res) } : res;
  }
};
