/**
 * 三国 LLM 游戏 · 全维度测试框架
 * Phase 1 - Case 2: 存档安全性与序列化一致性
 */
import { describe, expect, it } from "vitest";

import { SaveManager } from "@services/storage/saveManager";
import type { GameSaveData } from "@core/state";

describe("Auth & State Test - Save/Load Consistency", () => {
  it("serializes and deserializes full saveData with world_state and player_state", () => {
    const manager = new SaveManager();
    const saveData = manager.createNewSave(0, "全量快照测试");
    saveData.world.time = { year: 190, month: 5, day: 10 };
    saveData.world.era = "190";
    saveData.world.flags = ["dongzhuo_defeated", "hejin_dead"];
    saveData.player.location = { region: "xuchang", scene: "palace" };
    saveData.player.resources = { gold: 500, food: 800, soldiers: 100 };
    saveData.dialogueHistory = ["对话1", "对话2", "你：前往许昌"];

    const saved = manager.save(saveData, false);
    expect(saved).toBe(true);

    const loaded = manager.load(0);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.time).toEqual({ year: 190, month: 5, day: 10 });
    expect(loaded!.world.era).toBe("190");
    expect(loaded!.world.flags).toContain("dongzhuo_defeated");
    expect(loaded!.player.location.region).toBe("xuchang");
    expect(loaded!.player.resources.gold).toBe(500);
    expect(loaded!.dialogueHistory.slice(-1)[0]).toBe("你：前往许昌");
  });

  it("preserves timestamp and structure across save/load cycle", () => {
    const manager = new SaveManager();
    const saveData = manager.createNewSave(0, "时间戳测试");
    const createdAt = saveData.meta.createdAt;
    const playerId = saveData.meta.playerId;

    manager.save(saveData, false);
    const loaded = manager.load(0);

    expect(loaded!.meta.createdAt).toBe(createdAt);
    expect(loaded!.meta.playerId).toBe(playerId);
    expect(loaded!.meta.lastSaved).toBeDefined();
  });

  it("export/import round-trip preserves data integrity", () => {
    const manager = new SaveManager();
    const original = manager.createNewSave(0, "导出导入测试");
    original.world.time = { year: 184, month: 2, day: 1 };
    manager.save(original, false);

    const exported = manager.exportSave(0);
    expect(exported).not.toBeNull();

    manager.deleteSave(0);
    const imported = manager.importSave(exported!, 0);
    expect(imported).toBe(true);

    const restored = manager.load(0);
    expect(restored!.world.time.year).toBe(184);
    expect(restored!.meta.saveName).toBe("导出导入测试");
  });
});
