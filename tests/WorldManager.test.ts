import { describe, expect, it } from "vitest";
import { WorldManager, getWorldManager } from "../src/core/WorldManager";
import type { GameSaveData, WorldState, NPCState } from "../src/core/state";
import { calendarToTotalDays } from "../src/core/TimeManager";

function makeSaveData(overrides: Partial<{ world: Partial<WorldState>; npcs: NPCState[] }> = {}): GameSaveData {
  const totalDays = calendarToTotalDays(184, 2, 1);
  return {
    meta: {
      version: "1.0.0",
      createdAt: "2025-01-01T00:00:00.000Z",
      lastSaved: "2025-01-01T00:00:00.000Z",
      playerId: "test_player",
      saveName: "测试",
      saveSlot: 0
    },
    player: {
      id: "test_player",
      attrs: { strength: 50, intelligence: 50, charm: 50, luck: 50 },
      legend: 0,
      tags: [],
      reputation: 50,
      resources: { gold: 0, food: 0, soldiers: 0 },
      location: { region: "yingchuan", scene: "village" }
    },
    world: {
      era: "184",
      flags: [],
      history_flags: [],
      time: { year: 184, month: 2, day: 1 },
      totalDays,
      regionStatus: { jingzhou: "stable", yuzhou: "turmoil", jizhou: "stable" }
    },
    npcs: [
      {
        id: "2001",
        name: "测试NPC",
        birth_year: 160,
        death_year: 220,
        stance: "neutral",
        trust: 50
      }
    ],
    eventLog: [],
    dialogueHistory: [],
    progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" },
    ...overrides
  } as GameSaveData;
}

describe("WorldManager", () => {
  it("getInstance 与 getWorldManager 返回同一单例", () => {
    expect(getWorldManager()).toBe(WorldManager);
  });

  it("updateWorld(deltaDays) 正确推进 totalDays 并映射到 year/month/day", () => {
    const save = makeSaveData();
    const beforeDays = save.world.totalDays ?? 0;
    const { world } = WorldManager.updateWorld(save, 7);
    expect(world.totalDays).toBe(beforeDays + 7);
    expect(world.time).toBeDefined();
    expect(world.time!.year).toBeGreaterThanOrEqual(184);
    expect(world.time!.month).toBeGreaterThanOrEqual(1);
    expect(world.time!.month).toBeLessThanOrEqual(12);
    expect(world.era).toBe(String(world.time!.year));
  });

  it("updateWorld 同步 NPC 的 is_alive 与 current_age", () => {
    const save = makeSaveData({
      world: { time: { year: 200, month: 6, day: 1 }, totalDays: calendarToTotalDays(200, 6, 1) },
      npcs: [
        { id: "a", birth_year: 160, death_year: 220, stance: "", trust: 0 },
        { id: "b", birth_year: 180, death_year: 195, stance: "", trust: 0 }
      ] as NPCState[]
    });
    const { npcs } = WorldManager.updateWorld(save, 0);
    const npcA = npcs.find((n) => n.id === "a");
    const npcB = npcs.find((n) => n.id === "b");
    expect(npcA?.is_alive).toBe(true);
    expect(npcA?.current_age).toBe(40);
    expect(npcB?.is_alive).toBe(false);
    expect(npcB?.current_age).toBe(20);
  });

  it("updateWorld 为各区域刷新 weather", () => {
    const save = makeSaveData();
    const { world } = WorldManager.updateWorld(save, 7);
    expect(world.regions).toBeDefined();
    const keys = WorldManager.getRegionKeys();
    keys.forEach((k) => {
      expect(world.regions![k]).toBeDefined();
      expect(typeof world.regions![k].weather).toBe("string");
      expect(["春雨", "夏暑", "秋燥", "冬雪", "晴", "阴", "风", "雨", "雪"]).toContain(
        world.regions![k].weather
      );
    });
  });

  it("同一 saveData 与 deltaDays 得到确定性结果", () => {
    const save = makeSaveData();
    const r1 = WorldManager.updateWorld(save, 14);
    const r2 = WorldManager.updateWorld(save, 14);
    expect(r1.world.totalDays).toBe(r2.world.totalDays);
    expect(r1.world.time?.year).toBe(r2.world.time?.year);
    expect(r1.world.time?.month).toBe(r2.world.time?.month);
    expect(r1.reports.length).toBe(r2.reports.length);
    r1.reports.forEach((rep, i) => expect(rep).toBe(r2.reports[i]));
  });

  it("战报格式为「YYYY年X，FACTION占领REGION」", () => {
    const save = makeSaveData();
    const { reports } = WorldManager.updateWorld(save, 7);
    reports.forEach((r) => {
      expect(r).toMatch(/^\d+年[春夏秋冬]，.+(占领).+$/);
    });
  });

  it("getFactions 返回势力列表", () => {
    const factions = WorldManager.getFactions();
    expect(Array.isArray(factions)).toBe(true);
    expect(factions.length).toBeGreaterThan(0);
    factions.forEach((f) => {
      expect(f.id).toBeDefined();
      expect(f.name).toBeDefined();
      expect(typeof f.ambition).toBe("number");
      expect(typeof f.power).toBe("number");
    });
  });

  it("deltaDays=0 仅刷新天气与 NPC 状态，不改变时间", () => {
    const save = makeSaveData();
    const beforeTotal = save.world.totalDays ?? 0;
    const { world } = WorldManager.updateWorld(save, 0);
    expect(world.totalDays).toBe(beforeTotal);
    expect(world.time?.year).toBe(save.world.time?.year);
    expect(world.time?.month).toBe(save.world.time?.month);
  });

  it("负 deltaDays 不导致 totalDays 减少（被 clamp）", () => {
    const save = makeSaveData();
    const beforeTotal = save.world.totalDays ?? 0;
    const { world } = WorldManager.updateWorld(save, -100);
    expect(world.totalDays).toBe(beforeTotal);
  });
});
