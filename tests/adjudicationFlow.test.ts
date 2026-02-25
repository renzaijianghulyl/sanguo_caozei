/**
 * 裁决流程单测：叙事仅在打字机 onComplete 后写入对话，避免未打完就出现完整一条/叠字
 */
import { describe, expect, it } from "vitest";

import {
  handleAdjudicationResult,
  type HandleAdjudicationResultContext,
  type TypewriterCompletionContext
} from "../src/app/adjudicationFlow";
import type { GameSaveData } from "@core/state";
import type { AdjudicationRequest, AdjudicationResponse } from "@services/network/adjudication";

function minimalSaveData(): GameSaveData {
  return {
    meta: { version: "1", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
    player: {
      id: "p1",
      attrs: { strength: 50, intelligence: 50, charm: 50, luck: 50 },
      legend: 0,
      tags: [],
      reputation: 0,
      resources: { gold: 0, food: 0, soldiers: 0 },
      location: { region: "yingchuan", scene: "village" }
    },
    world: { era: "184", flags: [], time: { year: 184, month: 1, day: 1 } },
    npcs: [],
    eventLog: [],
    dialogueHistory: [],
    progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
  };
}

describe("handleAdjudicationResult - 叙事不入对话直到打字机完成", () => {
  it("打字机 onComplete 调用前，dialogueHistory 不包含叙事；onComplete 后包含", async () => {
    const narrative = "县尉对你点了点头，示意你可以离开了。";
    const response: AdjudicationResponse = {
      result: { narrative, effects: [], suggested_actions: [] }
    };
    const saveData = minimalSaveData();
    const dialogueHistory: string[] = [];

    let typewriterOnComplete: (() => void) | null = null;

    const syncDialogueToRuntime = () => {
      dialogueHistory.length = 0;
      dialogueHistory.push(...saveData.dialogueHistory);
    };

    const completionContext: TypewriterCompletionContext = {
      saveData,
      updatePlayerAttrs: () => {},
      updateWorldState: () => {},
      autoSave: () => {},
      syncFromSave: () => {},
      setSuggestedActions: () => {},
      requestRewardedAd: () => {},
      playAmbientAudio: () => {}
    };

    const ctx: HandleAdjudicationResultContext = {
      saveData,
      requestPayload: undefined,
      setDialogueScrollOffset: () => {},
      addDialogueToSave: (sd, content) => {
        if (Array.isArray(content)) sd.dialogueHistory.push(...content);
        else sd.dialogueHistory.push(content);
      },
      syncDialogueToRuntime,
      startTypewriter: (_text, _isLong, onComplete) => {
        typewriterOnComplete = onComplete;
      },
      applyTypewriterCompletion: () => {},
      completionContext,
      sanitizeNarrative: (n) => Promise.resolve({ allowed: true, text: n }),
      recordSanitizeFailure: () => {}
    };

    handleAdjudicationResult(response, ctx);
    await Promise.resolve();

    expect(typewriterOnComplete).not.toBeNull();
    syncDialogueToRuntime();
    expect(dialogueHistory.some((line) => line.includes(narrative))).toBe(false);

    typewriterOnComplete!();
    syncDialogueToRuntime();
    expect(dialogueHistory.some((line) => line.includes(narrative))).toBe(true);
  });
});
