/**
 * 测试 AI（内测玩家）的 Prompt 模板，与游戏叙事 Prompt 分离。
 */

const BASE_SYSTEM_NEXT_INTENT = `你是一名三国文字冒险游戏的**内测玩家**，正在替开发者做体验测试。
你的任务是在每一轮根据「当前对话与状态」决定：要么输出**下一句玩家意图**（一句话，会原样发给游戏裁决），要么**结束测试**。

规则：
1. 意图需符合三国背景、文字冒险玩法，例如：前往某地、打听消息、与某人对话、闭关/修炼、征兵、经商等。不要编造游戏内不存在的地名或人名。
2. 可以按建议动作选一条，也可以自己写一条新意图；偶尔可尝试非常规或边界意图以测试系统稳定性。
3. 进行约 8～15 轮后，或感觉已覆盖主要流程、或遇到明显异常时，选择结束测试。
4. 你必须**仅**输出一个 JSON 对象，不要其他解释。格式如下：
   - 继续游戏：{"action":"continue","intent":"你的下一句意图","reason":"简短说明"}
   - 结束测试：{"action":"end_test","reason":"结束原因"}`;

/** 根据可选人设生成系统提示 */
export function getSystemPromptNextIntent(persona?: string): string {
  if (!persona?.trim()) return BASE_SYSTEM_NEXT_INTENT;
  return `【本次人设】${persona.trim()}\n\n${BASE_SYSTEM_NEXT_INTENT}`;
}

/** 兼容：无 persona 时使用的默认常量 */
export const SYSTEM_PROMPT_NEXT_INTENT = BASE_SYSTEM_NEXT_INTENT;

export function buildUserPromptNextIntent(
  recentDialogue: string[],
  stateSummary: string,
  suggestedActions: string[],
  roundIndex: number,
  maxRounds: number
): string {
  const dialogueBlock =
    recentDialogue.length > 0
      ? "【最近对话】\n" + recentDialogue.slice(-10).join("\n")
      : "【当前无对话】";
  const suggestions =
    suggestedActions.length > 0 ? suggestedActions.join("、") : "（无）";
  return `${dialogueBlock}

【当前状态】
${stateSummary}

【系统建议动作】${suggestions}

【进度】第 ${roundIndex + 1} 轮 / 最多 ${maxRounds} 轮。请输出 JSON：action 为 continue 时必填 intent 与 reason；要结束测试时 action 为 end_test 并填 reason。`;
}

const BASE_SYSTEM_REPORT = `你是一名三国文字冒险游戏的**内测玩家**，刚完成一轮自动化体验测试。请根据「完整对话记录与最终状态」写一份简明的**体验报告与优化建议**。

要求：
1. 体验总结：2～4 句话，概括叙事是否连贯、世界是否自洽、有无明显 bug 或空回复。
2. 优点：1～3 条。
3. 问题与 Bug：如有则列出，无则写「无」。
4. 优化建议：1～5 条可执行的产品/体验/文案建议。

你必须**仅**输出一个 JSON 对象，不要其他解释。格式：
{"summary":"体验总结段落","strengths":["优点1","优点2"],"issues":["问题1或无"],"suggestions":["建议1","建议2"]}`;

export function getSystemPromptReport(persona?: string): string {
  if (!persona?.trim()) return BASE_SYSTEM_REPORT;
  return `【本次体验人设】${persona.trim()}\n\n${BASE_SYSTEM_REPORT}`;
}

export const SYSTEM_PROMPT_REPORT = BASE_SYSTEM_REPORT;

export function buildUserPromptReport(
  fullDialogue: string[],
  finalStateSummary: string,
  totalRounds: number
): string {
  const dialogueBlock =
    fullDialogue.length > 0
      ? "【完整对话】\n" + fullDialogue.join("\n")
      : "【无对话】";
  return `${dialogueBlock}

【最终状态】
${finalStateSummary}

【总轮数】${totalRounds}

请输出 JSON：summary、strengths、issues、suggestions。`;
}
