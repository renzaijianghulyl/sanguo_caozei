/**
 * 三国 LLM 游戏 · 全维度测试框架
 * Phase 4 - Case 8: 死者识别与存在性验证（filterEntities）
 */
import { describe, expect, it } from "vitest";

import { filterEntities, registerEntity } from "@core/contentRegistry";
import { buildAdjudicationPayload } from "@core/snapshot";

describe("Narrative Filter Test - Post-Mortem Integrity", () => {
  it("filterEntities returns all items when type has no registry", () => {
    const items = [{ id: "guanyu", name: "关羽" }, { id: "zhangfei", name: "张飞" }];
    const filtered = filterEntities("npc", items);
    expect(filtered).toEqual(items);
  });

  it("filterEntities excludes unregistered entities when registry exists", () => {
    registerEntity("npc", "caocao");
    registerEntity("npc", "liubei");
    const items = [
      { id: "caocao", name: "曹操" },
      { id: "guanyu", name: "关羽" },
      { id: "liubei", name: "刘备" }
    ];
    const filtered = filterEntities("npc", items);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((n) => n.id)).toContain("caocao");
    expect(filtered.map((n) => n.id)).toContain("liubei");
    expect(filtered.map((n) => n.id)).not.toContain("guanyu");
  });

  it("buildAdjudicationPayload uses filterEntities for npc_state", () => {
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
      world: { era: "184", flags: [], time: { year: 184, month: 2, day: 1 } },
      npcs: [
        { id: "caocao", name: "曹操", stance: "neutral", trust: 30, location: "chenliu" },
        { id: "guanyu_dead", name: "关羽", stance: "neutral", trust: 0, location: "" }
      ],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    const payload = buildAdjudicationPayload({ saveData, playerIntent: "寻找关羽" });
    expect(payload.npc_state).toBeDefined();
  });
});
