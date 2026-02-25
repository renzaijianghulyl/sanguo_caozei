/**
 * 三国 LLM 游戏 · 全维度测试框架
 * Phase 3 - Case 6: 时间跳跃与历史锚点
 */
import { describe, expect, it } from "vitest";

import { buildAdjudicationPayload } from "@core/snapshot";
import { applyHardConstraints } from "@core/preAdjudicator";
import { getEventsInRange } from "@config/worldTimeline";

describe("Logic Evolution Test - Time Jump & Timeline", () => {
  it("advances world_state.time when intent contains time skip", () => {
    const saveData = {
      meta: {
        version: "1.0.0",
        createdAt: "",
        lastSaved: "",
        playerId: "p1",
        saveName: "测试",
        saveSlot: 0
      },
      player: {
        id: "p1",
        attrs: { strength: 70, intelligence: 75, charm: 60, luck: 50 },
        legend: 20,
        tags: ["civilian"],
        reputation: 40,
        resources: { gold: 100, food: 200, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" }
      },
      world: {
        era: "184",
        flags: [],
        time: { year: 184, month: 2, day: 1 }
      },
      npcs: [],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    let payload = buildAdjudicationPayload({
      saveData,
      playerIntent: "闭关 5 年"
    });
    payload = applyHardConstraints(payload);

    expect(payload.logical_results?.time_passed).toBe(5);
    expect(payload.world_state.time.year).toBe(189);
    expect(payload.world_state.time.month).toBe(2);
  });

  it("includes 189 events (灵帝崩殂) in world_changes when jumping 184->189", () => {
    const events = getEventsInRange(184, 189);
    const labels = events.map((e) => e.label);
    expect(labels).toContain("灵帝崩殂");
  });

  it("returns world_changes for 184-190 jump", () => {
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

    let payload = buildAdjudicationPayload({ saveData, playerIntent: "闭关 6 年" });
    payload = applyHardConstraints(payload);

    expect(payload.logical_results?.world_changes).toBeDefined();
    expect(payload.logical_results!.world_changes!.length).toBeGreaterThan(0);
    expect(payload.world_state.time.year).toBe(190);
  });
});
