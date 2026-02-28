/**
 * 本地 DeepSeek Embed 测试：按「专属路径 + deepseek-embed + 字符串 input」尝试多种组合。
 *
 * 用法（在项目根目录）：
 *   DEEPSEEK_API_KEY="你的Key" node scripts/test-deepseek-embed.js
 *
 * 会依次尝试：
 *   1) https://api.deepseek.com/embeddings  + model deepseek-embed + input 字符串
 *   2) https://api.deepseek.com/vectors     + model deepseek-embed + input 字符串
 *   3) https://api.deepseek.com/v1/embeddings + model deepseek-embed + input 字符串
 * 任一 200 即成功；若全部 404 再考虑换智谱等其它 Embed。
 */

function env(name) {
  return (process.env && process.env[name]) || "";
}

async function tryOne(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("DEEPSEEK_API_KEY")}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  const apiKey = env("DEEPSEEK_API_KEY");
  if (!apiKey) {
    console.error("请设置环境变量: DEEPSEEK_API_KEY");
    process.exitCode = 1;
    return;
  }

  const candidates = [
    { url: "https://api.deepseek.com/embeddings", body: { model: "deepseek-embed", input: "测试文本" } },
    { url: "https://api.deepseek.com/vectors", body: { model: "deepseek-embed", input: "测试文本" } },
    { url: "https://api.deepseek.com/v1/embeddings", body: { model: "deepseek-embed", input: "测试文本" } }
  ];

  for (const { url, body } of candidates) {
    console.log("\n--- 尝试 POST", url);
    console.log("Body:", JSON.stringify(body));
    const { status, data } = await tryOne(url, body);
    console.log("状态:", status);
    console.log("响应:", typeof data === "object" ? JSON.stringify(data).slice(0, 500) : String(data).slice(0, 500));

    if (status === 200 && data && data.data && Array.isArray(data.data) && data.data[0] && Array.isArray(data.data[0].embedding)) {
      console.log("\n✓ Embed 成功，向量维度:", data.data[0].embedding.length);
      console.log("请将云函数中 DEEPSEEK_EMBED_URL 设为:", url);
      return;
    }
  }

  console.log("\n全部 404 → 建议：1) 在 DeepSeek 控制台确认该 Key 是否开通 embeddings；2) 或换用智谱等 EMBED_API_URL。");
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
