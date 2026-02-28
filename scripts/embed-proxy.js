/**
 * Embed 转发代理：在本机或自有服务器运行，将 /v1/embeddings 请求转发到 DeepSeek，用于绕过「云函数访问 DeepSeek 返回 404」。
 *
 * 用法：
 *   1. 在本机或能访问 api.deepseek.com 的服务器上：
 *      DEEPSEEK_API_KEY=你的Key node scripts/embed-proxy.js
 *   2. 若本机运行，用 ngrok 等暴露为公网 URL，例如 https://xxx.ngrok.io
 *   3. 云函数环境变量设置：
 *      EMBED_API_URL=https://xxx.ngrok.io/v1/embeddings
 *      EMBED_API_KEY=任意非空（代理不校验，仅占位）
 *      （不要设 EMBED_MODEL，用默认即可，代理会转发 model）
 *
 * 请求：POST /v1/embeddings，Body 与 OpenAI/DeepSeek 一致，Authorization 由代理替换为 DEEPSEEK_API_KEY。
 */

const http = require("http");

const DEEPSEEK_EMBED = "https://api.deepseek.com/embeddings";
const PORT = Number(process.env.PORT) || 3780;

function env(name) {
  return (process.env && process.env[name]) || "";
}

function forward(req, body, apiKey) {
  return new Promise((resolve, reject) => {
    const u = new URL(DEEPSEEK_EMBED);
    const raw = JSON.stringify(body);
    const r = require("https").request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(raw, "utf8"),
          Authorization: `Bearer ${apiKey}`
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    r.on("error", reject);
    r.write(raw);
    r.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url.startsWith("/v1/embeddings")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found. Use POST /v1/embeddings" }));
    return;
  }

  const key = env("DEEPSEEK_API_KEY");
  if (!key) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "DEEPSEEK_API_KEY not set" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk.toString();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  try {
    const forwardBody = { ...json, model: json.model || "deepseek-embed" };
    const { status, body: out } = await forward(req, forwardBody, key);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(out);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy error", message: e.message }));
  }
});

server.listen(PORT, () => {
  console.log("Embed 代理监听 http://0.0.0.0:" + PORT + "/v1/embeddings");
  console.log("请将 EMBED_API_URL 设为该地址（若本机可被云函数访问则填公网 URL）。");
});
