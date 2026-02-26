/**
 * 测试 AI 调用：使用与游戏相同的 API Key（DEEPSEEK_API_KEY 或 HUNYUAN_API_KEY），
 * 调用 DeepSeek / 混元 获取「下一句意图」或「体验报告」。
 */
const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
const HUNYUAN_API = "https://api.hunyuan.cloud.tencent.com/v1/chat/completions";

export interface NextIntentResult {
  action: "continue" | "end_test";
  intent?: string;
  reason?: string;
}

export interface ExperienceReport {
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
}

function getApiConfig(): { url: string; apiKey: string; model: string } {
  const hunyuanKey = process.env.HUNYUAN_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (hunyuanKey?.trim()) {
    return { url: HUNYUAN_API, apiKey: hunyuanKey.trim(), model: "hunyuan-lite" };
  }
  if (deepseekKey?.trim()) {
    return { url: DEEPSEEK_API, apiKey: deepseekKey.trim(), model: "deepseek-chat" };
  }
  throw new Error("请设置环境变量 DEEPSEEK_API_KEY 或 HUNYUAN_API_KEY（与游戏云函数使用同一 Key 即可）");
}

function extractJsonFromContent(content: string): string {
  const raw = (content || "").trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : raw;
}

async function callChat(systemPrompt: string, userPrompt: string, maxTokens = 1024): Promise<string> {
  const { url, apiKey, model } = getApiConfig();
  const connectTimeoutMs = 60_000; // 60s，避免默认 10s 导致长测偶发超时
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), connectTimeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`测试 AI API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("测试 AI 返回内容为空");
    return content;
  } catch (err) {
    clearTimeout(t);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`测试 AI API 连接超时（${connectTimeoutMs / 1000} 秒）。请检查网络或稍后重试。`);
    }
    throw err;
  }
}

/**
 * 获取下一句意图或结束测试的决策。
 * 使用较大 max_tokens 降低长意图被 API 截断导致 JSON 解析失败的概率。
 */
export async function getNextIntent(
  systemPrompt: string,
  userPrompt: string
): Promise<NextIntentResult> {
  const content = await callChat(systemPrompt, userPrompt, 2048);
  const jsonStr = extractJsonFromContent(content);
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const action = parsed.action === "end_test" ? "end_test" : "continue";
    const intent = typeof parsed.intent === "string" ? parsed.intent.trim() : undefined;
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : undefined;
    if (action === "continue" && !intent) {
      return { action: "end_test", reason: "未解析到有效 intent，结束测试" };
    }
    return { action, intent, reason };
  } catch {
    return { action: "end_test", reason: `解析失败，原始片段: ${jsonStr.slice(0, 100)}` };
  }
}

/**
 * 获取体验报告与建议。
 */
export async function getExperienceReport(
  systemPrompt: string,
  userPrompt: string
): Promise<ExperienceReport> {
  const content = await callChat(systemPrompt, userPrompt);
  const jsonStr = extractJsonFromContent(content);
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s) => typeof s === "string") : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((s) => typeof s === "string") : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s) => typeof s === "string") : []
    };
  } catch {
    return {
      summary: content.slice(0, 500),
      strengths: [],
      issues: ["报告 JSON 解析失败"],
      suggestions: []
    };
  }
}
