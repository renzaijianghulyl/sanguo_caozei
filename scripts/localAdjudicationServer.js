/**
 * 本地裁决服务：在 Node 中运行云函数 adjudication 逻辑，提供 POST /intent/resolve。
 * 用于本地体验测试（npm run playtest）时无需云函数 URL 化，只需在 .env 中配置 API Key。
 *
 * 使用：在项目根目录执行 npm run adjudication-server，保持运行；
 *      在 .env 中设置 ADJUDICATION_API=http://localhost:3000/intent/resolve 后运行 npm run playtest。
 */
const path = require("path");
const http = require("http");

// 从项目根加载 .env（DEEPSEEK_API_KEY / HUNYUAN_API_KEY 供云函数使用）
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.ADJUDICATION_PORT) || 3000;
const adjudicationPath = path.join(__dirname, "..", "cloudfunctions", "adjudication", "index.js");
const adjudication = require(adjudicationPath);

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || (req.url !== "/intent/resolve" && req.url !== "/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found. Use POST /intent/resolve" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const event = { body: body || "{}" };
    try {
      const result = await adjudication.main(event, {});
      if (result.statusCode != null) {
        res.writeHead(result.statusCode, result.headers || {});
        res.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      }
    } catch (err) {
      console.error("[localAdjudicationServer]", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          result: {
            narrative: "本地裁决服务异常：" + (err?.message || String(err)).slice(0, 100),
            effects: []
          }
        })
      );
    }
  });
});

server.listen(PORT, () => {
  console.log(`[localAdjudicationServer] 裁决服务已启动: http://localhost:${PORT}/intent/resolve`);
  console.log("  在 .env 中设置 ADJUDICATION_API=http://localhost:" + PORT + "/intent/resolve 后即可运行 npm run playtest");
});
