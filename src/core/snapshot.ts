import type { GameSaveData, NPCState, PlayerState, WorldState } from "@core/state";
import type { AmbitionType } from "@core/state";
import { getSeasonSensoryDescription } from "@core/state";
import { filterEntities } from "@core/contentRegistry";
import { applyDecay } from "@core/BondSystem";
import type { AdjudicationRequest } from "@services/network/adjudication";
import {
  DEFAULT_NPC_STATE,
  DEFAULT_PLAYER_STATE,
  DEFAULT_WORLD_STATE,
  REGION_DISPLAY_NAMES,
  SCENE_DISPLAY_NAMES
} from "@config/index";
import { PAST_MILESTONES_COUNT } from "@config/instructionThresholds";
import { getPrompt } from "@core/contentRegistry";
import { PROMPT_KEYS } from "../agents/prompts";
import { getRecentHistoryLogs } from "@core/historyLog";
import { getLogicDbContext } from "../data/sanguoDb";
import { buildSnapshotInstructions } from "./eventContextPipeline";
import { getChineseYear } from "./TimeManager";
import { getWeatherForMonth } from "./WorldStateManager";
import { calendarToTotalDays } from "./TimeManager";

/** 根据志向与头衔生成玩法权重说明，供裁决时动态调整 Prompt 权重 */
function buildPlaystyleContext(player: PlayerState): string {
  const ambitionHints: Record<AmbitionType, string> = {
    unify: "【霸业志向】叙事与判定请加重军粮、民心、征伐、势力消长等逻辑权重。",
    wealth: "【商人志向】叙事与判定请加重物价、商路、买卖、投资、财富积累等逻辑权重。",
    fortress: "【割据志向】叙事与判定请加重守城、民生、防御、盟友等逻辑权重。",
    scholar: "【名士志向】叙事与判定请加重结交贤才、著书立说、声望、文辞等逻辑权重。"
  };
  const titles = (player as { active_titles?: string[] }).active_titles;
  const ambitionHint = player.ambition ? ambitionHints[player.ambition] : "";
  const titleHint =
    titles?.length ?
      "【当前称号】" + titles.join("、") + "，叙事中可据此调整他人对玩家的称呼与态度。"
    : "";
  return [ambitionHint, titleHint].filter(Boolean).join("\n");
}

export interface SnapshotInput {
  saveData: GameSaveData | null;
  playerIntent: string;
  recentDialogue?: string[];
  /** 核心引擎 2.0：对话前检索到的相关记忆，可选 */
  relevantMemories?: string[];
}

/**
 * 构建压缩版世界快照，供裁决 API 使用。
 * 纯函数，无副作用；实体经 contentRegistry 校验。
 */

function countDialogueRounds(dialogueHistory: string[]): number {
  return dialogueHistory.filter(
    (line) => line.startsWith("你：") || line.startsWith("你说：")
  ).length;
}

/** 是否为移动类意图（前往/去/到/旅行/赶路等） */
function isMovementIntent(intent: string): boolean {
  return /前往|去|到|旅行|云游|游历|赶路|跋涉|行军|出征|进军|投奔|启程|上路/.test(intent.trim());
}

/** 是否为事务性清点/整顿类意图（需辅兵台词烘托氛围） */
function isTransactionalIntent(intent: string): boolean {
  const t = intent.trim();
  return (
    /清点|整顿|统计|汇报|点验|整备|抚慰伤兵|安抚伤兵|安抚新兵|清点物资|清点缴获|点验军备|整备军备/.test(
      t
    )
  );
}

/** 从意图中解析目标区域名（与 logic_db.regions 的 name 匹配） */
function parseDestinationRegionName(intent: string, regionNames: string[]): string | undefined {
  const t = intent.trim();
  for (const name of regionNames) {
    if (t.includes(name)) return name;
  }
  return undefined;
}

/** 根据年月返回季节（用于旅途背景） */
function getSeason(year: number, month: number): string {
  if (month >= 3 && month <= 5) return "春日";
  if (month >= 6 && month <= 8) return "夏日";
  if (month >= 9 && month <= 11) return "秋日";
  return "冬日";
}

type RegionEntry = { name: string; type?: string; landscape_description?: string };

/** 当意图为移动且能解析起止区域时，生成路途背景注入 event_context */
function buildTravelBackground(
  playerState: PlayerState,
  worldState: WorldState,
  intent: string,
  regions: RegionEntry[]
): { travel_background: string; travel_background_instruction: string } | null {
  if (!isMovementIntent(intent) || !regions?.length) return null;
  const regionNames = regions.map((r) => r.name);
  const currentKey = playerState?.location?.region;
  const currentName =
    (currentKey && REGION_DISPLAY_NAMES[currentKey]) || (currentKey as string) || "";
  const toName = parseDestinationRegionName(intent, regionNames);
  if (!toName) return null;
  const fromRec = regions.find((r) => r.name === currentName);
  const toRec = regions.find((r) => r.name === toName);
  if (!toRec) return null;
  const year = worldState.time?.year ?? 184;
  const month = worldState.time?.month ?? 1;
  const season = getSeason(year, month);
  const fromLand = fromRec?.landscape_description;
  const toLand = toRec?.landscape_description;
  const parts: string[] = [
    `时值公元${year}年${month}月，${season}。`,
    fromLand ? `出发地一带：${fromLand}` : "",
    toLand ? `目的地一带：${toLand}` : "",
    "长途跋涉易生疲惫（fatigue），叙事中可自然体现风尘仆仆、马匹消瘦或鞋履磨损等岁月流逝感。"
  ];
  const travel_background = parts.filter(Boolean).join(" ");
  return {
    travel_background,
    travel_background_instruction:
      "【旅途叙事】请结合上述路途背景与 logical_results.time_passed / time_passed_months，描写旅途中的岁月流逝感（如鞋履破损、马匹消瘦、沿途百姓生活缩影），禁止一笔带过。"
  };
}

export function buildAdjudicationPayload(input: SnapshotInput): AdjudicationRequest {
  const {
    saveData,
    playerIntent,
    recentDialogue = saveData?.dialogueHistory?.slice(-5) ?? [],
    relevantMemories
  } = input;

  if (saveData) applyDecay(saveData);

  const playerState: PlayerState = saveData?.player ?? DEFAULT_PLAYER_STATE;
  const worldState: WorldState = saveData?.world ?? DEFAULT_WORLD_STATE;
  const year = worldState.time?.year ?? 184;
  const time = worldState.time ?? { year: 184, month: 1, day: 1 };
  const totalDays =
    worldState.totalDays ?? calendarToTotalDays(time.year, time.month, time.day ?? 1);
  const engineWorldContext = {
    year: time.year,
    month: time.month,
    chineseYear: getChineseYear(totalDays),
    weather: getWeatherForMonth(time.month)
  };

  const logic_db = getLogicDbContext(year);

  let npcState: NPCState[] = saveData?.npcs ?? DEFAULT_NPC_STATE;
  npcState = filterEntities<NPCState>("npc", npcState);
  npcState = npcState.filter((n) => {
    const rec = logic_db.npcs.find((np) => String(np.id) === n.id);
    if (!rec) return true;
    return rec.death_year >= year;
  });

  const dialogueRounds = countDialogueRounds(saveData?.dialogueHistory ?? []);
  const eventContext: Record<string, unknown> = recentDialogue.length > 0
    ? { recent_dialogue: recentDialogue }
    : {};
  eventContext.dialogue_rounds = dialogueRounds;
  eventContext.consecutive_level1_count =
    (saveData?.tempData as Record<string, unknown>)?.consecutive_level1_count ?? 0;

  eventContext.season_sensory = getSeasonSensoryDescription(time);
  eventContext.env_sensory_instruction = getPrompt(PROMPT_KEYS.ENV_SENSORY) ?? "";

  const currentRegionKey = playerState.location?.region ?? "";
  const currentRegionName =
    (currentRegionKey && REGION_DISPLAY_NAMES[currentRegionKey]) || currentRegionKey;
  const currentRegionEntry = (logic_db.regions || []).find(
    (r: { name: string; landmarks?: string[] }) => r.name === currentRegionName
  ) as { name: string; landmarks?: string[] } | undefined;
  const landmarks = currentRegionEntry?.landmarks;
  if (landmarks?.length) {
    eventContext.current_region_landmarks = landmarks;
  }

  const playstyleContext =
    playerState.ambition || (playerState as { active_titles?: string[] }).active_titles?.length
      ? buildPlaystyleContext(playerState)
      : undefined;
  const worldReports = (saveData?.tempData as Record<string, unknown> | undefined)?.recentWorldReports as string[] | undefined;
  const currentRegionWeather = currentRegionKey ? worldState.regions?.[currentRegionKey]?.weather : undefined;
  const instructions = buildSnapshotInstructions({
    saveData,
    playerState,
    worldState,
    playerIntent,
    logic_db,
    dialogueRounds,
    playstyleContext,
    engineWorldContext,
    relevantMemories,
    worldReports: Array.isArray(worldReports) ? worldReports : undefined,
    currentRegionWeather
  });
  Object.assign(eventContext, instructions);

  if ((instructions.delayed_letter_from as string | undefined) && saveData?.tempData) {
    delete (saveData.tempData as Record<string, unknown>).delayed_letter_hint;
  }

  const historyFlags = worldState.history_flags;
  if (historyFlags?.length) {
    eventContext.history_deviation = historyFlags;
  }

  const activeGoals = (playerState as { active_goals?: string[] }).active_goals;
  if (activeGoals?.length) {
    eventContext.active_goals = activeGoals;
  }

  const hostileFactions = (playerState as { hostile_factions?: string[] }).hostile_factions;
  if (hostileFactions?.length) {
    eventContext.hostile_faction_ids = hostileFactions;
  }

  const pastMilestones = getRecentHistoryLogs(saveData ?? null, PAST_MILESTONES_COUNT);
  if (pastMilestones.length > 0) {
    eventContext.past_milestones = pastMilestones.map(
      (m) => `${m.year}年${m.month != null ? `${m.month}月` : ""}：${m.text}`
    );
  }

  const travelBg = buildTravelBackground(
    playerState,
    worldState,
    playerIntent,
    (logic_db.regions || []) as RegionEntry[]
  );
  if (travelBg) {
    eventContext.travel_background = travelBg.travel_background;
    eventContext.travel_minimal_hours = 2;
    eventContext.travel_background_instruction =
      travelBg.travel_background_instruction +
      " 本动作为地点切换，叙事中须体现短途跋涉（约半日或数小时）及途中视觉变化（路况、天色、行人、景致），勿一笔带过。";
  }

  if (isTransactionalIntent(playerIntent)) {
    eventContext.require_supporting_npc_line = true;
    eventContext.supporting_npc_instruction =
      "【辅兵/下属台词】本回合为事务性清点或整顿，叙事中须让一名辅兵或下属说出一句带情绪的短台词（如：「校尉，我们真的能赢吗？」），通过 NPC 情绪反映氛围，避免冷冰冰的清单式回复。";
  }

  return {
    player_state: playerState,
    world_state: worldState,
    npc_state: npcState,
    event_context: Object.keys(eventContext).length > 0 ? eventContext : undefined,
    player_intent: playerIntent,
    logic_db
  };
}
