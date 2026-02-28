/**
 * 本地 Zilliz 连通性测试：先在本机调通 insert/search，再接到云函数。
 *
 * 用法（在项目根目录）：
 *   ZILLIZ_ENDPOINT="https://in03-xxx.serverless.ali-cn-hangzhou.cloud.zilliz.com.cn" \
 *   ZILLIZ_API_KEY="你的API_KEY" \
 *   node scripts/test-zilliz-local.js
 *
 * 会依次尝试多种 Base URL 与路径，打印每次请求的 URL、状态码和响应体，便于对照 Zilliz 文档排查 404。
 */

const COLLECTION = "sanguo_memories";

function env(name) {
  return (process.env && process.env[name]) || "";
}

function normalizeBase(endpoint) {
  if (!endpoint || typeof endpoint !== "string") return [];
  const s = endpoint.trim().replace(/\/$/, "");
  try {
    const u = new URL(s);
    const base = u.origin;
    const withPort = `${u.protocol}//${u.hostname}:19530`;
    return [base, withPort].filter((b, i, arr) => arr.indexOf(b) === i);
  } catch {
    return [s];
  }
}

// 构造一条测试用 1024 维向量（与 collection 维度一致）
function fakeVector1024() {
  const v = [];
  for (let i = 0; i < 1024; i++) v.push(0.01 * (i % 100));
  return v;
}

async function request(method, url, body, headers) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, statusText: res.statusText, data };
}

async function main() {
  const endpoint = env("ZILLIZ_ENDPOINT");
  const apiKey = env("ZILLIZ_API_KEY");

  if (!endpoint || !apiKey) {
    console.error("请设置环境变量: ZILLIZ_ENDPOINT, ZILLIZ_API_KEY");
    process.exitCode = 1;
    return;
  }

  const bases = normalizeBase(endpoint);
  const authHeader = { Authorization: `Bearer ${apiKey}` };

  console.log("--- 1. 尝试 Insert ---");
  const insertPaths = ["/v2/vectordb/entities/insert", "/v1/vector/insert"];
  const payload = {
    collectionName: COLLECTION,
    data: [
      {
        primary_key: Date.now(),
        vector: fakeVector1024(),
        npc_ids: "2001",
        region_id: "yingchuan",
        year: 184,
        session_id: "test-session",
        summary: "本地测试插入一条"
      }
    ]
  };

  for (const base of bases) {
    for (const path of insertPaths) {
      const url = base + path;
      console.log("\nPOST", url);
      try {
        const res = await request("POST", url, payload, authHeader);
        console.log("  状态:", res.status, res.statusText);
        console.log("  响应:", JSON.stringify(res.data, null, 2).slice(0, 500));
        if (res.status >= 200 && res.status < 300) {
          console.log("\n  Insert 成功，该 URL 可用。");
          break;
        }
      } catch (e) {
        console.log("  异常:", e.message);
      }
    }
  }

  console.log("\n--- 2. 尝试 Search ---");
  const searchPaths = ["/v2/vectordb/entities/search", "/v1/vector/search"];
  const searchBody = {
    collectionName: COLLECTION,
    data: [fakeVector1024()],
    annsField: "vector",
    limit: 3,
    outputFields: ["summary"],
    filter: `session_id == "test-session"`,
    searchParams: { metricType: "COSINE" }
  };

  for (const base of bases) {
    for (const path of searchPaths) {
      const url = base + path;
      console.log("\nPOST", url);
      try {
        const res = await request("POST", url, searchBody, authHeader);
        console.log("  状态:", res.status, res.statusText);
        console.log("  响应:", JSON.stringify(res.data, null, 2).slice(0, 500));
        if (res.status >= 200 && res.status < 300) {
          console.log("\n  Search 成功，该 URL 可用。");
        }
      } catch (e) {
        console.log("  异常:", e.message);
      }
    }
  }

  console.log("\n--- 结束。若全部 404，请把上面打印的 URL 与 Zilliz 控制台「集群详情」中的 REST 文档对照。---");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
