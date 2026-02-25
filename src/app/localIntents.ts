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
  | null;

/** 纯函数：判断输入是否为本地指令，不产生副作用 */
export function getLocalIntentType(intent: string): LocalIntentType {
  const n = intent.trim().toLowerCase();
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
