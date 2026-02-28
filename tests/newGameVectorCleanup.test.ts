import { describe, expect, it, vi } from "vitest";
import { deleteVectorMemoryForSlotBeforeNewGame } from "../src/app/newGameVectorCleanup";
import type { GameSaveData } from "../src/core/state";

describe("deleteVectorMemoryForSlotBeforeNewGame", () => {
  it("当槽位有存档且含 meta.playerId 时，会调用 deleteBySessionId 且传入该 playerId", async () => {
    const oldPlayerId = "player_123_456";
    const saveManager = {
      load: vi.fn().mockReturnValue({
        meta: { playerId: oldPlayerId },
        player: {},
        world: {},
        npcs: [],
        dialogueHistory: [],
        eventLog: [],
        progress: {},
        history_logs: []
      } as GameSaveData)
    };
    const vectorMemoryManager = {
      deleteBySessionId: vi.fn().mockResolvedValue(undefined)
    };

    await deleteVectorMemoryForSlotBeforeNewGame(
      saveManager as any,
      vectorMemoryManager as any,
      0
    );

    expect(saveManager.load).toHaveBeenCalledWith(0);
    expect(vectorMemoryManager.deleteBySessionId).toHaveBeenCalledTimes(1);
    expect(vectorMemoryManager.deleteBySessionId).toHaveBeenCalledWith(oldPlayerId);
  });

  it("当槽位无存档（load 返回 null）时，不调用 deleteBySessionId", async () => {
    const saveManager = { load: vi.fn().mockReturnValue(null) };
    const vectorMemoryManager = { deleteBySessionId: vi.fn() };

    await deleteVectorMemoryForSlotBeforeNewGame(
      saveManager as any,
      vectorMemoryManager as any,
      0
    );

    expect(saveManager.load).toHaveBeenCalledWith(0);
    expect(vectorMemoryManager.deleteBySessionId).not.toHaveBeenCalled();
  });

  it("当旧存档无 meta.playerId 时，不调用 deleteBySessionId", async () => {
    const saveManager = {
      load: vi.fn().mockReturnValue({
        meta: { saveName: "无ID存档" },
        player: {},
        world: {},
        npcs: [],
        dialogueHistory: [],
        eventLog: [],
        progress: {},
        history_logs: []
      } as GameSaveData)
    };
    const vectorMemoryManager = { deleteBySessionId: vi.fn() };

    await deleteVectorMemoryForSlotBeforeNewGame(
      saveManager as any,
      vectorMemoryManager as any,
      0
    );

    expect(saveManager.load).toHaveBeenCalledWith(0);
    expect(vectorMemoryManager.deleteBySessionId).not.toHaveBeenCalled();
  });

  it("当 vectorMemoryManager 未实现 deleteBySessionId 时，不报错、不调用", async () => {
    const saveManager = {
      load: vi.fn().mockReturnValue({
        meta: { playerId: "player_999" },
        player: {},
        world: {},
        npcs: [],
        dialogueHistory: [],
        eventLog: [],
        progress: {},
        history_logs: []
      } as GameSaveData)
    };
    const vectorMemoryManager = {} as any;

    await expect(
      deleteVectorMemoryForSlotBeforeNewGame(saveManager as any, vectorMemoryManager, 0)
    ).resolves.toBeUndefined();

    expect(saveManager.load).toHaveBeenCalledWith(0);
  });

  it("对任意 slot 调用 load(slot) 并仅在存在 playerId 时按该 slot 的 playerId 删除", async () => {
    const saveManager = {
      load: vi.fn().mockImplementation((slot: number) =>
        slot === 2
          ? ({
              meta: { playerId: "player_slot2" },
              player: {},
              world: {},
              npcs: [],
              dialogueHistory: [],
              eventLog: [],
              progress: {},
              history_logs: []
            } as GameSaveData)
          : null
      )
    };
    const vectorMemoryManager = { deleteBySessionId: vi.fn().mockResolvedValue(undefined) };

    await deleteVectorMemoryForSlotBeforeNewGame(
      saveManager as any,
      vectorMemoryManager as any,
      2
    );

    expect(saveManager.load).toHaveBeenCalledWith(2);
    expect(vectorMemoryManager.deleteBySessionId).toHaveBeenCalledWith("player_slot2");
  });
});
