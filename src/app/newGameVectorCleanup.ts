/**
 * 新游戏前删除该槽位旧存档的向量记忆，便于单测与复用。
 */
import type { GameSaveData } from "@core/state";

export interface SaveManagerLike {
  load(slot: number): GameSaveData | null;
}

export interface VectorMemoryManagerLike {
  deleteBySessionId?(session_id: string): Promise<void>;
}

/**
 * 在覆盖指定槽位为新存档前，删除该槽位已有存档对应的向量记忆（按 session_id = meta.playerId）。
 * 若无旧存档或旧存档无 playerId 或 vectorMemoryManager 未实现 deleteBySessionId，则 no-op。
 * @returns Promise 在删除请求发出后 resolve；调用方可不 await（fire-and-forget）。
 */
export function deleteVectorMemoryForSlotBeforeNewGame(
  saveManager: SaveManagerLike,
  vectorMemoryManager: VectorMemoryManagerLike,
  slot: number
): Promise<void> {
  const oldSave = saveManager.load(slot);
  if (oldSave?.meta?.playerId && vectorMemoryManager.deleteBySessionId) {
    return vectorMemoryManager.deleteBySessionId(oldSave.meta.playerId);
  }
  return Promise.resolve();
}
