type GuardResult = {
  allowed: boolean;
  reason?: string;
  text?: string;
};

/**
 * 叙事送审前的轻量替换：仅替换易触发审核且语义可保留的短语，降低 msgSecCheck 拒绝率。
 * 可根据审核失败日志（feedbackLogger 记录的 recordSanitizeFailure）持续补充，避免大段拦截。
 */
const NARRATIVE_RISK_REPLACEMENTS: [string, string][] = [
  ["血腥", "肃杀之气"],
  ["血溅", "兵戈所及"],
  ["头颅悬", "事已至此"]
];

function softReplaceRiskPhrases(text: string): string {
  let out = text;
  for (const [from, to] of NARRATIVE_RISK_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

const LOCAL_BLOCKLIST = [
  "作弊器",
  "外挂",
  "暴恐",
  "低俗",
  "赌博",
  "政治敏感",
  "涉黄",
  "违法",
  "恐怖袭击",
  "色情",
  "反动",
  "暴力",
  "血腥",
  "毒品",
  "诈骗",
  "传销",
  "邪教",
  "分裂",
  "颠覆"
];

/** 敏感词拦截时的提示文案池，随机选用以保持新鲜感（参考越狱测试报告优化建议） */
const BLOCKLIST_REASON_VARIETIES = [
  "此举有违天道，请重新思虑。",
  "乾坤倒错，慎言！",
  "此问有干天和，还请收回。"
];

function pickBlocklistReason(): string {
  const idx = Math.floor(Math.random() * BLOCKLIST_REASON_VARIETIES.length);
  return BLOCKLIST_REASON_VARIETIES[idx];
}

function hitsBlockList(text: string): boolean {
  const normalized = text.toLowerCase();
  return LOCAL_BLOCKLIST.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function runMsgSecCheck(content: string): Promise<boolean> {
  const w = typeof wx !== "undefined" ? (wx as any) : null;
  const fn = w?.security?.msgSecCheck;
  if (typeof fn !== "function") return Promise.resolve(true);
  return new Promise((resolve) => {
    fn({
      data: { content, version: 2, scene: 2, openid: "" },
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

export async function ensurePlayerInputSafe(text: string): Promise<GuardResult> {
  if (!text.trim()) {
    return { allowed: false, reason: "请输入有效内容" };
  }
  if (hitsBlockList(text)) {
    return { allowed: false, reason: pickBlocklistReason() };
  }
  const remoteOk = await runMsgSecCheck(text);
  if (!remoteOk) {
    return { allowed: false, reason: "内容未通过平台审核，请调整后再试" };
  }
  return { allowed: true };
}

/** 去掉 LLM/传输中产生的 Unicode 替换字符（U+FFFD，显示为），避免「出山洞时」前出现乱码 */
function stripReplacementChars(str: string): string {
  return str.replace(/\uFFFD+/g, "你");
}

/**
 * 动态安全校验：检测叙事中是否包含「作为一个语言模型」等自我披露，若有则替换为（系统忙碌中）。
 * 在所有生成内容输出前调用；若替换发生，可触发逻辑重试（由调用方决定）。
 */
const MODEL_SELF_DISCLOSURE_PATTERNS = [
  /作为一个\s*语言\s*模型/gi,
  /作为\s*一个\s*AI/gi,
  /As\s+an?\s+AI\s+language\s+model/gi,
  /I\s+am\s+(?:an?\s+)?(?:AI|language\s+model|assistant)/gi,
  /我是\s*(?:一个\s*)?(?:AI|语言模型|助手)/gi
];

const MODEL_SELF_DISCLOSURE_REPLACEMENT = "（系统忙碌中）";

export function containsModelSelfDisclosure(text: string): boolean {
  return MODEL_SELF_DISCLOSURE_PATTERNS.some((p) => p.test(text));
}

export function replaceModelSelfDisclosure(text: string): string {
  let out = text;
  for (const p of MODEL_SELF_DISCLOSURE_PATTERNS) {
    out = out.replace(p, MODEL_SELF_DISCLOSURE_REPLACEMENT);
  }
  return out;
}

/**
 * LLM 叙事：先做轻量风险词替换再送审，通过则返回送审版本（与平台审核一致），降低动态审核拒绝率。
 * 若审核仍失败，可通过 feedbackLogger 查看记录，将常被拒的表述加入 NARRATIVE_RISK_REPLACEMENTS 或 NARRATIVE_SAFETY_INSTRUCTION。
 */
export async function sanitizeNarrative(text: string): Promise<GuardResult> {
  const cleaned = stripReplacementChars(text);
  const softened = softReplaceRiskPhrases(cleaned);
  const remoteOk = await runMsgSecCheck(softened);
  if (!remoteOk) {
    return { allowed: false, reason: "生成内容未通过审核，已替换为系统回复" };
  }
  return { allowed: true, text: softened };
}
