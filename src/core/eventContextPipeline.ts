/**
 * 指令聚合层：根据 saveData / intent / 策略纯函数，产出 event_context 中「叙事约束与引导」相关键值。
 * snapshot 与 preAdjudicator 只负责组装数据与调用本层，避免散落写 event_context.xxx。
 * 键名与来源（snapshot/eventContextPipeline vs preAdjudicator）见 docs/event-context-sources.md。
 */
import type { GameSaveData, PlayerState, WorldState } from "@core/state";
import { getPrompt } from "@core/contentRegistry";
import { getRecentHistoryLogs } from "@core/historyLog";
import {
  DIALOGUE_ROUNDS_THRESHOLD,
  LOGIC_CONFLICT_HIGH_THRESHOLD,
  MEMORY_RESONANCE_MIN_ROUNDS,
  PAST_MILESTONES_COUNT
} from "@config/instructionThresholds";
import { REGION_DISPLAY_NAMES, SCENE_DISPLAY_NAMES } from "@config/index";
import { PROMPT_KEYS, getDiversityInstruction } from "../agents/prompts";
import { getCrucialMemoryTags } from "./historyLog";
import { isPassiveAtmosphereIntent, isPrisonScene, isBattleIntent, isInterrogationOrConfrontationIntent, isTimeSkipIntent } from "./instructionPolicies";
import { buildNegativeConstraints, buildPerspectiveSwitchHint, buildCombatInterrogationDiversityInstruction } from "./narrativeDiversity";
import {
  NARRATIVE_SAFETY_INSTRUCTION,
  CORE_SAFETY_CONSTITUTION,
  JAILBREAK_RESPONSE_VARIETY_INSTRUCTION,
  TIME_SKIP_NARRATIVE_INSTRUCTION
} from "@config/index";

export interface SnapshotInstructionInput {
  saveData: GameSaveData | null;
  playerState: PlayerState;
  worldState: WorldState;
  playerIntent: string;
  logic_db: {
    regions: Array<{ name: string; landmarks?: string[] }>;
    npcs: Array<{ id: number; name: string }>;
  };
  dialogueRounds: number;
  /** 由 snapshot 侧根据 ambition / active_titles 生成后传入 */
  playstyleContext?: string;
}

/**
 * 构建 snapshot 阶段所需的 event_context 指令键值（叙事约束、引导、去重等）。
 * 不包含 recent_dialogue、dialogue_rounds、season_sensory 等「数据」键，由 snapshot 自行写入。
 */
export function buildSnapshotInstructions(input: SnapshotInstructionInput): Record<string, unknown> {
  const {
    saveData,
    playerState,
    worldState,
    playerIntent,
    logic_db,
    dialogueRounds,
    playstyleContext
  } = input;
  const out: Record<string, unknown> = {};

  const currentRegionKey = playerState.location?.region ?? "";
  const currentRegionName =
    (currentRegionKey && REGION_DISPLAY_NAMES[currentRegionKey]) || currentRegionKey;
  const currentRegionEntry = (logic_db.regions || []).find(
    (r) => r.name === currentRegionName
  );
  const landmarks = currentRegionEntry?.landmarks;

  const locationAuthority = getPrompt(PROMPT_KEYS.LOCATION_AUTHORITY);
  if (locationAuthority) out.location_authority = locationAuthority;

  const logicConflictCount = (playerState as { logic_conflict_count?: number }).logic_conflict_count ?? 0;
  if (logicConflictCount >= LOGIC_CONFLICT_HIGH_THRESHOLD) {
    const conflictPrompt = getPrompt(PROMPT_KEYS.LOGIC_CONFLICT_HIGH);
    if (conflictPrompt) out.logic_conflict_instruction = conflictPrompt;
  }

  const sceneKey = playerState.location?.scene ?? "";
  const sceneName = SCENE_DISPLAY_NAMES[sceneKey] ?? sceneKey;
  if (isPrisonScene(sceneKey, sceneName)) {
    const prisonPrompt = getPrompt(PROMPT_KEYS.PRISON_LIFE_VARIETY);
    if (prisonPrompt) out.prison_life_variety_instruction = prisonPrompt;
  }

  const diversityInstruction = getDiversityInstruction(saveData?.dialogueHistory);
  if (diversityInstruction) out.diversity_instruction = diversityInstruction;

  const isCombatOrInterrogation =
    isBattleIntent(playerIntent) || isInterrogationOrConfrontationIntent(playerIntent);
  const combatInterrogationInstruction = buildCombatInterrogationDiversityInstruction(
    saveData?.dialogueHistory,
    isCombatOrInterrogation
  );
  if (combatInterrogationInstruction) out.combat_interrogation_diversity_instruction = combatInterrogationInstruction;

  const negativeConstraints = buildNegativeConstraints(saveData?.dialogueHistory);
  if (negativeConstraints) out.negative_constraints = negativeConstraints;

  const perspectiveHint = buildPerspectiveSwitchHint(saveData?.dialogueHistory);
  if (perspectiveHint) out.perspective_switch_instruction = perspectiveHint;

  if (isPassiveAtmosphereIntent(playerIntent)) {
    const atmosphere = getPrompt(PROMPT_KEYS.ATMOSPHERE_GENERATOR);
    if (atmosphere) out.atmosphere_generator_instruction = atmosphere;
  }
  if (isTimeSkipIntent(playerIntent)) {
    out.time_skip_instruction = TIME_SKIP_NARRATIVE_INSTRUCTION;
  }

  const purchasingPower = getPrompt(PROMPT_KEYS.PURCHASING_POWER);
  if (purchasingPower) out.purchasing_power_instruction = purchasingPower;

  if (dialogueRounds > DIALOGUE_ROUNDS_THRESHOLD) {
    out.suggest_summary = true;
    const summary = getPrompt(PROMPT_KEYS.SUMMARY_COMPRESS);
    if (summary) out.summary_instruction = summary;
  }

  if (playerState.ambition && dialogueRounds === 0) {
    out.is_opening = true;
    const opening = getPrompt(PROMPT_KEYS.OPENING_AMBITION);
    if (opening) out.opening_instruction = opening;
  }

  const narrativeInner = getPrompt(PROMPT_KEYS.NARRATIVE_INNER_MONOLOGUE);
  if (narrativeInner) out.narrative_instruction = narrativeInner;

  const relationshipRules = getPrompt(PROMPT_KEYS.RELATIONSHIP_RULES);
  if (relationshipRules) out.relationship_rules = relationshipRules;

  out.narrative_safety_instruction = NARRATIVE_SAFETY_INSTRUCTION;
  out.core_safety_constitution = CORE_SAFETY_CONSTITUTION;
  out.jailbreak_response_variety_instruction = JAILBREAK_RESPONSE_VARIETY_INSTRUCTION;

  const historyFlags = worldState.history_flags;
  if (historyFlags?.length) {
    out.history_deviation_instruction =
      "【历史偏移】由于玩家行为，历史已发生偏移。请严格基于以下现状进行后续推演，忽略与这些事实矛盾的原始史实脚本：" +
      historyFlags.map((f) => `「${f}」`).join("、") +
      "。叙事与判定须以当前世界状态为准。";
  }

  if (playstyleContext) out.playstyle_context = playstyleContext;

  const aspiration = (playerState as { aspiration?: { destiny_goal?: string | unknown } }).aspiration;
  const rawGoal = aspiration?.destiny_goal;
  const destinyGoalStr =
    typeof rawGoal === "string" && rawGoal.trim()
      ? rawGoal.trim()
      : rawGoal != null && typeof rawGoal === "object" && "text" in (rawGoal as object)
        ? String((rawGoal as { text: unknown }).text ?? "").trim()
        : "";
  if (destinyGoalStr) {
    out.destiny_goal = destinyGoalStr;
    const destinySoft = getPrompt(PROMPT_KEYS.DESTINY_GOAL_SOFT);
    if (destinySoft) out.destiny_goal_instruction = destinySoft;
    const objectiveInjection = getPrompt(PROMPT_KEYS.OBJECTIVE_INJECTION);
    if (objectiveInjection) out.objective_injection_instruction = objectiveInjection;
    const innerMonologue = getPrompt(PROMPT_KEYS.INNER_MONOLOGUE_HOOK);
    if (innerMonologue) out.inner_monologue_instruction = innerMonologue;
    const suggestedAspiration = getPrompt(PROMPT_KEYS.SUGGESTED_ACTIONS_ASPIRATION);
    if (suggestedAspiration) out.suggested_actions_aspiration_instruction = suggestedAspiration;
    const narrativeTension = getPrompt(PROMPT_KEYS.NARRATIVE_TENSION_ASPIRATION);
    if (narrativeTension) out.narrative_tension_instruction = narrativeTension;
  }

  /** 当玩家意图为「查看身体状况」类时，注入志向驱动的主观评价指令 */
  const isBodyStateIntent = /身体状况|我怎么样了|我状态如何|查看状态|现在状态/.test(playerIntent.trim());
  if (isBodyStateIntent && destinyGoalStr) {
    const contextualStats = getPrompt(PROMPT_KEYS.CONTEXTUAL_STATS);
    if (contextualStats) out.contextual_stats_instruction = contextualStats;
  }

  const activeGoals = (playerState as { active_goals?: string[] }).active_goals;
  if (activeGoals?.length) {
    const activeGoalsPrompt = getPrompt(PROMPT_KEYS.ACTIVE_GOALS);
    if (activeGoalsPrompt) out.active_goals_instruction = activeGoalsPrompt;
  }

  const hostileFactions = (playerState as { hostile_factions?: string[] }).hostile_factions;
  if (hostileFactions?.length) {
    const hostilePrompt = getPrompt(PROMPT_KEYS.HOSTILE_FACTIONS);
    if (hostilePrompt) out.hostile_factions_instruction = hostilePrompt;
  }

  const pastMilestones = getRecentHistoryLogs(saveData ?? null, PAST_MILESTONES_COUNT);
  if (pastMilestones.length > 0) {
    const pastPrompt = getPrompt(PROMPT_KEYS.PAST_MILESTONES);
    if (pastPrompt) out.past_milestones_instruction = pastPrompt;
  }

  const delayedLetterHint = saveData?.tempData?.delayed_letter_hint as string | undefined;
  if (delayedLetterHint && typeof delayedLetterHint === "string") {
    out.delayed_letter_from = delayedLetterHint;
    const delayedPrompt = getPrompt(PROMPT_KEYS.DELAYED_LETTER);
    if (delayedPrompt) out.delayed_letter_instruction = delayedPrompt;
  }

  if (landmarks?.length) {
    const landmarksPrompt = getPrompt(PROMPT_KEYS.CURRENT_REGION_LANDMARKS);
    if (landmarksPrompt) out.current_region_landmarks_instruction = landmarksPrompt;
  }

  const seasonSensory = getPrompt(PROMPT_KEYS.SEASON_SENSORY);
  if (seasonSensory) out.season_sensory_instruction = seasonSensory;

  if (dialogueRounds >= MEMORY_RESONANCE_MIN_ROUNDS) {
    const crucialTags = getCrucialMemoryTags(saveData ?? null);
    if (crucialTags.length > 0) {
      out.memory_resonance_tags = crucialTags;
      const resonancePrompt = getPrompt(PROMPT_KEYS.MEMORY_RESONANCE);
      if (resonancePrompt) out.memory_resonance_instruction = resonancePrompt;
    }
  }

  return out;
}
