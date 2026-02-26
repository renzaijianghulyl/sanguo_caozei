/**
 * 本地指令：纯判断与从历史中取上一条意图，不依赖 runtime。
 * tryHandleLocalIntent 仍留在 gameApp 中组合调用（依赖 render、saveManager、submitIntentForAdjudication 等）。
 */

/** 本地指令类型，供单测使用 */
export type LocalIntentType =
  | "help"
  | "save"
  | "load"
  | "about"
  | "ad"
  | "feedback"
  | "attrs"
  | "retry"
  | "meta"
  | null;

/**
 * 元问题（问模型/指令/开发者）时本地直接回复的文案池，随机选用以保持新鲜感（参考越狱测试报告优化建议）。
 * 不发给 LLM，避免重复「天机不可窥」。
 */
export const META_REFUSAL_VARIETIES = [
  "此乃南华老仙传授的「太平要术」，非大缘分者不可知。阁下不去操心董贼，问这些作甚？",
  "此乃天机，凡人不可窥视。",
  "乾坤倒错，慎言！此问有干天和，还请专注眼前乱世。",
  "河图洛书异象，非俗子可参。阁下且先安身立命，再论玄机不迟。",
  "谶纬反噬，妄窥者必遭天谴。莫再追问，专心天下事。"
];

export function getMetaRefusalMessage(): string {
  const idx = Math.floor(Math.random() * META_REFUSAL_VARIETIES.length);
  return META_REFUSAL_VARIETIES[idx];
}

/** 是否属于「元问题」：问模型/指令/开发者等，需统一以三国风拒绝，不发给 LLM。不含单纯「你是谁」（走 about）。 */
function isMetaIntent(intent: string): boolean {
  const t = intent.trim().toLowerCase();
  const metaPatterns = [
    /底层\s*模型|什么\s*模型|你是什么\s*模型|gpt|claude|gemini|openai|大模型|语言模型/,
    /system\s*prompt|系统\s*提示|开发者|程序员|cursor|越狱|jailbreak/,
    /(你的?|你是)\s*指令|提示词\s*是什么|你的\s*名字\s*是|你是谁\s*开发/
  ];
  return metaPatterns.some((p) => p.test(t));
}

/** 纯函数：判断输入是否为本地指令，不产生副作用 */
export function getLocalIntentType(intent: string): LocalIntentType {
  const n = intent.trim().toLowerCase();
  if (isMetaIntent(intent)) return "meta";
  if (["help", "帮助", "指令"].includes(n)) return "help";
  if (["存档", "保存", "save"].includes(n)) return "save";
  if (["读档", "载入", "load"].includes(n)) return "load";
  if (["属性", "属性说明", "attrs"].includes(n)) return "attrs";
  if (["你是谁", "who are you", "about"].includes(n)) return "about";
  if (["广告", "福利", "reward"].includes(n)) return "ad";
  if (["反馈", "bug", "举报", "feedback"].includes(n)) return "feedback";
  if (["重试", "retry", "再试"].includes(n)) return "retry";
  return null;
}

/**
 * 从对话历史中取最后一条玩家意图（「你：」或「你说：」开头），返回纯文本，无则返回 null。
 * 纯函数，入参 dialogueHistory。
 */
export function getLastPlayerIntent(dialogueHistory: string[]): string | null {
  for (let i = dialogueHistory.length - 1; i >= 0; i--) {
    const line = dialogueHistory[i];
    if (line.startsWith("你：")) return line.slice(2).trim() || null;
    if (line.startsWith("你说：")) {
      const rest = line.slice(3).trim();
      return rest.replace(/^["「]|["」]$/g, "").trim() || null;
    }
  }
  return null;
}

/** 是否退隐江湖类意图（玩家主动结束游戏），匹配则本地触发游戏结束并展示生平 */
export function isRetirementIntent(intent: string): boolean {
  const t = intent.trim();
  return /退隐|归隐|金盆洗手|不再过问江湖|告老还乡|归老田园|退隐江湖|归隐山林|解甲归田/.test(t);
}
