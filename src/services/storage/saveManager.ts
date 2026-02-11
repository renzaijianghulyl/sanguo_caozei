import { ClientConfig, DEFAULT_NPC_STATE, DEFAULT_PLAYER_STATE, DEFAULT_WORLD_STATE } from "@config/index";
import type { GameSaveData, NPCState, PlayerState, WorldState } from "@core/state";

const SAVE_VERSION = "1.0.0";
const STORAGE_KEY_PREFIX = "sanguo_save_";

type StorageLike = {
  setItem(key: string, value: string): void;
  getItem(key: string): string | undefined;
  removeItem(key: string): void;
  getAllKeys(): string[];
};

function cloneDeep<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload));
}

function createDefaultSave(): GameSaveData {
  const now = new Date().toISOString();
  const basePlayer: PlayerState = cloneDeep(DEFAULT_PLAYER_STATE);
  const baseWorld: WorldState = cloneDeep(DEFAULT_WORLD_STATE);
  const baseNpcs: NPCState[] = cloneDeep(DEFAULT_NPC_STATE);

  return {
    meta: {
      version: SAVE_VERSION,
      createdAt: now,
      lastSaved: now,
      playerId: basePlayer.id,
      saveName: "默认存档",
      saveSlot: 0
    },
    player: basePlayer,
    world: baseWorld,
    npcs: baseNpcs,
    eventLog: [],
    dialogueHistory: [
      "建宁元年（公元168年），你醒来发现自己身处洛阳城外的小村庄。",
      "村中长者告诉你，黄巾之乱即将爆发，天下将乱。",
      "你可以选择投靠官府，也可以暗中结交豪杰，甚至加入太平道……"
    ],
    progress: {
      totalTurns: 0,
      lastEventId: "",
      lastEventTime: now
    }
  };
}

class WXStorage implements StorageLike {
  private readonly useMock: boolean;
  private mockStorage: Record<string, string> = {};

  constructor() {
    this.useMock = typeof wx === "undefined" || typeof wx.setStorageSync !== "function";
    if (this.useMock) {
      console.warn("微信小游戏存储 API 不可用，使用内存模拟。");
    }
  }

  setItem(key: string, value: string): void {
    if (this.useMock) {
      this.mockStorage[key] = value;
      return;
    }
    wx.setStorageSync(key, value);
  }

  getItem(key: string): string | undefined {
    if (this.useMock) {
      return this.mockStorage[key];
    }
    const data = wx.getStorageSync(key);
    return data === "" ? undefined : data;
  }

  removeItem(key: string): void {
    if (this.useMock) {
      delete this.mockStorage[key];
      return;
    }
    wx.removeStorageSync(key);
  }

  getAllKeys(): string[] {
    if (this.useMock) {
      return Object.keys(this.mockStorage);
    }
    const info = wx.getStorageInfoSync();
    return info.keys;
  }

  getStorageSizeBytes(): number {
    if (this.useMock) {
      return Object.values(this.mockStorage).reduce((sum, value) => sum + value.length, 0);
    }
    const info = wx.getStorageInfoSync();
    return info.currentSize * 1024;
  }

  isMock(): boolean {
    return this.useMock;
  }
}

export class SaveManager {
  private currentSlot = 0;
  private autoSaveEnabled = true;
  private autoSaveInterval = 30;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private storageLimits = {
    maxSingleKeySize: 1_048_576,
    maxTotalSize: 10_485_760,
    maxDialogueHistory: 100,
    maxEventLog: 500,
    warningThreshold: 0.8
  };

  private storage = new WXStorage();

  init(): boolean {
    console.log("存档系统初始化");
    this.startAutoSave();
    return true;
  }

  generatePlayerId(): string {
    return `player_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
  }

  createNewSave(slot = 0, saveName = "新建存档"): GameSaveData {
    const data = cloneDeep(createDefaultSave());
    const playerId = this.generatePlayerId();
    const now = new Date().toISOString();
    data.meta = {
      ...data.meta,
      playerId,
      createdAt: now,
      lastSaved: now,
      saveName,
      saveSlot: slot
    };
    data.player.id = playerId;
    this.currentSlot = slot;
    return data;
  }

  private optimizeSaveData(saveData: GameSaveData): GameSaveData {
    const draft = cloneDeep(saveData);
    if (draft.dialogueHistory.length > this.storageLimits.maxDialogueHistory) {
      draft.dialogueHistory = draft.dialogueHistory.slice(-this.storageLimits.maxDialogueHistory);
    }
    if (draft.eventLog.length > this.storageLimits.maxEventLog) {
      draft.eventLog = draft.eventLog.slice(-this.storageLimits.maxEventLog);
    }
    delete draft.tempData;
    return draft;
  }

  private checkSaveSize(payload: GameSaveData) {
    try {
      const serialized = JSON.stringify(payload);
      const size = new Blob([serialized]).size;
      const withinLimit = size <= this.storageLimits.maxSingleKeySize;
      return {
        size,
        withinLimit,
        warning:
          size > this.storageLimits.maxSingleKeySize * this.storageLimits.warningThreshold
            ? `存档大小 ${size} 字节接近单键限制`
            : null
      };
    } catch (error) {
      console.error("检查存档大小失败:", error);
      return {
        size: 0,
        withinLimit: false,
        warning: null
      };
    }
  }

  private checkTotalStorage() {
    try {
      const totalUsed = this.storage.getStorageSizeBytes();
      const usage = totalUsed / this.storageLimits.maxTotalSize;
      return {
        totalSize: totalUsed,
        usagePercentage: usage,
        withinLimit: totalUsed <= this.storageLimits.maxTotalSize,
        warning:
          usage > this.storageLimits.warningThreshold
            ? `存储使用率 ${(usage * 100).toFixed(1)}% 接近上限`
            : null
      };
    } catch (error) {
      console.error("检查存储使用情况失败:", error);
      return null;
    }
  }

  save(saveData: GameSaveData, isAuto = false): boolean {
    if (!saveData) {
      console.error("存档数据不能为空");
      return false;
    }

    const now = new Date().toISOString();
    saveData.meta.lastSaved = now;
    if (isAuto) {
      saveData.meta.lastAutoSave = now;
    }

    const optimized = this.optimizeSaveData(saveData);
    const sizeResult = this.checkSaveSize(optimized);

    if (!sizeResult.withinLimit) {
      console.error(`存档大小 ${sizeResult.size} 字节超过限制，尝试裁剪...`);
      optimized.dialogueHistory = optimized.dialogueHistory.slice(-50);
      optimized.eventLog = optimized.eventLog.slice(-100);

      if (!this.checkSaveSize(optimized).withinLimit) {
        console.error("裁剪后仍超过限制，保存失败");
        return false;
      }
    }

    if (sizeResult.warning) {
      console.warn(sizeResult.warning);
    }
    const totalInfo = this.checkTotalStorage();
    if (totalInfo?.warning) {
      console.warn(totalInfo.warning);
    }

    const storageKey = `${STORAGE_KEY_PREFIX}${this.currentSlot}`;
    try {
      const payload = JSON.stringify(optimized);
      this.storage.setItem(storageKey, payload);
      console.log(`存档保存成功（${isAuto ? "自动" : "手动"}），槽位: ${this.currentSlot}`);
      return true;
    } catch (error) {
      console.error("存档保存失败:", error);
      return false;
    }
  }

  private readSlot(slot: number): GameSaveData | null {
    const storageKey = `${STORAGE_KEY_PREFIX}${slot}`;
    try {
      const payload = this.storage.getItem(storageKey);
      if (!payload) {
        return null;
      }
      const data: GameSaveData = JSON.parse(payload);
      if (data.meta.version !== SAVE_VERSION) {
        console.warn(`存档版本不匹配: ${data.meta.version} -> ${SAVE_VERSION}`);
      }
      return data;
    } catch (error) {
      console.error("存档读取失败:", error);
      return null;
    }
  }

  load(slot: number | null = null): GameSaveData | null {
    const targetSlot = slot ?? this.currentSlot;
    try {
      const data = this.readSlot(targetSlot);
      if (!data) {
        console.log(`存档槽位 ${targetSlot} 不存在`);
        return null;
      }
      this.currentSlot = targetSlot;
      return data;
    } catch (error) {
      console.error("存档加载失败:", error);
      return null;
    }
  }

  deleteSave(slot: number): boolean {
    const storageKey = `${STORAGE_KEY_PREFIX}${slot}`;
    try {
      this.storage.removeItem(storageKey);
      console.log(`存档删除成功，槽位: ${slot}`);
      return true;
    } catch (error) {
      console.error("存档删除失败:", error);
      return false;
    }
  }

  getSaveList(): Array<{
    slot: number;
    name: string;
    playerId: string;
    lastSaved: string;
    era: string;
    location: string;
  }> {
    const saves: Array<{
      slot: number;
      name: string;
      playerId: string;
      lastSaved: string;
      era: string;
      location: string;
    }> = [];

    for (let slot = 0; slot < 10; slot += 1) {
      const data = this.readSlot(slot);
      if (data) {
        saves.push({
          slot,
          name: data.meta.saveName,
          playerId: data.meta.playerId,
          lastSaved: data.meta.lastSaved,
          era: data.world.era,
          location: data.player.location.region
        });
      }
    }

    return saves;
  }

  logEvent(saveData: GameSaveData, eventId: string, playerId?: string): boolean {
    if (!saveData || !eventId) {
      console.error("logEvent 参数错误");
      return false;
    }
    const targetPlayerId = playerId || saveData.player.id;
    if (saveData.eventLog.some((event) => event.eventId === eventId && event.playerId === targetPlayerId)) {
      return true;
    }
    const now = new Date().toISOString();
    saveData.eventLog.push({
      eventId,
      playerId: targetPlayerId,
      triggeredAt: now,
      recordedAt: now
    });
    saveData.progress.lastEventId = eventId;
    saveData.progress.lastEventTime = now;
    saveData.progress.totalTurns += 1;
    return true;
  }

  isEventTriggered(saveData: GameSaveData, eventId: string): boolean {
    if (!saveData || !eventId) {
      return false;
    }
    return saveData.eventLog.some((event) => event.eventId === eventId && event.playerId === saveData.player.id);
  }

  updatePlayerAttributes(
    saveData: GameSaveData,
    delta: Partial<{
      attrs: Partial<PlayerState["attrs"]>;
      legend: number;
      reputation: number;
      resources: Partial<PlayerState["resources"]>;
    }>
  ): GameSaveData {
    if (!saveData || !delta) {
      return saveData;
    }
    if (delta.attrs) {
      Object.entries(delta.attrs).forEach(([key, value]) => {
        if (typeof value === "number" && key in saveData.player.attrs) {
          const next = saveData.player.attrs[key as keyof PlayerState["attrs"]] + value;
          saveData.player.attrs[key as keyof PlayerState["attrs"]] = Math.max(0, Math.min(100, next));
        }
      });
    }
    if (typeof delta.legend === "number") {
      saveData.player.legend = Math.max(0, saveData.player.legend + delta.legend);
    }
    if (typeof delta.reputation === "number") {
      const next = saveData.player.reputation + delta.reputation;
      saveData.player.reputation = Math.max(0, Math.min(100, next));
    }
    if (delta.resources) {
      Object.entries(delta.resources).forEach(([key, value]) => {
        if (typeof value === "number" && key in saveData.player.resources) {
          const next = saveData.player.resources[key as keyof PlayerState["resources"]] + value;
          saveData.player.resources[key as keyof PlayerState["resources"]] = Math.max(0, next);
        }
      });
    }
    return saveData;
  }

  updateWorldState(saveData: GameSaveData, delta: Partial<WorldState>): GameSaveData {
    if (!saveData || !delta) {
      return saveData;
    }
    if (delta.era) {
      saveData.world.era = delta.era;
    }
    if (delta.flags) {
      delta.flags.forEach((flag) => {
        if (!saveData.world.flags.includes(flag)) {
          saveData.world.flags.push(flag);
        }
      });
    }
    if (delta.time) {
      saveData.world.time = { ...saveData.world.time, ...delta.time };
    }
    if (delta.regions) {
      saveData.world.regions = saveData.world.regions || {};
      Object.entries(delta.regions).forEach(([regionKey, regionState]) => {
        saveData.world.regions![regionKey] = {
          ...(saveData.world.regions![regionKey] || {}),
          ...regionState
        };
      });
    }
    return saveData;
  }

  addDialogueHistory(saveData: GameSaveData, content: string | string[]): GameSaveData {
    if (!saveData || !content) {
      return saveData;
    }
    if (Array.isArray(content)) {
      saveData.dialogueHistory.push(...content);
    } else {
      saveData.dialogueHistory.push(content);
    }
    if (saveData.dialogueHistory.length > this.storageLimits.maxDialogueHistory) {
      saveData.dialogueHistory = saveData.dialogueHistory.slice(-this.storageLimits.maxDialogueHistory);
    }
    return saveData;
  }

  startAutoSave(): void {
    if (!this.autoSaveEnabled || this.autoSaveTimer) {
      return;
    }
    this.autoSaveTimer = setInterval(() => {
      const saveData = this.load(this.currentSlot);
      if (saveData) {
        this.save(saveData, true);
      }
    }, this.autoSaveInterval * 1000);
    console.log(`自动保存已启动，间隔: ${this.autoSaveInterval} 秒`);
  }

  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log("自动保存已停止");
    }
  }

  setAutoSaveInterval(seconds: number): void {
    this.autoSaveInterval = Math.max(10, seconds);
    if (this.autoSaveTimer) {
      this.stopAutoSave();
      this.startAutoSave();
    }
  }

  exportSave(slot: number | null = null): string | null {
    const saveData = this.load(slot ?? this.currentSlot);
    return saveData ? JSON.stringify(saveData, null, 2) : null;
  }

  importSave(payload: string, slot?: number): boolean {
    try {
      const parsed: GameSaveData = JSON.parse(payload);
      if (!parsed.meta || !parsed.player) {
        throw new Error("存档格式无效");
      }
      if (typeof slot === "number") {
        this.currentSlot = slot;
      }
      return this.save(parsed, false);
    } catch (error) {
      console.error("导入存档失败:", error);
      return false;
    }
  }

  getStorageInfo() {
    if (this.storage.isMock()) {
      return {
        total: this.storageLimits.maxTotalSize,
        used: 0,
        available: this.storageLimits.maxTotalSize,
        usagePercentage: 0
      };
    }
    try {
      const info = wx.getStorageInfoSync();
      return {
        total: this.storageLimits.maxTotalSize,
        used: info.currentSize * 1024,
        available: this.storageLimits.maxTotalSize - info.currentSize * 1024,
        usagePercentage: info.currentSize / 10240,
        keys: info.keys
      };
    } catch (error) {
      console.error("获取存储信息失败:", error);
      return null;
    }
  }
}

export const saveManager = new SaveManager();
export { SAVE_VERSION, STORAGE_KEY_PREFIX, ClientConfig as SaveManagerConfig };
