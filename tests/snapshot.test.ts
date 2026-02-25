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

  it("filters out dead NPCs (death_year < current year)", () => {
    const saveData = {
      meta: { version: "1.0.0", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
      player: {
        id: "p1",
        attrs: { strength: 75, intelligence: 82, charm: 68, luck: 55 },
        legend: 30,
        tags: [],
        reputation: 50,
        resources: { gold: 100, food: 200, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" }
      },
      world: { era: "185", flags: [], time: { year: 185, month: 2, day: 1 } },
      npcs: [
        { id: "2001", name: "张角", stance: "neutral", trust: 0, location: "" },
        { id: "2010", name: "曹操", stance: "neutral", trust: 30, location: "chenliu" }
      ],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    const payload = buildAdjudicationPayload({ saveData, playerIntent: "寻找张角" });

    const zhangjiao = payload.npc_state.find((n) => n.id === "2001" || n.name === "张角");
    expect(zhangjiao).toBeUndefined();
    const caocao = payload.npc_state.find((n) => n.id === "2010" || n.name === "曹操");
    expect(caocao).toBeDefined();
  });

  it("includes event_context when recentDialogue is provided", () => {
    const payload = buildAdjudicationPayload({
      saveData: null,
      playerIntent: "test",
      recentDialogue: ["A", "B", "C"]
    });

    expect(payload.event_context).toBeDefined();
    expect(payload.event_context?.recent_dialogue).toEqual(["A", "B", "C"]);
  });
});
