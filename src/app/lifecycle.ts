/**
 * 生命周期：何时存读档、何时切 phase。
 * 只做编排，具体读写委托给 saveManager 与调用方注入的回调。
 */
import type { GameSaveData } from "@core/state";

export interface RuntimeSaveRef {
  currentSaveData: GameSaveData | null;
}

export interface SaveManagerLike {
  load(slot: number): GameSaveData | null;
  save(saveData: GameSaveData, isAuto: boolean): boolean;
  createNewSave(slot: number, name: string): GameSaveData;
}

export interface ManualSaveOpts {
  appendDialogue: (dialogueHistory: string[], content: string | string[]) => void;
  removeLast: (dialogueHistory: string[]) => void;
  render: () => void;
}

/** 加载指定槽位存档并写回 runtime，由调用方提供 syncFromSave 同步界面 */
export function loadLatestSave(
  saveManager: SaveManagerLike,
  slot: number,
  runtimeRef: RuntimeSaveRef,
  syncFromSave: () => void
): boolean {
  const loaded = saveManager.load(slot);
  if (loaded) {
    runtimeRef.currentSaveData = loaded;
    syncFromSave();
    return true;
  }
  return false;
}

/** 手动存档；若无当前存档则先创建再存；追加提示文案由 opts 提供 */
export function manualSave(
  runtimeRef: RuntimeSaveRef & { dialogueHistory: string[] },
  saveManager: SaveManagerLike,
  opts: ManualSaveOpts
): void {
  if (!runtimeRef.currentSaveData) {
    runtimeRef.currentSaveData = saveManager.createNewSave(0, "手动存档");
  }
  if (saveManager.save(runtimeRef.currentSaveData, false)) {
    opts.appendDialogue(runtimeRef.dialogueHistory, "【游戏已保存】");
    opts.render();
    setTimeout(() => {
      if (runtimeRef.dialogueHistory.at(-1) === "【游戏已保存】") {
        opts.removeLast(runtimeRef.dialogueHistory);
        opts.render();
      }
    }, 5000);
  }
}

/** 切出时立即存档，供 wx.onHide 调用 */
export function onAppHide(runtimeRef: RuntimeSaveRef, saveManager: SaveManagerLike): void {
  if (runtimeRef.currentSaveData) {
    saveManager.save(runtimeRef.currentSaveData, true);
  }
}
