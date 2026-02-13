import { describe, expect, it } from "vitest";

import { buildAdjudicationPayload } from "@core/snapshot";

describe("buildAdjudicationPayload", () => {
  it("uses defaults when saveData is null", () => {
    const payload = buildAdjudicationPayload({ saveData: null, playerIntent: "前往洛阳" });

    expect(payload.player_intent).toBe("前往洛阳");
    expect(payload.player_state).toBeDefined();
    expect(payload.player_state.location.region).toBe("yingchuan");
    expect(payload.world_state).toBeDefined();
    expect(payload.npc_state).toBeDefined();
    expect(Array.isArray(payload.npc_state)).toBe(true);
  });

  it("uses saveData when provided", () => {
    const saveData = {
      meta: {
        version: "1.0.0",
        createdAt: "",
        lastSaved: "",
        lastAutoSave: undefined,
        playerId: "p1",
        saveName: "测试",
        saveSlot: 0
      },
      player: {
        id: "p1",
        attrs: { strength: 80, intelligence: 70, charm: 60, luck: 50 },
        legend: 40,
        tags: ["warlord"],
        reputation: 60,
        resources: { gold: 200, food: 100, soldiers: 10 },
        location: { region: "luoyang", scene: "palace" }
      },
      world: {
        era: "190",
        flags: ["dongzhuo_defeated"],
        time: { year: 190, month: 5, day: 10 }
      },
      npcs: [
        { id: "caocao", name: "曹操", stance: "friendly", trust: 70, location: "xuchang" }
      ],
      eventLog: [],
      dialogueHistory: ["对话1"],
      progress: {
        totalTurns: 10,
        lastEventId: "e1",
        lastEventTime: ""
      }
    };

    const payload = buildAdjudicationPayload({ saveData, playerIntent: "与曹操交谈" });

    expect(payload.player_state.location.region).toBe("luoyang");
    expect(payload.world_state.era).toBe("190");
    expect(payload.npc_state).toHaveLength(1);
    expect(payload.npc_state[0].id).toBe("caocao");
  });

  it("includes event_context when recentDialogue is provided", () => {
    const payload = buildAdjudicationPayload({
      saveData: null,
      playerIntent: "test",
      recentDialogue: ["A", "B", "C"]
    });

    expect(payload.event_context).toEqual({ recent_dialogue: ["A", "B", "C"] });
  });
});
