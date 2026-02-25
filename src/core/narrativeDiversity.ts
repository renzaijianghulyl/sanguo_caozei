/**
 * 叙事多样性引擎：关键词去重堆栈、负向约束注入、视角强制切换。
 * 用于缓解长线叙事中的文案重复（如留白测试中的「炭火」「噼啪」「静坐」复读）。
 */
import {
  NARRATIVE_DIVERSITY_LOOKBACK_ROUNDS,
  NARRATIVE_KEYWORDS_STACK_TOP_N,
  NARRATIVE_NEGATIVE_CONSTRAINT_ROUNDS,
  NARRATIVE_PERSPECTIVE_SWITCH_AFTER_ROUNDS
} from "@config/instructionThresholds";

/** 从单条叙事中提取 2～4 字片段作为候选关键词（动词/形容词/名词均可，供频次统计） */
function extractKeywordCandidates(text: string): string[] {
  const normalized = text.replace(/[，。！？、；\s：「」『』（）]+/g, " ").trim();
  const list: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    for (let len = 2; len <= 4 && i + len <= normalized.length; len++) {
      const seg = normalized.slice(i, i + len);
      if (seg.length >= 2 && !/^[0-9]+$/.test(seg)) list.push(seg);
    }
  }
  return list;
}

/**
 * 从最近 N 轮系统叙事中统计高频词，返回 Top K 的词汇列表（RecentKeywordsStack 的产出）。
 */
export function getRecentKeywordsStack(
  dialogueHistory: string[] | undefined,
  lookbackRounds: number = NARRATIVE_DIVERSITY_LOOKBACK_ROUNDS,
  topN: number = NARRATIVE_KEYWORDS_STACK_TOP_N
): string[] {
  if (!dialogueHistory?.length) return [];
  const systemLines = dialogueHistory
    .filter((line) => !/^你[：:]/.test(line.trim()))
    .slice(-lookbackRounds);
  if (systemLines.length === 0) return [];

  const count = new Map<string, number>();
  for (const line of systemLines) {
    for (const word of extractKeywordCandidates(line)) {
      count.set(word, (count.get(word) ?? 0) + 1);
    }
  }
  const sorted = [...count.entries()]
    .filter(([, n]) => n >= 2) // 至少出现 2 次才视为「高频」
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w);
  return sorted;
}

/**
 * 负向约束：严禁在接下来 N 轮内重复使用堆栈中的高频词汇。
 * 注入到 event_context.negative_constraints 供 LLM 遵守。
 */
export function buildNegativeConstraints(dialogueHistory: string[] | undefined): string | undefined {
  const stack = getRecentKeywordsStack(dialogueHistory);
  if (stack.length === 0) return undefined;
  return `【叙事去重·负向约束】严禁在接下来 ${NARRATIVE_NEGATIVE_CONSTRAINT_ROUNDS} 轮内重复使用以下高频词：${stack.join("、")}。请换用近义表达或从其他感官/物象切入，避免复读感。`;
}

/** 检测单条叙事是否包含第一人称或内心独白（我、心中、暗想、括号内独白等） */
function hasFirstPersonOrInnerMonologue(text: string): boolean {
  return (
    /[我]/.test(text) ||
    /心中|暗想|自忖|暗忖|心想|只觉|只觉得|恍若|仿佛/.test(text) ||
    /（[^）]*我[^）]*）/.test(text) ||
    /\([^)]*[我][^)]*\)/.test(text)
  );
}

/**
 * 若最近连续 N 轮均为「第三人称客观描写」（无第一人称/内心独白），
 * 返回强制切换为第一人称心理活动或纯感官白描的指令。
 */
export function buildPerspectiveSwitchHint(dialogueHistory: string[] | undefined): string | undefined {
  if (!dialogueHistory?.length) return undefined;
  const systemLines = dialogueHistory
    .filter((line) => !/^你[：:]/.test(line.trim()))
    .slice(-NARRATIVE_PERSPECTIVE_SWITCH_AFTER_ROUNDS);
  if (systemLines.length < NARRATIVE_PERSPECTIVE_SWITCH_AFTER_ROUNDS) return undefined;
  const allThirdPerson = systemLines.every((line) => !hasFirstPersonOrInnerMonologue(line));
  if (!allThirdPerson) return undefined;
  return "【视角切换】前几轮均为第三人称客观描写，本回合请切换为「第一人称心理活动」或「纯感官（嗅觉/听觉/温觉）白描」，避免连续客观叙述。可写（我……）或从触觉/气味/声音等单一感官切入。";
}
