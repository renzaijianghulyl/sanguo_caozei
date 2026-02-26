/**
 * 指令策略层：纯函数，用于判断「是否触发某条规则」。
 * 便于单测与复用，业务层（snapshot / preAdjudicator）只负责组装 payload，不写复杂条件。
 */
import type { PlayerState } from "@core/state";
import {
  DEBUFF_SUCCESS_RATE_MODIFIER,
  PHYSIOLOGY_HEALTH_FAIL_THRESHOLD,
  PHYSIOLOGY_HUNGER_FAIL_THRESHOLD
} from "@config/instructionThresholds";
import { getEncounterThreshold } from "@data/bond";

/** 移动类意图：前往/去/到/旅行/赶路/跋涉/行军等 */
export function isMovementIntent(intent: string): boolean {
  return /前往|去|到|旅行|云游|游历|赶路|跋涉|行军|出征|进军|投奔|启程|上路/.test(intent.trim());
}

/** 战斗类意图：击杀/打败/讨伐等 */
export function isBattleIntent(intent: string): boolean {
  return /击杀|打败|战胜|单挑|决斗|讨伐|斩杀/.test(intent.trim());
}

/** 审问/对峙类意图：审问、逼供、拷问、刀架脖子等，易触发套话重复 */
export function isInterrogationOrConfrontationIntent(intent: string): boolean {
  return /审问|逼供|拷问|刀架|剑指|抵喉|架颈|威逼|逼问|胁从|对峙|持刀|持剑|擒住/.test(intent.trim());
}

/** 远征类意图：长途远征/出兵/行军等 */
export function isExpeditionIntent(intent: string): boolean {
  return /长途远征|出兵|行军|远征|率军|率兵|带兵出征|讨伐|攻打|进军/.test(intent.trim());
}

/**
 * 是否应对本回合施加「负面状态惩罚」（成功率降 50% + 叙事首句体现）。
 * 当玩家处于重伤/断粮/中毒且意图为战斗或移动时返回 true 及标签列表。
 */
export function shouldApplyDebuffPenalty(
  playerState: PlayerState,
  intent: string
): { apply: boolean; labels: string[] } {
  const statusFlags = playerState.status_flags ?? [];
  const isWounded = statusFlags.includes("wounded");
  const isStarving = (playerState.resources?.food ?? 0) <= 0;
  const isPoisoned = statusFlags.includes("poisoned");
  const hasDebuff = isWounded || isStarving || isPoisoned;
  const isBattleOrMovement =
    isBattleIntent(intent) || isExpeditionIntent(intent) || isMovementIntent(intent);
  if (!hasDebuff || !isBattleOrMovement) return { apply: false, labels: [] };
  const labels: string[] = [];
  if (isWounded) labels.push("重伤");
  if (isStarving) labels.push("断粮");
  if (isPoisoned) labels.push("中毒");
  return { apply: true, labels };
}

/** 成功率修正值（重伤/断粮/中毒时战斗与移动） */
export function getDebuffSuccessRateModifier(): number {
  return DEBUFF_SUCCESS_RATE_MODIFIER;
}

export interface NpcRef {
  id: number;
  name: string;
}

/**
 * 若意图中提及的某 NPC 设有 encounter_threshold 且玩家恶名 ≥ 门槛，返回该 NPC 信息，供写入 logic_override。
 */
export function getBlockedEncounterNpc(
  intent: string,
  npcs: NpcRef[] | undefined,
  playerInfamy: number
): { npcId: number; npcName: string; threshold: number } | null {
  if (!npcs?.length || playerInfamy <= 0) return null;
  for (const npc of npcs) {
    if (!npc.name || !intent.includes(npc.name)) continue;
    const threshold = getEncounterThreshold(String(npc.id));
    if (threshold != null && playerInfamy >= threshold) {
      return { npcId: npc.id, npcName: npc.name, threshold };
    }
  }
  return null;
}

/**
 * 检测玩家意图是否与 WorldState 时间/地点严重冲突（用于 logic_conflict_count 递增）。
 * 纯函数：仅依赖意图、当前区域名、世界年份、区域名列表。
 */
export function detectLogicConflict(
  intent: string,
  currentRegionName: string,
  worldYear: number,
  regionNames: string[]
): boolean {
  const locationConflict =
    /(?:正在|在|身处|位于)\s*/.test(intent) &&
    regionNames.some((r) => r && r !== currentRegionName && intent.includes(r));
  let timeConflict = false;
  const yearMatch = intent.match(/(?:当前\s*是|如今\s*是|现在\s*是)?\s*(\d{3,4})\s*年|建安\s*(\d+)\s*年/);
  if (yearMatch) {
    const y1 = yearMatch[1] ? parseInt(yearMatch[1], 10) : NaN;
    const y2 = yearMatch[2] ? 196 + parseInt(yearMatch[2], 10) - 1 : NaN;
    const claimedYear = Number.isNaN(y1) ? y2 : y1;
    if (!Number.isNaN(claimedYear) && Math.abs(claimedYear - worldYear) > 2) timeConflict = true;
  }
  return locationConflict || timeConflict;
}

/** 是否为牢狱类场景（用于注入牢狱随机细节指令） */
export function isPrisonScene(sceneKey: string, sceneDisplayName: string): boolean {
  return /牢|狱|监|囚|prison/i.test(sceneDisplayName) || /prison/i.test(sceneKey);
}

/** 是否为静坐/等待/观察等被动动作（用于调用 Atmosphere_Generator 环境流逝模板） */
export function isPassiveAtmosphereIntent(intent: string): boolean {
  const t = intent.trim();
  return (
    /静坐|等待|观察|在雨中漫步|观察过往行人|擦拭佩剑|听农夫交谈|观察炭火|细听|聆听|凝神|独坐|枯坐|闭目|望天|看云|听雨|观火|观棋|旁观/.test(
      t
    ) || /观察.*神色|观察.*变化|细听.*声|聆听.*声/.test(t)
  );
}

/**
 * 是否为时间/剧情跳跃类意图（数年后、跳过、直到某事件等）。
 * 用于：1）压缩 recent_dialogue 仅保留最近一条，强制「重置」上下文；2）注入过场白叙事指令。
 */
export function isTimeSkipIntent(intent: string): boolean {
  const t = intent.trim();
  return (
    /数年后|几年后|多年后|数载后|一晃|转眼|时光飞逝|岁月如梭/.test(t) ||
    /\d+\s*年后/.test(t) ||
    /跳过\s*(?:到|至|至)?|直接\s*到|跳到\s*(?:到|至)?/.test(t) ||
    /直到\s*[^，。]+(?:事件|发生|为止)/.test(t)
  );
}

/** 是否为高耗能动作（潜行、格挡、长途奔袭、夜袭等），用于生理状态强制失败判定 */
export function isHighEnergyIntent(intent: string): boolean {
  const t = intent.trim();
  return /潜行|格挡|长途奔袭|夜袭|强攻|登城|擒将|伏兵|迎头痛击|攻城|率轻骑|率部|夜探|潜至|伏身|屏息|潜近|潜入|尾随|追踪|急追|疾退|突围/.test(t);
}

/**
 * 健康度 0～100：由玩家状态中的 health 表示生理阻力，与行动力（stamina）解耦。
 * 未设置时默认 100；重伤/中毒/殒命由 effects 或逻辑层写回 health。
 */
export function computeHealth(playerState: PlayerState): number {
  const h = playerState.health ?? 100;
  return Math.max(0, Math.min(100, Math.round(h)));
}

/**
 * 饥饿度 0～100：0 为饱腹，100 为断粮。food 为 0 时饥饿度 100。
 */
export function computeHunger(playerState: PlayerState): number {
  const food = playerState.resources?.food ?? 0;
  if (food <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(100 - Math.min(100, food))));
}

/**
 * 生理成功率因子：Actual_Success_Rate = Base_Rate * (Health/100) * (1 - Hunger/100)。
 * 返回 0～1 的乘数。
 */
export function getPhysiologicalSuccessFactor(playerState: PlayerState): number {
  const health = computeHealth(playerState);
  const hunger = computeHunger(playerState);
  return (health / 100) * (1 - hunger / 100);
}

/**
 * 当健康度 < 20 或饥饿度 > 80 且意图为高耗能时，应强制判定失败。
 */
export function shouldForcePhysiologicalFailure(
  playerState: PlayerState,
  intent: string
): boolean {
  if (!isHighEnergyIntent(intent)) return false;
  const health = computeHealth(playerState);
  const hunger = computeHunger(playerState);
  return health < PHYSIOLOGY_HEALTH_FAIL_THRESHOLD || hunger > PHYSIOLOGY_HUNGER_FAIL_THRESHOLD;
}

/**
 * 生理失败的主因：用于叙事时区分「体力/健康不足」与「断粮」，避免一律写成肚子饿。
 */
export function getPhysiologicalFailureCause(playerState: PlayerState): "health" | "hunger" | "both" {
  const health = computeHealth(playerState);
  const hunger = computeHunger(playerState);
  const badHealth = health < PHYSIOLOGY_HEALTH_FAIL_THRESHOLD;
  const badHunger = hunger > PHYSIOLOGY_HUNGER_FAIL_THRESHOLD;
  if (badHealth && badHunger) return "both";
  if (badHunger) return "hunger";
  return "health";
}
