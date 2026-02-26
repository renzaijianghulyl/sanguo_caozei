/**
 * 微信自定义事件统计：行为追踪、异常监测、留存预警。
 * 依赖 wx.reportEvent，仅在微信小游戏环境下上报；非 wx 环境不报错。
 */

import type { AdjudicationRequest } from "@services/network/adjudication";
import type { GameSaveData } from "@core/state";
import { isBattleIntent, isMovementIntent } from "@core/instructionPolicies";

const HAS_WX = typeof wx !== "undefined";

/** 意图分类：战斗 / 社交 / 移动 / 其他 */
export type IntentCategory = "battle" | "social" | "movement" | "other";

/** 社交类意图：结交、拜访、打听、攀谈、请教、投靠、结拜、结婚、求见、拜会等 */
function isSocialIntent(intent: string): boolean {
  const t = intent.trim();
  return /结交|拜访|打听|攀谈|请教|询问|投靠|结识|结拜|结婚|对话|求见|拜会|辞行|招募|纳贤|笼络|献计|献策|辅佐|效忠|归顺/.test(t);
}

/** 将玩家输入指令分类为 战斗/社交/移动/其他 */
export function getIntentCategory(intent: string): IntentCategory {
  const t = intent.trim();
  if (!t) return "other";
  if (isBattleIntent(t)) return "battle";
  if (isSocialIntent(t)) return "social";
  if (isMovementIntent(t)) return "movement";
  return "other";
}

/** 从对话历史计算当前轮次（玩家发送过的条数） */
export function getDialogueRound(saveData: GameSaveData | null): number {
  if (!saveData?.dialogueHistory?.length) return 0;
  return saveData.dialogueHistory.filter(
    (line) => line.startsWith("你：") || line.startsWith("你说：")
  ).length;
}

/** 从请求 payload 或存档+意图构建精简 Snapshot 摘要，供上报（控制体积） */
export function buildSnapshotSummary(
  payload: AdjudicationRequest | null,
  options?: { lastNarrativePreview?: string; extra?: Record<string, string | number> }
): Record<string, string | number> {
  const out: Record<string, string | number> = {
    round: 0,
    world_year: 0,
    region: "",
    intent_type: "other",
    intent_preview: ""
  };
  if (payload) {
    const rounds = payload.event_context?.dialogue_rounds as number | undefined;
    out.round = typeof rounds === "number" ? rounds : 0;
    out.world_year = payload.world_state?.time?.year ?? 0;
    out.region = payload.player_state?.location?.region ?? "";
    out.intent_type = getIntentCategory(payload.player_intent);
    out.intent_preview = payload.player_intent.slice(0, 20) || "";
  }
  if (options?.lastNarrativePreview) {
    out.last_narrative = options.lastNarrativePreview.slice(0, 80);
  }
  if (options?.extra) {
    Object.assign(out, options.extra);
  }
  return out;
}

/** 从 saveData + intent 构建精简摘要（无 payload 时用，如点击重新开始） */
export function buildSnapshotSummaryFromSave(
  saveData: GameSaveData | null,
  lastIntent: string,
  options?: { lastNarrativePreview?: string; extra?: Record<string, string | number> }
): Record<string, string | number> {
  const round = saveData?.dialogueHistory
    ? saveData.dialogueHistory.filter((l) => l.startsWith("你：") || l.startsWith("你说：")).length
    : 0;
  const worldYear = saveData?.world?.time?.year ?? 0;
  const region = saveData?.player?.location?.region ?? "";
  const out: Record<string, string | number> = {
    round,
    world_year: worldYear,
    region,
    intent_type: getIntentCategory(lastIntent),
    intent_preview: lastIntent.slice(0, 20) || ""
  };
  if (options?.lastNarrativePreview) {
    out.last_narrative = options.lastNarrativePreview.slice(0, 80);
  }
  if (options?.extra) {
    Object.assign(out, options.extra);
  }
  return out;
}

function report(eventId: string, data: Record<string, string | number>): void {
  if (!HAS_WX || !(wx as { reportEvent?: (id: string, d: object) => void }).reportEvent) return;
  try {
    (wx as { reportEvent: (id: string, d: object) => void }).reportEvent(eventId, data);
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[wechatEvents] reportEvent failed:", e);
    }
  }
}

// ---------- 行为追踪 ----------
/** 事件名：玩家行为（需在微信后台配置） */
export const EVENT_PLAYER_ACTION = "player_action";

/** 记录玩家输入的指令类型及轮次 */
export function reportPlayerAction(intentType: IntentCategory, round: number): void {
  report(EVENT_PLAYER_ACTION, { intent_type: intentType, round });
}

// ---------- 异常监测 ----------
/** 事件名：异常（需在微信后台配置） */
export const EVENT_ANOMALY = "anomaly";

/** 当 LLM 返回含 [ERROR] 或玩家点击重新开始时，上报 Snapshot 摘要 */
export function reportAnomaly(
  reason: "llm_error" | "user_restart",
  snapshotSummary: Record<string, string | number>
): void {
  report(EVENT_ANOMALY, { reason, ...snapshotSummary });
}

/** 检测叙事文本是否包含异常标记 */
export function narrativeContainsError(narrative: string): boolean {
  return /\[ERROR\]|\[error\]|\[Exception\]|\[EXCEPTION\]/.test(narrative || "");
}

// ---------- 留存预警 ----------
/** 单次游玩 5 分钟内退出视为疑似流失 */
export const CHURN_THRESHOLD_SEC = 5 * 60;

let sessionStartTime = 0;

/** 开始记录本次会话（进入 playing 或加载存档后调用） */
export function startSession(): void {
  sessionStartTime = Date.now();
}

/** 获取本次会话已游玩时长（秒） */
export function getSessionDurationSec(): number {
  if (sessionStartTime <= 0) return 0;
  return Math.floor((Date.now() - sessionStartTime) / 1000);
}

/** 事件名：疑似流失点（需在微信后台配置） */
export const EVENT_POTENTIAL_CHURN = "potential_churn";

/** 切出时若会话时长 < 5 分钟，将最后一轮 context 标记为疑似流失点并上报 */
export function reportPotentialChurnIfNeeded(
  snapshotSummary: Record<string, string | number>
): void {
  const durationSec = getSessionDurationSec();
  if (durationSec >= CHURN_THRESHOLD_SEC) return;
  const data: Record<string, string | number> = {
    ...snapshotSummary,
    duration_sec: durationSec,
    tag: "疑似流失点"
  };
  report(EVENT_POTENTIAL_CHURN, data);
}

/** 重置会话开始时间（重新开始游戏时调用，便于下次会话重新计时） */
export function resetSession(): void {
  sessionStartTime = 0;
}

/** 从对话历史取最后一条系统叙事（非「你：」），供流失点上下文 */
export function getLastSystemNarrative(dialogueHistory: string[]): string {
  if (!dialogueHistory?.length) return "";
  for (let i = dialogueHistory.length - 1; i >= 0; i--) {
    const line = dialogueHistory[i];
    if (!line.startsWith("你：") && !line.startsWith("你说：")) return line;
  }
  return "";
}
