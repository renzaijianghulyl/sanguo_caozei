/**
 * 裁决流程：构建请求、应用状态变更、打字机完成回调。
 * 入参显式传 saveData / dialogueHistory 或通过窄接口读写，便于单测与 gameApp 瘦身。
 */
import type { GameSaveData, WorldState } from "@core/state";
import { getWorldManager } from "@core/WorldManager";
import { handlePlayerAction } from "@core/actionHandler";
import { captureFromStateChange, formatLifeSummary } from "@core/historyLog";
import {
  GAME_OVER_WORLD_START_YEAR,
  GAME_OVER_WORLD_YEAR_JIN,
  GAME_OVER_WORLD_YEARS_FROM_START
} from "@config/instructionThresholds";
import { buildAdjudicationPayload } from "@core/snapshot";
import { isTimeSkipIntent } from "@core/instructionPolicies";
import {
  applyAdjudicationResult,
  type PlayerStateDelta,
  type ApplyAdjudicationResultOpts
} from "@core/effectsApplier";
import type { AdjudicationRequest, AdjudicationResponse } from "@services/network/adjudication";
import { normalizeSuggestedActions } from "@services/network/adjudication";
import type { IVectorMemoryManager } from "@services/VectorMemoryManager";
import {
  buildSnapshotSummary,
  narrativeContainsError,
  reportAnomaly
} from "@services/analytics/wechatEvents";
import { replaceModelSelfDisclosure } from "@services/security/contentGuard";

/** 构建裁决请求 payload，纯数据入参。若意图为时间/剧情跳跃，则压缩 recentDialogue 仅保留最近一条以「重置」上下文。可选传入 vectorMemoryManager 以注入相关往事记忆。 */
export async function buildAdjudicationRequest(
  saveData: GameSaveData | null,
  intent: string,
  vectorMemoryManager?: IVectorMemoryManager
): Promise<AdjudicationRequest> {
  const recentDialogue = isTimeSkipIntent(intent)
    ? (saveData?.dialogueHistory?.slice(-1) ?? [])
    : (saveData?.dialogueHistory?.slice(-5) ?? []);
  let relevantMemories: string[] | undefined;
  if (vectorMemoryManager && saveData) {
    relevantMemories = await vectorMemoryManager.retrieveRelevantMemories({
      npc_id: "",
      region_id: saveData.player?.location?.region ?? "",
      session_id: saveData.meta?.playerId ?? "",
      limit: 3
    });
  }
  return buildAdjudicationPayload({
    saveData,
    playerIntent: intent,
    recentDialogue,
    relevantMemories
  });
}

/**
 * 准备裁决 payload：推进世界 7 天、写回 world/npcs/reports、可选文学化传闻、构建请求并应用 handlePlayerAction。
 * 供 gameApp 调用，将「准备阶段」从主控中抽离，便于单测与职责清晰。
 */
export async function prepareIntentPayload(
  saveData: GameSaveData | null,
  intent: string,
  vectorMemoryManager?: IVectorMemoryManager
): Promise<AdjudicationRequest | null> {
  if (!saveData) return null;
  const { world, npcs, reports } = getWorldManager().updateWorld(saveData, 7);
  saveData.world = world;
  saveData.npcs = npcs;
  if (!saveData.tempData) saveData.tempData = {};
  (saveData.tempData as Record<string, unknown>).recentWorldReports = reports;
  if (
    reports.length > 0 &&
    vectorMemoryManager?.literarizeAndSaveRumors &&
    saveData.meta?.playerId
  ) {
    vectorMemoryManager
      .literarizeAndSaveRumors(reports, {
        npc_ids: "",
        region_id: saveData.player?.location?.region ?? "",
        year: saveData.world?.time?.year ?? 184,
        session_id: saveData.meta.playerId
      })
      .catch(() => {});
  }
  const payload = await buildAdjudicationRequest(saveData, intent, vectorMemoryManager);
  const out = handlePlayerAction(payload, saveData);
  if (out.event_context?.consecutive_level1_count != null && saveData.tempData) {
    (saveData.tempData as Record<string, unknown>).consecutive_level1_count =
      out.event_context.consecutive_level1_count;
  }
  return out;
}

export interface TypewriterCompletionContext {
  saveData: GameSaveData | null;
  updatePlayerAttrs: (saveData: GameSaveData, delta: PlayerStateDelta) => void;
  updateWorldState: (saveData: GameSaveData, worldDelta: Partial<WorldState>) => void;
  autoSave: () => void;
  syncFromSave: () => void;
  /** 规范后的建议动作（含 is_aspiration_focused），最多 3 条 */
  setSuggestedActions: (actions: Array<{ text: string; is_aspiration_focused: boolean }>) => void;
  requestRewardedAd: (trigger: string) => void;
  playAmbientAudio: (trigger?: string) => void;
}

/** 打字机播完后应用 effects/世界变更、存档、更新建议动作与音效 */
export function applyTypewriterCompletion(
  response: AdjudicationResponse,
  requestPayload: AdjudicationRequest | undefined,
  ctx: TypewriterCompletionContext
): void {
  const { saveData, updatePlayerAttrs, updateWorldState, autoSave, syncFromSave, setSuggestedActions, requestRewardedAd, playAmbientAudio } = ctx;
  if (saveData) {
    const playerChanges = [
      ...(response.state_changes?.player ?? []),
      ...(response.result?.effects ?? [])
    ];
    const effects = response.result?.effects ?? [];
    const suggestedGoals = response.result?.suggested_goals ?? [];
    const timePassedMonths = requestPayload?.logical_results?.time_passed_months ?? 0;
    let worldDelta: Partial<WorldState> | null = null;
    if (response.state_changes?.world) {
      const raw = { ...response.state_changes.world };
      if (requestPayload?.logical_results?.time_passed != null) delete (raw as Record<string, unknown>).time;
      const worldTime = raw.time as { year?: number; month?: number } | undefined;
      const cur = saveData.world?.time;
      if (worldTime && cur && typeof worldTime.year === "number") {
        const wy = worldTime.year;
        const cy = cur.year ?? 184;
        const wm = worldTime.month ?? 1;
        const cm = cur.month ?? 1;
        if (wy < cy || (wy === cy && wm < cm)) delete (raw as Record<string, unknown>).time;
      }
      const newFlags = raw.history_flags;
      if (newFlags && saveData.world) {
        const existing = saveData.world.history_flags ?? [];
        const added = Array.isArray(newFlags) ? newFlags : [newFlags];
        saveData.world.history_flags = [...new Set([...existing, ...added])];
        delete (raw as Record<string, unknown>).history_flags;
      }
      if (Object.keys(raw).length > 0) worldDelta = raw;
    }
    const opts: ApplyAdjudicationResultOpts = {
      playerChanges,
      effects,
      suggestedGoals,
      worldDelta,
      timePassedMonths
    };
    applyAdjudicationResult(saveData, opts, { updatePlayerAttrs, updateWorldState });
    autoSave();
    syncFromSave();
    if (response.result?.suggested_actions != null) {
      const normalized = normalizeSuggestedActions(response.result.suggested_actions);
      if (normalized.length >= 2) setSuggestedActions(normalized);
    }
  }
  const effects = response.result?.effects ?? [];
  if (effects.some((e) => e.includes("legend+") || e.includes("gold+"))) {
    requestRewardedAd("legend-boost");
  }
  const trigger = response.audio_trigger ?? requestPayload?.logical_results?.audio_trigger;
  playAmbientAudio(trigger);
}

export interface SanitizeResult {
  allowed: boolean;
  text?: string;
  reason?: string;
}

export interface HandleAdjudicationResultContext {
  saveData: GameSaveData | null;
  requestPayload: AdjudicationRequest | undefined;
  setDialogueScrollOffset: (n: number) => void;
  addDialogueToSave: (saveData: GameSaveData, content: string | string[]) => void;
  syncDialogueToRuntime: () => void;
  startTypewriter: (text: string, isLongNarrative: boolean, onComplete: () => void) => void;
  applyTypewriterCompletion: (
    response: AdjudicationResponse,
    requestPayload: AdjudicationRequest | undefined,
    ctx: TypewriterCompletionContext
  ) => void;
  completionContext: TypewriterCompletionContext;
  sanitizeNarrative: (narrative: string) => Promise<SanitizeResult>;
  recordSanitizeFailure: (narrative: string, reason?: string) => void;
  /** 核心引擎 2.0：可选，裁决完成后将剧情摘要写入向量记忆 */
  vectorMemoryManager?: IVectorMemoryManager;
  /** 若存在，裁决结果应用后健康度≤0、殒命、60年或三国归晋时调用；(reason, lifeSummary?) */
  onGameOver?: (reason: string, lifeSummary?: string) => void;
}

/** 处理裁决 API 返回：安全审核叙事、立即写存档、启动打字机，打字机完成时调用 applyTypewriterCompletion */
export function handleAdjudicationResult(
  response: AdjudicationResponse,
  ctx: HandleAdjudicationResultContext
): void {
  ctx.setDialogueScrollOffset(0);
  const rawNarrative = response.result?.narrative;
  let narrative: string =
    rawNarrative != null && String(rawNarrative).trim() !== ""
      ? (typeof rawNarrative === "string" ? rawNarrative : String(rawNarrative))
      : "（未收到剧情，请检查云函数配置或重试）";
  narrative = narrative.trim() || "（未收到剧情，请检查云函数配置或重试）";

  narrative = replaceModelSelfDisclosure(narrative);

  if (narrativeContainsError(narrative) && ctx.requestPayload) {
    reportAnomaly("llm_error", buildSnapshotSummary(ctx.requestPayload, { lastNarrativePreview: narrative }));
  }

  /** 仅持久化状态（玩家/世界/NPC），不写入叙事；叙事等打字机播完再入对话，避免未打完就出现完整一条 */
  const applyStateAndPersistImmediately = () => {
    const { saveData, requestPayload } = ctx;
    if (!saveData || !requestPayload) return;
    if (requestPayload.logical_results) {
      const p = requestPayload.player_state;
      const lr = requestPayload.logical_results;
      saveData.player = {
        ...p,
        attrs: { ...p.attrs },
        resources: { ...p.resources },
        location: { ...p.location }
      };
      const staminaCost = lr.stamina_cost ?? 0;
      const prevStamina = saveData.player.stamina ?? 1000;
      saveData.player.stamina = Math.max(0, prevStamina - staminaCost);
      const prevHealth = saveData.player.health ?? 100;
      const healthDelta = lr.health_delta ?? 0;
      saveData.player.health = Math.max(0, Math.min(100, Math.round(prevHealth + healthDelta)));
      if (typeof lr.infamy_delta === "number" && lr.infamy_delta > 0) {
        saveData.player.infamy = Math.max(0, (saveData.player.infamy ?? 0) + lr.infamy_delta);
      }
      if (lr.hostile_faction_add?.trim()) {
        const id = lr.hostile_faction_add.trim().slice(0, 32);
        const list = saveData.player.hostile_factions ?? [];
        if (!list.includes(id)) {
          saveData.player.hostile_factions = [...list, id].slice(-10);
        }
      }
      const w = requestPayload.world_state;
      saveData.world = { ...w, time: { ...w.time } };
      saveData.npcs = requestPayload.npc_state.map((n) => ({ ...n }));

      const worldYear = saveData.world?.time?.year ?? 184;
      const lifeSummary = formatLifeSummary(saveData);

      let gameOverReason: string | undefined =
        lr.game_over_reason?.trim() || (saveData.player.health <= 0 ? "意外殒命" : undefined);
      if (!gameOverReason && worldYear >= GAME_OVER_WORLD_YEAR_JIN) {
        gameOverReason = "三国归晋，天下已定";
      }
      if (!gameOverReason && worldYear >= GAME_OVER_WORLD_START_YEAR + GAME_OVER_WORLD_YEARS_FROM_START) {
        gameOverReason = "历经六十载，时代更迭";
      }

      if (gameOverReason) {
        if (!saveData.tempData) saveData.tempData = {};
        (saveData.tempData as Record<string, unknown>).game_over_reason = gameOverReason;
        ctx.onGameOver?.(gameOverReason, lifeSummary);
      }
    }
  };

  const startTypewriter = (text: string, isLongNarrative: boolean) => {
    ctx.startTypewriter(text, isLongNarrative, () => {
      if (ctx.saveData) ctx.addDialogueToSave(ctx.saveData, text);
      ctx.syncDialogueToRuntime();
    });
  };

  const skipMonths = ctx.requestPayload?.logical_results?.time_passed_months ?? 0;
  const isLongNarrative = skipMonths >= 12;

  ctx
    .sanitizeNarrative(narrative)
    .then((result) => {
      const saveData = ctx.saveData;
      const prevWorld =
        saveData?.world != null
          ? { ...saveData.world, time: saveData.world.time ? { ...saveData.world.time } : undefined }
          : undefined;
      const prevPlayerRegion = saveData?.player?.location?.region;

      if (!result.allowed) ctx.recordSanitizeFailure(narrative, result.reason);
      const text = result.allowed && result.text ? result.text : result.reason ?? "内容暂时不可用";
      applyStateAndPersistImmediately();
      ctx.applyTypewriterCompletion(response, ctx.requestPayload, ctx.completionContext);
      if (ctx.saveData?.player != null && (ctx.saveData.player.health ?? 100) <= 0) {
        ctx.onGameOver?.("意外殒命", formatLifeSummary(ctx.saveData));
      }
      if (saveData) {
        captureFromStateChange(saveData, { world: prevWorld ?? undefined, playerRegion: prevPlayerRegion }, {
          worldChanges: ctx.requestPayload?.logical_results?.world_changes,
          effects: response.result?.effects
        });
        if (ctx.vectorMemoryManager && saveData.meta?.playerId) {
          const meta = {
            npc_ids: "",
            region_id: saveData.player?.location?.region ?? "",
            year: saveData.world?.time?.year ?? 184,
            session_id: saveData.meta.playerId
          };
          if (ctx.vectorMemoryManager.saveDialogueAndSummarize) {
            const dialogue = `玩家：${ctx.requestPayload?.player_intent ?? ""}\n旁白：${text}`;
            ctx.vectorMemoryManager.saveDialogueAndSummarize(dialogue.slice(0, 4000), meta).catch(() => {});
          } else {
            ctx.vectorMemoryManager.saveInteraction(text.slice(0, 300), meta).catch(() => {});
          }
        }
      }
      startTypewriter(text, isLongNarrative);
    })
    .catch(() => {
      ctx.recordSanitizeFailure(narrative);
      applyStateAndPersistImmediately();
      ctx.applyTypewriterCompletion(response, ctx.requestPayload, ctx.completionContext);
      if (ctx.saveData?.player != null && (ctx.saveData.player.health ?? 100) <= 0) {
        ctx.onGameOver?.("意外殒命", formatLifeSummary(ctx.saveData));
      }
      startTypewriter(narrative, false);
    });
}
