import { describe, expect, it } from "vitest";

import { SaveManager } from "@services/storage/saveManager";

describe("SaveManager", () => {
  it("creates new save with unique player id and slot", () => {
    const manager = new SaveManager();
    const saveA = manager.createNewSave(0, "存档A");
    const saveB = manager.createNewSave(1, "存档B");

    expect(saveA.meta.saveSlot).toBe(0);
    expect(saveB.meta.saveSlot).toBe(1);
    expect(saveA.player.id).not.toEqual(saveB.player.id);
  });

  it("trims dialogue history before saving large payload", () => {
    const manager = new SaveManager();
    const saveData = manager.createNewSave(0, "大文本存档");
    saveData.dialogueHistory = Array.from({ length: 200 }, (_, index) => `Line ${index}`);

    const saved = manager.save(saveData, false);
    expect(saved).toBe(true);

    const loaded = manager.load(0);
    expect(loaded).not.toBeNull();
    expect(loaded?.dialogueHistory.length).toBeLessThanOrEqual(100);
    expect(loaded?.dialogueHistory.at(0)).toBe("Line 100");
  });

  it("prevents duplicate log entries for the same event id", () => {
    const manager = new SaveManager();
    const saveData = manager.createNewSave(0, "事件存档");
    const first = manager.logEvent(saveData, "event_alpha");
    const second = manager.logEvent(saveData, "event_alpha");

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(saveData.eventLog.length).toBe(1);
  });

  it("caps dialogue history when using addDialogueHistory helper", () => {
    const manager = new SaveManager();
    const saveData = manager.createNewSave(0, "对话存档");
    manager.addDialogueHistory(saveData, Array.from({ length: 150 }, (_, index) => `Message ${index}`));

    expect(saveData.dialogueHistory.length).toBeLessThanOrEqual(100);
    expect(saveData.dialogueHistory.at(0)).toBeDefined();
  });
});
