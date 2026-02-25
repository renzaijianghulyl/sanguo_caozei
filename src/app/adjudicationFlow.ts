/**
 * 裁决流程：构建请求、应用状态变更、打字机完成回调。
 * 入参显式传 saveData / dialogueHistory 或通过窄接口读写，便于单测与 gameApp 瘦身。
 */
import type { GameSaveData, WorldState } from "@core/state";
import { captureFromStateChange } from "@core/historyLog";
import { buildAdjudicationPayload } from "@core/snapshot";
import {
  computePlayerStateDelta,
  applyNpcRelationEffects as applyNpcRelationEffectsCore,
  applyActiveGoalsUpdate,
  applyHostileFactionFromEffects,
  applyTimeLapseSideEffects,
  type PlayerStateDelta
} from "@core/effectsApplier";
import type { AdjudicationRequest, AdjudicationResponse } from "@services/network/adjudication";

/** 构建裁决请求 payload，纯数据入参 */
export function buildAdjudicationRequest(
  saveData: GameSaveData | null,
  intent: string
): AdjudicationRequest {
  return buildAdjudicationPayload({
    saveData,
    playerIntent: intent,
    recentDialogue: saveData?.dialogueHistory?.slice(-5)
  });
}

/** 将 effects 解析后的玩家增量写回存档，由调用方注入 updater */
export function applyPlayerStateChanges(
  saveData: GameSaveData,
  changes: string[],
  updatePlayerAttrs: (saveData: GameSaveData, delta: PlayerStateDelta) => void
): void {
  const delta = computePlayerStateDelta(changes);
  updatePlayerAttrs(saveData, delta);
}

/** 应用 NPC 好感/关系 effects，就地修改 saveData.npcs */
export function applyNpcRelationEffects(saveData: GameSaveData, effects: string[]): void {
  if (!saveData.npcs?.length) return;
  const year = saveData.world?.time?.year ?? 184;
  applyNpcRelationEffectsCore(saveData, effects, year);
}

export interface TypewriterCompletionContext {
  saveData: GameSaveData | null;
  updatePlayerAttrs: (saveData: GameSaveData, delta: PlayerStateDelta) => void;
  updateWorldState: (saveData: GameSaveData, worldDelta: Partial<WorldState>) => void;
  autoSave: () => void;
  syncFromSave: () => void;
  setSuggestedActions: (actions: string[]) => void;
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
    if (response.state_changes?.player?.length) {
      applyPlayerStateChanges(saveData, response.state_changes.player, updatePlayerAttrs);
    }
    if (response.result?.effects?.length) {
      applyPlayerStateChanges(saveData, response.result.effects, updatePlayerAttrs);
      applyNpcRelationEffects(saveData, response.result.effects);
      applyHostileFactionFromEffects(saveData, response.result.effects);
    }
    if (response.result?.suggested_goals?.length) {
      applyActiveGoalsUpdate(saveData, response.result.suggested_goals);
    }
    const timePassedMonths = requestPayload?.logical_results?.time_passed_months ?? 0;
    if (timePassedMonths >= 1) {
      applyTimeLapseSideEffects(saveData, timePassedMonths);
    }
    if (response.state_changes?.world) {
      const worldDelta = { ...response.state_changes.world };
      if (requestPayload?.logical_results?.time_passed != null) delete (worldDelta as Record<string, unknown>).time;
      // 时序单向递增：若 LLM 返回的 time 早于当前存档时间，则忽略，确保时间轴不回溯
      const worldTime = worldDelta.time as { year?: number; month?: number } | undefined;
      const cur = saveData.world?.time;
      if (worldTime && cur && typeof worldTime.year === "number") {
        const wy = worldTime.year;
        const cy = cur.year ?? 184;
        const wm = worldTime.month ?? 1;
        const cm = cur.month ?? 1;
        if (wy < cy || (wy === cy && wm < cm)) delete (worldDelta as Record<string, unknown>).time;
      }
      const newFlags = worldDelta.history_flags;
      if (newFlags && saveData.world) {
        const existing = saveData.world.history_flags ?? [];
        const added = Array.isArray(newFlags) ? newFlags : [newFlags];
        saveData.world.history_flags = [...new Set([...existing, ...added])];
        delete (worldDelta as Record<string, unknown>).history_flags;
      }
      if (Object.keys(worldDelta).length > 0) {
        updateWorldState(saveData, worldDelta);
      }
    }
    autoSave();
    syncFromSave();
    if (response.result?.suggested_actions && response.result.suggested_actions.length >= 2) {
      setSuggestedActions(response.result.suggested_actions.slice(0, 2));
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
}

/** 处理裁决 API 返回：安全审核叙事、立即写存档、启动打字机，打字机完成时调用 applyTypewriterCompletion */
export function handleAdjudicationResult(
  response: AdjudicationResponse,
  ctx: HandleAdjudicationResultContext
): void {
  ctx.setDialogueScrollOffset(0);
  const narrative =
    response.result?.narrative != null && String(response.result.narrative).trim() !== ""
      ? response.result.narrative
      : "（未收到剧情，请检查云函数配置或重试）";

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
      const prevStamina = saveData.player.stamina ?? 80;
      saveData.player.stamina = Math.max(0, prevStamina - staminaCost);
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

      if (saveData) {
        captureFromStateChange(saveData, { world: prevWorld ?? undefined, playerRegion: prevPlayerRegion }, {
          worldChanges: ctx.requestPayload?.logical_results?.world_changes,
          effects: response.result?.effects
        });
      }
      startTypewriter(text, isLongNarrative);
    })
    .catch(() => {
      ctx.recordSanitizeFailure(narrative);
      applyStateAndPersistImmediately();
      ctx.applyTypewriterCompletion(response, ctx.requestPayload, ctx.completionContext);
      startTypewriter(narrative, false);
    });
}
