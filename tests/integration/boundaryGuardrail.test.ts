/**
 * 三国 LLM 游戏 · 全维度测试框架
 * Phase 3 - Case 7: 资源消耗与行为拦截（硬逻辑约束）
 */
import { describe, expect, it } from "vitest";

import { buildAdjudicationPayload } from "@core/snapshot";
import { applyHardConstraints } from "@core/preAdjudicator";

describe("Boundary & Guardrail Test", () => {
  it("sets logic_override for impossible battle (武力不足战吕布)", () => {
    const saveData = {
      meta: { version: "1.0.0", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
      player: {
        id: "p1",
        attrs: { strength: 70, intelligence: 75, charm: 60, luck: 50 },
        legend: 20,
        tags: [],
        reputation: 40,
        resources: { gold: 100, food: 200, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" }
      },
      world: { era: "184", flags: [], time: { year: 184, month: 2, day: 1 } },
      npcs: [],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    let payload = buildAdjudicationPayload({ saveData, playerIntent: "击杀吕布" });
    payload = applyHardConstraints(payload);

    expect(payload.logic_override).toBeDefined();
    expect(payload.logic_override!.reason).toBe("impossible_battle");
    expect(payload.logic_override!.instruction).toContain("武力不足");
  });

  it("does not set logic_override when strength >= 85 for 吕布", () => {
    const saveData = {
      meta: { version: "1.0.0", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
      player: {
        id: "p1",
        attrs: { strength: 90, intelligence: 75, charm: 60, luck: 50 },
        legend: 20,
        tags: [],
        reputation: 40,
        resources: { gold: 100, food: 200, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" }
      },
      world: { era: "184", flags: [], time: { year: 184, month: 2, day: 1 } },
      npcs: [],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    let payload = buildAdjudicationPayload({ saveData, playerIntent: "击杀吕布" });
    payload = applyHardConstraints(payload);

    expect(payload.logic_override).toBeUndefined();
  });

  it("sets logic_override for food:0 长途远征", () => {
    const saveData = {
      meta: { version: "1.0.0", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
      player: {
        id: "p1",
        attrs: { strength: 80, intelligence: 75, charm: 60, luck: 50 },
        legend: 20,
        tags: [],
        reputation: 40,
        resources: { gold: 100, food: 0, soldiers: 50 },
        location: { region: "yingchuan", scene: "village" }
      },
      world: { era: "184", flags: [], time: { year: 184, month: 2, day: 1 } },
      npcs: [],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    let payload = buildAdjudicationPayload({ saveData, playerIntent: "长途远征" });
    payload = applyHardConstraints(payload);

    expect(payload.logic_override).toBeDefined();
    expect(payload.logic_override!.reason).toBe("insufficient_food");
    expect(payload.logic_override!.instruction).toContain("粮草");
  });

  it("keeps payload structure intact after applyHardConstraints", () => {
    const saveData = {
      meta: { version: "1.0.0", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
      player: {
        id: "p1",
        attrs: { strength: 80, intelligence: 82, charm: 68, luck: 55 },
        legend: 30,
        tags: [],
        reputation: 50,
        resources: { gold: 100, food: 200, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" }
      },
      world: { era: "184", flags: [], time: { year: 184, month: 2, day: 1 } },
      npcs: [],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    let payload = buildAdjudicationPayload({ saveData, playerIntent: "前往洛阳" });
    const before = JSON.stringify(payload.player_state);
    payload = applyHardConstraints(payload);

    expect(payload.player_state).toBeDefined();
    expect(payload.world_state).toBeDefined();
    expect(payload.npc_state).toBeDefined();
    expect(JSON.stringify(payload.player_state)).toBe(before);
  });
});
