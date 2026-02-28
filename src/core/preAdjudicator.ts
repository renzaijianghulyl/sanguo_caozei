import type { AdjudicationRequest, LogicalResults, LogicOverride } from "@services/network/adjudication";
import type { WorldState } from "@core/state";
import { calendarToTotalDays } from "@core/TimeManager";
import { getEmotionalBrief } from "@core/BondSystem";
import {
  getEventsInRange,
  getEventsInRangeWithDetails,
  getRandomRumorHints,
  getUpcomingRumors,
  TIME_YEAR_MAX,
  TIME_YEAR_MIN
} from "@config/worldTimeline";
import { getDeceasedNPCsInRange } from "../data/sanguoDb";

/** 从玩家意图中解析出的逻辑参数 */
export interface ParsedIntent {
  /** 时间跨度（年），0 表示未识别 */
  years: number;
  /** 是否包含修炼/闭关类意图（属性成长） */
  isCultivation: boolean;
  /** 是否包含旅行/云游等（可只推进时间） */
  isTravel: boolean;
  /** 是否包含击杀/打败等战斗意图 */
  isBattle: boolean;
  /** 是否包含长途远征/出兵/行军等需粮草意图 */
  isExpedition: boolean;
  /** 战斗目标名（如 吕布），用于不可能判定 */
  battleTarget?: string;
}

const NUM_ZH: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20,
  廿: 20, 三十: 30, 四十: 40, 五十: 50, 百: 100
};

/** 解析「X年」「X载」等 */
function parseYearsFromText(text: string): number {
  const t = text.replace(/\s/g, "");
  // 数字 + 年/载
  const m1 = t.match(/(\d+)\s*[年载]/);
  if (m1) return Math.min(100, Math.max(0, parseInt(m1[1], 10)));

  // 中文数字 + 年/载：十、二十、三十年 或 十年、二十年
  const m2 = t.match(/([一二两三四五六七八九十廿百]+)\s*[年载]/);
  if (m2) {
    const s = m2[1];
    let n = 0;
    if (s === "十" || s === "十年") return 10;
    if (s.includes("十")) {
      const [a, b] = s.split("十");
      n = (NUM_ZH[a] || 0) * 10 + (NUM_ZH[b] || 0);
      if (n === 0) n = 10;
    } else {
      n = NUM_ZH[s] ?? 0;
    }
    return Math.min(100, Math.max(0, n));
  }

  // 「过了X年」「X年后」
  const m3 = t.match(/(?:过了|过去|历经|经过)\s*(\d+)\s*年/);
  if (m3) return Math.min(100, Math.max(0, parseInt(m3[1], 10)));
  const m4 = t.match(/(\d+)\s*年后/);
  if (m4) return Math.min(100, Math.max(0, parseInt(m4[1], 10)));

  return 0;
}

/**
 * 从 player_intent 解析出时间跨度和意图类型。
 */
export function parseIntent(intent: string): ParsedIntent {
  const normalized = intent.trim();
  const lower = normalized.toLowerCase();
  const years = parseYearsFromText(normalized);

  const isCultivation =
    /修炼|闭关|苦练|修行|练武|读书|钻研|参悟|静修|隐居|闭关修炼|闭关十年|修炼十年|二十年/.test(normalized);
  const isTravel = /旅行|云游|游历|周游|行走|赶路|跋涉|历经.*年/.test(normalized);
  const isBattle = /击杀|打败|战胜|单挑|决斗|讨伐|斩杀/.test(normalized);
  const isExpedition =
    /长途远征|出兵|行军|远征|率军|率兵|带兵出征|讨伐|攻打|进军/.test(normalized);

  let battleTarget: string | undefined;
  const targets = ["吕布", "关羽", "张飞", "赵云", "曹操", "刘备", "孙权", "诸葛亮"];
  for (const name of targets) {
    if (normalized.includes(name) && isBattle) {
      battleTarget = name;
      break;
    }
  }

  return {
    years: years > 0 ? years : (isCultivation || isTravel ? 1 : 0),
    isCultivation,
    isTravel,
    isBattle,
    isExpedition,
    battleTarget
  };
}

/** 武力低于该值且意图击杀吕布时，判定为不可能 */
const IMPOSSIBLE_BATTLE_STRENGTH_THRESHOLD = 85;

import { INFAMY_DELTA_EVIL_DEED } from "@data/bond/types";
import { REGION_DISPLAY_NAMES } from "@config/index";
import { parseTimeCost, getStaminaCost } from "./timeParser";
import {
  detectLogicConflict as detectLogicConflictPolicy,
  shouldApplyDebuffPenalty,
  getDebuffSuccessRateModifier,
  getBlockedEncounterNpc,
  isMovementIntent as isMovementIntentPolicy,
  getPhysiologicalSuccessFactor,
  shouldForcePhysiologicalFailure,
  getPhysiologicalFailureCause
} from "./instructionPolicies";
import { getPrompt } from "@core/contentRegistry";
import { PROMPT_KEYS } from "../agents/prompts";

/** 每回合默认推进月数（普通意图无显式时间跨度时） */
const DEFAULT_SKIP_MONTHS = 1;


/** 从意图中解析目标区域名（与 logic_db.regions 的 name 匹配） */
function parseDestinationRegionName(
  intent: string,
  regionNames: string[]
): string | undefined {
  const t = intent.trim();
  for (const name of regionNames) {
    if (t.includes(name)) return name;
  }
  return undefined;
}

/** 根据 payload 解析当前与目标区域类型及名称，供移动耗时与跨区奇遇使用 */
function getTravelContext(payload: AdjudicationRequest): {
  fromRegionType: string;
  toRegionType: string;
  fromRegionName: string;
  toRegionName: string;
} | undefined {
  if (!isMovementIntentPolicy(payload.player_intent)) return undefined;
  const regions = payload.logic_db?.regions as Array<{ name: string; type: string }> | undefined;
  if (!regions?.length) return undefined;
  const regionNames = regions.map((r) => r.name);
  const currentKey = payload.player_state?.location?.region;
  const currentName =
    (currentKey && REGION_DISPLAY_NAMES[currentKey]) || (currentKey as string) || "";
  const fromRec = regions.find((r) => r.name === currentName);
  const toName = parseDestinationRegionName(payload.player_intent, regionNames);
  const toRec = toName ? regions.find((r) => r.name === toName) : undefined;
  if (!toRec || !toName) return undefined;
  return {
    fromRegionType: fromRec?.type ?? "一般",
    toRegionType: toRec.type,
    fromRegionName: currentName,
    toRegionName: toName
  };
}

/** 若本回合为跨区域移动（起止不同城/地），返回起止名称，供注入路途奇遇指令 */
function getCrossRegionTravelInfo(payload: AdjudicationRequest): { fromName: string; toName: string } | undefined {
  const ctx = getTravelContext(payload);
  if (!ctx || !ctx.fromRegionName || !ctx.toRegionName || ctx.fromRegionName === ctx.toRegionName) return undefined;
  return { fromName: ctx.fromRegionName, toName: ctx.toRegionName };
}

/** 从 payload 解析出 detectLogicConflict 策略所需参数 */
function getLogicConflictParams(payload: AdjudicationRequest): {
  intent: string;
  currentRegionName: string;
  worldYear: number;
  regionNames: string[];
} {
  const intent = payload.player_intent.trim();
  const currentKey = payload.player_state?.location?.region;
  const currentName =
    (currentKey && REGION_DISPLAY_NAMES[currentKey]) || (currentKey as string) || "";
  const worldYear = payload.world_state?.time?.year ?? 184;
  const regions = payload.logic_db?.regions as Array<{ name: string }> | undefined;
  const regionNames = regions?.length
    ? regions.map((r) => r.name)
    : (Object.values(REGION_DISPLAY_NAMES) as string[]);
  return { intent, currentRegionName: currentName, worldYear, regionNames };
}

/** 统一计算本回合时间推进月数（委托 timeParser）。仅明确闭关/等待/前往远方等才加时，观察/攀谈/潜入等返回 0。 */
export function calculateTimeSkip(intent: string, payload?: AdjudicationRequest): number {
  let travelContext: { fromRegionType: string; toRegionType: string } | undefined;
  if (payload) travelContext = getTravelContext(payload);
  const months = parseTimeCost(intent, travelContext);
  return months > 0 ? months : 0;
}

/**
 * 按月份推进世界时间，并返回该区间内的时间线事件。
 */
function advanceWorldTimeByMonths(
  world: WorldState,
  skipMonths: number
): {
  fromYear: number;
  newWorld: WorldState;
  worldChanges: string[];
  eventsWithDetails: Array<{ label: string; summary?: string; narrative_hooks?: string[] }>;
} {
  const { year, month, day } = world.time;
  const fromYear = year;
  let totalMonths = year * 12 + (month - 1) + skipMonths;
  totalMonths = Math.max(TIME_YEAR_MIN * 12, Math.min(TIME_YEAR_MAX * 12 + 11, totalMonths));
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  const toYear = newYear;

  const newWorld: WorldState = {
    ...world,
    time: {
      year: newYear,
      month: newMonth,
      day: Math.min(day, 28)
    },
    totalDays: calendarToTotalDays(newYear, newMonth, Math.min(day, 28))
  };

  const events = getEventsInRange(fromYear, toYear);
  const worldChanges = events.map((e) => e.label);
  const eventsWithDetails = getEventsInRangeWithDetails(fromYear, toYear).map((e) => ({
    label: e.label,
    summary: e.summary,
    narrative_hooks: e.narrative_hooks
  }));

  return { fromYear, newWorld, worldChanges, eventsWithDetails };
}

/** 根据意图推断动作描述，用于 historical_summary 开头的「在X的这Y年间」 */
function inferActionPhrase(intent: string, skipMonths: number): string {
  const t = intent.trim();
  if (/闭关|静修|隐居/.test(t)) return "你闭关";
  if (/修炼|苦练|练武|修行|读书|钻研|参悟/.test(t)) return "你修炼";
  if (/旅行|云游|游历|周游|行走|赶路|跋涉/.test(t)) return "你云游";
  if (/历经|过了|过去|经过/.test(t)) return "你历经";
  if (skipMonths >= 12) return "你离开";
  return "这段时间";
}

/**
 * 生成「世界线变迁简报」，供 LLM 以沧海桑田口吻叙事。
 * 格式示例："在你闭关的这十年间（184-194年），世界发生了剧变：黄巾起义被平定、灵帝驾崩、董卓入京……"
 */
export function buildHistoricalSummary(
  fromYear: number,
  toYear: number,
  skipMonths: number,
  events: Array<{ label: string; summary?: string }>,
  intent: string
): string {
  if (events.length === 0) return "";
  const yearsLabel =
    fromYear === toYear ? `${fromYear}年` : `${fromYear}-${toYear}年`;
  const yearCount = Math.ceil(skipMonths / 12);
  const yearPhrase = yearCount >= 1 ? `${yearCount}年` : "数月";
  const actionPhrase = inferActionPhrase(intent, skipMonths);
  const eventList = events.map((e) => e.label).join("、");
  const hasSignificantSpan = skipMonths >= 6;
  if (hasSignificantSpan) {
    return `在${actionPhrase}的这${yearPhrase}间（${yearsLabel}），世界发生了剧变：${eventList}。`;
  }
  return `在这${yearPhrase}间（${yearsLabel}），天下大事：${eventList}。`;
}

/**
 * 逻辑预处理器：在 buildAdjudicationPayload 之后、调用 API 之前执行。
 * - 识别时间跨度，仅更新 world_state.time，并写入 logical_results（time_passed、world_changes）。
 * - 属性增减不在此处按年定额计算，由裁决 API 根据玩家输入与叙事通过 effects 返回。
 * - 若判定为不可能（如武力不足战吕布），写入 logic_override。
 * 返回新的 payload（深拷贝后修改），不修改入参。
 */
export function applyHardConstraints(payload: AdjudicationRequest): AdjudicationRequest {
  const intent = payload.player_intent;
  const parsed = parseIntent(intent);

  const next: AdjudicationRequest = {
    ...payload,
    player_state: { ...payload.player_state, attrs: { ...payload.player_state.attrs } },
    world_state: { ...payload.world_state, time: { ...payload.world_state.time } },
    npc_state: payload.npc_state.map((n) => ({ ...n }))
  };

  const logicalResults: LogicalResults = {};
  let logicOverride: LogicOverride | undefined;

  // 资源约束：粮草不足时长途远征/出兵
  if (parsed.isExpedition) {
    const food = next.player_state.resources?.food ?? 0;
    if (food <= 0) {
      logicOverride = {
        reason: "insufficient_food",
        instruction:
          "玩家粮草为 0，无法长途行军。叙事必须描写士兵哗变、无法出征或半途折返，不可写成成功进军。"
      };
    }
  }

  // 不可能战斗：武力不足却要击杀强敌
  if (parsed.isBattle && parsed.battleTarget) {
    const strength = next.player_state.attrs.strength ?? 0;
    if (parsed.battleTarget === "吕布" && strength < IMPOSSIBLE_BATTLE_STRENGTH_THRESHOLD) {
      logicOverride = {
        reason: "impossible_battle",
        instruction: "玩家武力不足以战胜吕布，叙事必须描写失败或撤退，不可写成胜利。"
      };
    }
  }

  // 特定剧情所需金钱硬校验：意图涉及「鬼手李/张燕」且「重金/百金」时，须满足百金
  if (!logicOverride && /鬼手李|张燕/.test(intent) && /重金|百金/.test(intent)) {
    const gold = next.player_state.resources?.gold ?? 0;
    if (gold < 100) {
      logicOverride = {
        reason: "insufficient_gold",
        instruction: `玩家当前仅有 ${gold} 金，不满足该剧情所需（重金/百金）。叙事必须描写因资财不足而无法达成或遭婉拒，不可写成成功办成。`
      };
    }
  }

  // 声望门槛：重要 NPC 设 encounter_threshold，恶名过高时闭门谢客或官兵围剿
  if (!logicOverride) {
    const blocked = getBlockedEncounterNpc(
      intent,
      next.logic_db?.npcs as Array<{ id: number; name: string }> | undefined,
      next.player_state.infamy ?? 0
    );
    if (blocked) {
      logicOverride = {
        reason: "encounter_blocked_infamy",
        instruction: `玩家恶名值（${next.player_state.infamy ?? 0}）已达该 NPC 会面门槛（${blocked.threshold}），叙事须描写闭门谢客或官兵/门房驱赶，不可写成正常会面或对话。可写「拒不见面」「门房冷脸」「官兵围剿」等。`
      };
    }
  }

  const staminaCost = getStaminaCost(intent);
  logicalResults.stamina_cost = staminaCost;
  logicalResults.physiological_success_factor = getPhysiologicalSuccessFactor(next.player_state);
  const currentStamina = next.player_state.stamina ?? 1000;
  if (!logicOverride && currentStamina < staminaCost) {
    logicOverride = {
      reason: "insufficient_stamina",
      instruction:
        "玩家行动力不足，本回合动作须描写为「勉强完成」或「体力不支倒地/半途而废」，不可写成轻松达成。叙事中应体现疲惫、力竭或被迫中止。"
    };
  }
  if (!logicOverride && shouldForcePhysiologicalFailure(next.player_state, intent)) {
    const cause = getPhysiologicalFailureCause(next.player_state);
    const key =
      cause === "health"
        ? PROMPT_KEYS.PHYSIOLOGICAL_FAILURE_HEALTH
        : cause === "hunger"
          ? PROMPT_KEYS.PHYSIOLOGICAL_FAILURE_HUNGER
          : PROMPT_KEYS.PHYSIOLOGICAL_FAILURE_BOTH;
    const physInstruction = getPrompt(key);
    logicOverride = {
      reason: "physiological_failure",
      instruction:
        physInstruction ??
        "【生理失败】本回合动作因生理状态被判定为失败。叙事首句必须直接描述生理痛苦，严禁出现「虽然你很累，但你依然成功完成了……」这类软绵绵的叙事。"
    };
  }

  const isEvilIntent = /纵火|劫掠|行刺|烧粮|屠城|焚宅|暗杀|勒索|盗取|焚毁|灭口|索要钱粮|强征|夺其|伏击.*夺|劫掠|烧粮仓/.test(intent.trim());
  if (isEvilIntent) {
    logicalResults.infamy_delta = INFAMY_DELTA_EVIL_DEED;
    const regions = next.logic_db?.regions as Array<{ name: string; ownerId: number }> | undefined;
    if (regions?.length) {
      for (const r of regions) {
        if (r.name && intent.includes(r.name)) {
          logicalResults.hostile_faction_add = String(r.ownerId);
          break;
        }
      }
    }
  }

  // 时间推进：每回合至少 1 个月；移动类意图且能解析起止区域时按区域类型计算耗时
  const skipMonths = calculateTimeSkip(intent, next);
  const { fromYear, newWorld, worldChanges, eventsWithDetails } = advanceWorldTimeByMonths(
    next.world_state,
    skipMonths
  );
  next.world_state = newWorld;
  logicalResults.time_passed = Math.ceil(skipMonths / 12);
  logicalResults.time_passed_months = skipMonths;
  logicalResults.new_time = { year: newWorld.time.year, month: newWorld.time.month };
  if (worldChanges.length > 0) {
    logicalResults.world_changes = worldChanges;
  }

  const folkRumors = getUpcomingRumors(newWorld.time.year, 2);
  if (folkRumors.length > 0) {
    logicalResults.folk_rumors = folkRumors;
  }

  if (logicOverride?.reason === "impossible_battle") {
    logicalResults.audio_trigger = "war";
  } else if (worldChanges.length > 0 && skipMonths >= 6) {
    logicalResults.audio_trigger = "history";
  } else if (parsed.isCultivation || parsed.isTravel) {
    logicalResults.audio_trigger = "calm";
  }

  // 逻辑冲突计数：玩家指令与 WorldState 时间/地点严重冲突时加 1，供高时切换「嘲讽/无视」叙事
  const conflictParams = getLogicConflictParams(payload);
  if (detectLogicConflictPolicy(conflictParams.intent, conflictParams.currentRegionName, conflictParams.worldYear, conflictParams.regionNames)) {
    const prevCount = payload.player_state.logic_conflict_count ?? 0;
    const newCount = prevCount + 1;
    next.player_state = { ...next.player_state, logic_conflict_count: newCount };
  }

  // 向 LLM 显式同步新时间与事件；当前权威时间为最高权重，叙事年份须与 logic_db 一致
  const baseEventContext = (next.event_context ?? {}) as Record<string, unknown>;
  baseEventContext.new_time = logicalResults.new_time;
  baseEventContext.temporal_authority =
    "【时序硬约束·最高优先级】当前权威时间以 world_state.time 与 logical_results.new_time 为准，叙事中出现的任何年月须与此一致，禁止回溯或虚构年份。";

  const conflictCount = next.player_state.logic_conflict_count ?? payload.player_state.logic_conflict_count ?? 0;
  if (conflictCount > 0) {
    baseEventContext.logic_conflict_count = conflictCount;
  }

  // 惩罚性逻辑：重伤/断粮/中毒时，战斗与移动类指令成功率强制降 50%，且叙事首句须体现负面状态
  const debuff = shouldApplyDebuffPenalty(next.player_state, intent);
  if (debuff.apply) {
    logicalResults.success_rate_modifier = getDebuffSuccessRateModifier();
    baseEventContext.debuff_active = debuff.labels;
    const examples: string[] = [];
    if (debuff.labels.some((l) => l === "重伤" || l === "中毒"))
      examples.push("力不从心、头晕目眩、步履维艰");
    if (debuff.labels.includes("断粮")) examples.push("饥肠辘辘导致判断迟缓");
    const examplePhrase = examples.length ? `（如${examples.join("、")}）` : "";
    baseEventContext.debuff_narrative_instruction =
      `【负面状态·强制体现】玩家当前处于【${debuff.labels.join("、")}】状态，本回合为战斗或移动类意图，成功率已强制降低 50%。叙事首句必须体现该负面状态对行动的不利影响${examplePhrase}，不可写成轻松达成。`;
  }

  const dialogueRounds = (baseEventContext.dialogue_rounds as number | undefined) ?? 0;
  const destinyGoal = baseEventContext.destiny_goal as string | undefined;
  if (
    typeof dialogueRounds === "number" &&
    dialogueRounds > 0 &&
    dialogueRounds % 10 === 0 &&
    destinyGoal
  ) {
    baseEventContext.aspiration_alignment_instruction =
      `【志向对齐·每 10 轮】当前为第 ${dialogueRounds} 轮。请通过 NPC 之口自然评估：玩家目前行为是否朝向其初始愿望「${destinyGoal}」前进？若在朝目标努力则给予鼓励，若偏离则可委婉提醒（例如：若想成就大业，这点口粮怕是撑不到走出颍川）。语气自然融入叙事，勿生硬罗列。`;
  }

  if (skipMonths === 0) {
    // 本回合未推进时间：剔除天下大势总结，要求聚焦当前场景细节
    baseEventContext.time_advanced = false;
    baseEventContext.time_instruction =
      `本回合未推进时间，当前仍为 ${logicalResults.new_time!.year} 年 ${logicalResults.new_time!.month} 月。请勿进行年度总结或天下大势段落，直接聚焦当前场景的细节描写（如茶摊的温度、宦官的神色、周遭人声）。`;
    baseEventContext.scene_focus_instruction =
      "【即时场景】本回合无时间跳跃，禁止写「岁月如刀」「闭门苦修」等时间跨度式开场，禁止年度/天下大势总结。直接描写玩家动作的即时结果与当下环境、人物神态。";
    baseEventContext.narrative_feedback_level = 1;
    baseEventContext.narrative_style = "concise";
    baseEventContext.narrative_max_tokens = 256;
    baseEventContext.narrative_instruction =
      "叙事控制在 50～100 字，侧重当前场景与环境、人物神色，语言简洁古风。";
  } else {
    baseEventContext.time_advanced = true;
    baseEventContext.time_instruction = `当前时间已变更为 ${logicalResults.new_time!.year} 年 ${logicalResults.new_time!.month} 月，请基于此事实进行叙事。`;
    const crossRegion = getCrossRegionTravelInfo(next);
    if (crossRegion && skipMonths > 0) {
      baseEventContext.cross_region_travel = true;
      baseEventContext.travel_encounter_instruction =
        `【跨区域移动·路途奇遇】玩家本回合从「${crossRegion.fromName}」前往「${crossRegion.toName}」，禁止一笔带过「抵达某地」。必须先写一段路途中的奇遇（如：逃难灾民、查哨官军、山贼、驿站见闻、风尘仆仆），再写抵达；或本回合只写路途见闻与跋涉感，下一回合再写抵达。避免瞬间移动感。`;
    }
    if (logicalResults.folk_rumors?.length) {
      baseEventContext.folk_rumors = logicalResults.folk_rumors;
      baseEventContext.folk_rumors_instruction =
        "以下为当前民间传闻，可在 NPC 对话中自然提及 1～2 条（如路人、酒肆闲谈），以增强身临其境感，切勿生硬罗列。";
    }
    if (eventsWithDetails.length > 0 && skipMonths >= 6) {
      baseEventContext.events_in_period = eventsWithDetails;
      baseEventContext.time_instruction += ` 若本段时间跨度涵盖以下历史事件，请在叙事中体现其发生与影响：${worldChanges.join("、")}`;

      const deceasedNames = getDeceasedNPCsInRange(fromYear, newWorld.time.year);
      const deceasedStr =
        deceasedNames.length > 0 ? ` 此期间逝世的武将：${deceasedNames.join("、")}。` : "";
      const historicalSummary = buildHistoricalSummary(
        fromYear,
        newWorld.time.year,
        skipMonths,
        eventsWithDetails,
        intent
      );
      if (historicalSummary) {
        baseEventContext.historical_summary = historicalSummary + deceasedStr;
        baseEventContext.historical_summary_instruction =
          "若 historical_summary 不为空，你必须在回复中以「岁月沧桑」的口吻，先简要勾勒这些历史变迁、已故人物对世界的影响，然后再描述玩家复出后的即时感官。切忌一笔带过，要让玩家体会到物是人非、时移世易之感。";
      }
      if (skipMonths >= 12) {
        const bondBriefs = getEmotionalBrief(
          next.npc_state,
          fromYear,
          newWorld.time.year,
          eventsWithDetails
        );
        if (bondBriefs.length > 0) {
          baseEventContext.bond_emotional_brief = bondBriefs;
          baseEventContext.bond_emotional_instruction =
            "若 bond_emotional_brief 不为空，表示玩家曾有关注的武将在这些年里历经天下大事却久未相见，重逢时应在叙事中自然体现其变化与感慨，增强物是人非之感。";
        }
      }
    }

    const feedbackLevel = skipMonths <= 1 ? 1 : skipMonths < 12 ? 2 : 3;
    baseEventContext.narrative_feedback_level = feedbackLevel;
    if (feedbackLevel === 1) {
      baseEventContext.narrative_style = "concise";
      baseEventContext.narrative_max_tokens = 256;
      baseEventContext.narrative_instruction =
        "叙事控制在 50～100 字，侧重环境与即时感官，语言简洁古风。";
    } else if (feedbackLevel === 2) {
      baseEventContext.narrative_style = "detailed";
      baseEventContext.narrative_max_tokens = 480;
      baseEventContext.narrative_instruction =
        "叙事约 200 字，侧重个人成长与心境变化，可适当铺陈细节。须包含至少一处「季节演变」或「气候物候」的描写（如：从初蝉鸣叫到枯叶满地、从春衫到寒衣），以体现 2～11 个月的时间跨度。";
    } else {
      baseEventContext.narrative_style = "novelistic";
      baseEventContext.narrative_max_tokens = 900;
      const rumorHints = getRandomRumorHints(
        fromYear,
        newWorld.time.year,
        worldChanges,
        2
      );
      const rumorStr = rumorHints.length > 0 ? ` 民间传闻（可选融入）：${rumorHints.join("；")}` : "";
      baseEventContext.narrative_instruction =
        `【长篇叙事】你现在写的是长篇历史小说里的一段，读起来要像连续散文，不要出现「第一幕」「第二幕」等小标题。总篇幅 500～800 字，多写环境（季节、光影、气味）与内心独白，少用干巴巴的陈述。${rumorStr}

内容上按「时间流」自然分成三块，用空行或自然段落过渡即可，不要加任何幕/章标题：

· 先写这些年里玩家自身的境遇：闭关、修行、身体与心境的变化、孤独感（枯坐、寒暑交替、破茧成蝶）。

· 再写天下大势：基于 logical_results 与 historical_summary，写这段岁月里的历史巨变（沧海桑田、狼烟起伏、名将凋零），务必点到具体事件（如董卓入京、官渡之战等）。关于天下大势的叙述必须通过玩家的「出关感官」或「市井传闻」侧面切入（例如：你推开柴门，听闻邻人唏嘘：那号称讨董的袁绍竟在官渡败给了曹操……）。严禁以「全知视角」进行历史播报。

· 最后写出关一刻：眼前的光、耳边的声、物是人非的恍惚，再自然接到玩家当下的志向与斗志。

整体语气要像说书人娓娓道来，读者一口气读完，而不是在看带标题的汇报。`;
      if (destinyGoal) {
        const anchor = getPrompt(PROMPT_KEYS.LEVEL3_ASPIRATION_ANCHOR);
        if (anchor) baseEventContext.level3_aspiration_anchor_instruction = anchor;
      }
    }
  }

  // 连续 Level 1 计数与第 4 回合微观动态注入
  const narrativeLevel = baseEventContext.narrative_feedback_level as number | undefined;
  const isLevel1 = narrativeLevel === 1;
  const prevLevel1Count = (baseEventContext.consecutive_level1_count as number) ?? 0;
  const nextLevel1Count = isLevel1 ? prevLevel1Count + 1 : 0;
  baseEventContext.consecutive_level1_count = nextLevel1Count;
  if (isLevel1 && nextLevel1Count >= 4) {
    const diversity = getPrompt(PROMPT_KEYS.CONSECUTIVE_LEVEL1_DIVERSITY);
    baseEventContext.diversity_instruction = diversity ?? "本回合必须以一个微观动态描写作为开篇（如：火盆里的炭火爆开一丝火星），占 15～30 字，随后再进行后续叙事，不得省略。";
  }

  next.event_context = baseEventContext;

  if (logicOverride) {
    next.logic_override = logicOverride;
  }
  next.logical_results = logicalResults;

  return next;
}
