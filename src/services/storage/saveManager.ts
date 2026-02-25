import {
  ATTR_BASE,
  ClientConfig,
  DEFAULT_NPC_STATE,
  DEFAULT_PLAYER_STATE,
  DEFAULT_WORLD_STATE,
  INITIAL_DIALOGUE
} from "@config/index";
import type {
  AmbitionType,
  GameSaveData,
  NPCState,
  PlayerAttributes,
  PlayerState,
  WorldState
} from "@core/state";
import { ensureBond } from "@core/RelationManager";

const SAVE_VERSION = "1.0.0";

/** 存档迁移：Bond 新字段、history_flags、active_titles 等，保证旧档可读 */
function migrateSaveData(data: GameSaveData): GameSaveData {
  const world = data.world;
  const time = world?.time;
  const worldTime = time ? { year: time.year, month: time.month ?? 1 } : { year: 184, month: 1 };

  if (world && world.history_flags === undefined) {
    (world as WorldState).history_flags = [];
  }
  if (data.player && (data.player as PlayerState & { active_titles?: string[] }).active_titles === undefined) {
    (data.player as PlayerState & { active_titles: string[] }).active_titles = [];
  }
  if (data.history_logs === undefined) {
    (data as GameSaveData).history_logs = [];
  }
  if (data.npcs?.length) {
    data.npcs.forEach((npc) => ensureBond(npc, worldTime));
  }
  return data;
}

/** 修正旧存档中错误的开局年份文案：168年→184年，建安元年→中平元年 */
function migrateDialogueYear(dialogueHistory: string[]): string[] {
  return dialogueHistory.map((line) =>
    line
      .replace(/建[安宁]元年\s*（\s*公元\s*168\s*年\s*）/g, "中平元年（公元184年）")
      .replace(/公元\s*168\s*年/g, "公元184年")
      .replace(/168\s*年/g, "184年")
  );
}

type StorageLike = {
  setItem(key: string, value: string): void;
  getItem(key: string): string | undefined;
  removeItem(key: string): void;
  getAllKeys(): string[];
  getSizeBytes(): number;
};

function createStorage(): StorageLike {
  if (typeof wx !== "undefined" && typeof wx.setStorageSync === "function") {
    return {
      setItem(k, v) {
        wx.setStorageSync(k, v);
      },
      getItem(k) {
        const v = wx.getStorageSync(k);
        return v === "" ? undefined : v;
      },
      removeItem(k) {
        wx.removeStorageSync(k);
      },
      getAllKeys() {
        return wx.getStorageInfoSync().keys;
      },
      getSizeBytes() {
        return wx.getStorageInfoSync().currentSize * 1024;
      }
    };
  }
  const mem = new Map<string, string>();
  return {
    setItem(k, v) {
      mem.set(k, v);
    },
    getItem(k) {
      return mem.get(k);
    },
    removeItem(k) {
      mem.delete(k);
    },
    getAllKeys() {
      return Array.from(mem.keys());
    },
    getSizeBytes() {
      return Array.from(mem.values()).reduce((s, v) => s + v.length, 0);
    }
  };
}
const STORAGE_KEY_PREFIX = "sanguo_save_";

function cloneDeep<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload));
}

function calculatePayloadSize(serialized: string): number {
  if (typeof Blob !== "undefined") {
    return new Blob([serialized]).size;
  }
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(serialized).length;
  }
  return serialized.length * 2;
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
    dialogueHistory: [...INITIAL_DIALOGUE],
    progress: {
      totalTurns: 0,
      lastEventId: "",
      lastEventTime: now
    },
    history_logs: []
  };
}

export class SaveManager {
  private currentSlot = 0;
  private autoSaveEnabled = true;
  private autoSaveInterval = 20;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private storageLimits = {
    maxSingleKeySize: 1_048_576,
    maxTotalSize: 10_485_760,
    maxDialogueHistory: 100,
    maxEventLog: 500,
    warningThreshold: 0.8
  };

  private storage = createStorage();

  init(): boolean {
    console.log("存档系统初始化");
    this.startAutoSave();
    return true;
  }

  generatePlayerId(): string {
    return `player_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
  }

  createNewSave(slot = 0, saveName = "新建存档"): GameSaveData {
    return this.createNewSaveWithConfig(slot, saveName, null);
  }

  /**
   * 创建新存档，支持自定义玩家配置（姓名、性别、属性）
   */
  createNewSaveWithConfig(
    slot = 0,
    saveName: string,
    playerConfig: {
      name: string;
      gender: "male" | "female";
      attrBonus: PlayerAttributes;
      ambition?: AmbitionType;
    } | null
  ): GameSaveData {
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

    if (playerConfig) {
      data.player.name = playerConfig.name.trim();
      data.player.gender = playerConfig.gender;
      if (playerConfig.ambition != null) data.player.ambition = playerConfig.ambition;
      data.player.attrs = {
        strength: ATTR_BASE + (playerConfig.attrBonus.strength ?? 0),
        intelligence: ATTR_BASE + (playerConfig.attrBonus.intelligence ?? 0),
        charm: ATTR_BASE + (playerConfig.attrBonus.charm ?? 0),
        luck: ATTR_BASE + (playerConfig.attrBonus.luck ?? 0)
      };
    }

    this.currentSlot = slot;
    return data;
  }

  private optimizeSaveData(saveData: GameSaveData): GameSaveData {
    const draft: GameSaveData = {
      ...saveData,
      dialogueHistory:
        saveData.dialogueHistory.length > this.storageLimits.maxDialogueHistory
          ? saveData.dialogueHistory.slice(-this.storageLimits.maxDialogueHistory)
          : saveData.dialogueHistory,
      eventLog:
        saveData.eventLog.length > this.storageLimits.maxEventLog
          ? saveData.eventLog.slice(-this.storageLimits.maxEventLog)
          : saveData.eventLog
    };
    delete (draft as GameSaveData & { tempData?: unknown }).tempData;
    return draft;
  }

  private checkSaveSize(payload: GameSaveData) {
    try {
      const serialized = JSON.stringify(payload);
      const size = calculatePayloadSize(serialized);
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
      const totalUsed = this.storage.getSizeBytes();
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
      return migrateSaveData(data);
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
      data.dialogueHistory = migrateDialogueYear(data.dialogueHistory ?? []);
      if (data.player) {
        if (data.player.stamina == null) data.player.stamina = 80;
        if (data.player.birth_year == null) data.player.birth_year = 169;
      }
      if (data.npcs?.length) {
        data.npcs.forEach((n) => {
          if (n.player_favor == null) n.player_favor = 0;
          if (n.player_relation == null) n.player_relation = "";
        });
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
      fame: number;
      infamy: number;
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
    if (typeof delta.fame === "number") {
      saveData.player.fame = Math.max(0, (saveData.player.fame ?? 0) + delta.fame);
    }
    if (typeof delta.infamy === "number") {
      saveData.player.infamy = Math.max(0, (saveData.player.infamy ?? 0) + delta.infamy);
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
        setTimeout(() => this.save(saveData, true), 0);
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
      return this.save(migrateSaveData(parsed), false);
    } catch (error) {
      console.error("导入存档失败:", error);
      return false;
    }
  }

  getStorageInfo() {
    const used = this.storage.getSizeBytes();
    const total = this.storageLimits.maxTotalSize;
    return {
      total,
      used,
      available: Math.max(0, total - used),
      usagePercentage: used / total,
      keys: this.storage.getAllKeys()
    };
  }
}

export const saveManager = new SaveManager();
export { SAVE_VERSION, STORAGE_KEY_PREFIX, ClientConfig as SaveManagerConfig };
