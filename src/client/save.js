// 三国文字沙箱 - 本地存档模块
// 微信小游戏本地存储API封装，支持存档读写、去重、自动保存

// 存档数据版本
const SAVE_VERSION = '1.0.0';

// 存储key前缀
const STORAGE_KEY_PREFIX = 'sanguo_save_';

// 默认存档数据结构
const DEFAULT_SAVE_DATA = {
  // 元数据
  meta: {
    version: SAVE_VERSION,
    createdAt: '',
    lastSaved: '',
    playerId: '',
    saveName: '默认存档',
    saveSlot: 0
  },
  
  // 玩家状态
  player: {
    id: 'player_001',
    attrs: {
      strength: 75,
      intelligence: 82,
      charm: 68,
      luck: 55
    },
    legend: 30,
    tags: ['civilian'],
    reputation: 50,
    resources: {
      gold: 100,
      food: 200,
      soldiers: 0
    },
    location: {
      region: 'yingchuan',
      scene: 'village'
    }
  },
  
  // 世界状态
  world: {
    era: '184',
    flags: ['taipingdao_spread=high'],
    time: {
      year: 184,
      month: 1,
      day: 1
    },
    regions: {
      yingchuan: {
        stability: 60,
        unrest: 40
      }
    }
  },
  
  // NPC状态
  npcs: [
    {
      id: 'npc_xianwei',
      name: '县尉',
      stance: 'court',
      trust: 40,
      relations: {}
    },
    {
      id: 'npc_taiping_disciple',
      name: '太平道教徒',
      stance: 'taiping',
      trust: 30,
      relations: {}
    }
  ],
  
  // 事件日志（用于去重）
  eventLog: [],
  
  // 对话历史
  dialogueHistory: [
    "建宁元年（公元168年），你醒来发现自己身处洛阳城外的小村庄。",
    "村中长者告诉你，黄巾之乱即将爆发，天下将乱。",
    "你可以选择投靠官府，也可以暗中结交豪杰，甚至加入太平道……"
  ],
  
  // 游戏进度
  progress: {
    totalTurns: 0,
    lastEventId: '',
    lastEventTime: ''
  }
};

/**
 * 存档管理类
 */
class SaveManager {
  constructor() {
    this.currentSlot = 0;
    this.autoSaveEnabled = true;
    this.autoSaveInterval = 30; // 自动保存间隔（秒）
    this.autoSaveTimer = null;
    
    // 存储限制配置
    this.storageLimits = {
      maxSingleKeySize: 1024 * 1024, // 1MB
      maxTotalSize: 10 * 1024 * 1024, // 10MB
      maxDialogueHistory: 100, // 对话历史最大条数
      maxEventLog: 500, // 事件日志最大条数
      warningThreshold: 0.8 // 警告阈值（80%）
    };
  }
  
  /**
   * 初始化存档系统
   */
  init() {
    console.log('存档系统初始化');
    
    // 检查存储API可用性
    if (!wx.setStorageSync) {
      console.warn('微信小游戏存储API不可用，使用模拟存储');
      this._useMockStorage = true;
      this._mockStorage = {};
    }
    
    // 启动自动保存定时器
    this.startAutoSave();
    
    return true;
  }
  
  /**
   * 生成玩家ID
   */
  generatePlayerId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `player_${timestamp}_${random}`;
  }
  
  /**
   * 创建新存档
   * @param {number} slot - 存档槽位
   * @param {string} saveName - 存档名称
   * @returns {object} 存档数据
   */
  createNewSave(slot = 0, saveName = '新建存档') {
    const saveData = JSON.parse(JSON.stringify(DEFAULT_SAVE_DATA));
    const playerId = this.generatePlayerId();
    const now = new Date().toISOString();
    
    saveData.meta = {
      ...saveData.meta,
      createdAt: now,
      lastSaved: now,
      playerId,
      saveName,
      saveSlot: slot
    };
    
    saveData.player.id = playerId;
    
    // 设置存档槽位
    this.currentSlot = slot;
    
    return saveData;
  }
  
  /**
   * 优化存档数据，清理不必要的内容
   * @param {object} saveData - 存档数据
   * @returns {object} 优化后的存档数据
   */
  _optimizeSaveData(saveData) {
    if (!saveData) return saveData;
    
    // 创建副本以避免修改原始数据
    const optimized = JSON.parse(JSON.stringify(saveData));
    
    // 限制对话历史长度
    if (optimized.dialogueHistory && 
        optimized.dialogueHistory.length > this.storageLimits.maxDialogueHistory) {
      optimized.dialogueHistory = optimized.dialogueHistory.slice(
        -this.storageLimits.maxDialogueHistory
      );
    }
    
    // 限制事件日志长度
    if (optimized.eventLog && 
        optimized.eventLog.length > this.storageLimits.maxEventLog) {
      optimized.eventLog = optimized.eventLog.slice(
        -this.storageLimits.maxEventLog
      );
    }
    
    // 清理临时数据（如果有）
    if (optimized.tempData) {
      delete optimized.tempData;
    }
    
    return optimized;
  }
  
  /**
   * 检查存档大小
   * @param {object} saveData - 存档数据
   * @returns {object} 检查结果
   */
  _checkSaveSize(saveData) {
    const result = {
      size: 0,
      isWithinLimit: true,
      warning: null
    };
    
    if (!saveData) return result;
    
    try {
      const saveString = JSON.stringify(saveData);
      result.size = new Blob([saveString]).size;
      result.isWithinLimit = result.size <= this.storageLimits.maxSingleKeySize;
      
      if (result.size > this.storageLimits.maxSingleKeySize * this.storageLimits.warningThreshold) {
        result.warning = `存档大小 ${result.size} 字节接近限制`;
      }
      
      return result;
    } catch (error) {
      console.error('检查存档大小失败:', error);
      return result;
    }
  }
  
  /**
   * 检查总存储使用情况
   * @returns {object} 存储信息
   */
  _checkTotalStorage() {
    try {
      let totalSize = 0;
      let keys = [];
      
      if (this._useMockStorage) {
        Object.keys(this._mockStorage).forEach(key => {
          const data = this._mockStorage[key];
          totalSize += data ? data.length : 0;
          keys.push(key);
        });
      } else {
        const info = wx.getStorageInfoSync();
        totalSize = info.currentSize * 1024; // KB to bytes
        keys = info.keys;
      }
      
      const usagePercentage = totalSize / this.storageLimits.maxTotalSize;
      
      return {
        totalSize,
        usagePercentage,
        keys,
        isWithinLimit: totalSize <= this.storageLimits.maxTotalSize,
        warning: usagePercentage > this.storageLimits.warningThreshold ? 
          `存储使用率 ${(usagePercentage * 100).toFixed(1)}% 接近上限` : null
      };
    } catch (error) {
      console.error('检查存储使用情况失败:', error);
      return null;
    }
  }
  
  /**
   * 保存存档
   * @param {object} saveData - 存档数据
   * @param {boolean} isAutoSave - 是否为自动保存
   * @returns {boolean} 是否成功
   */
  save(saveData, isAutoSave = false) {
    if (!saveData) {
      console.error('存档数据不能为空');
      return false;
    }
    
    try {
      // 更新元数据
      const now = new Date().toISOString();
      saveData.meta.lastSaved = now;
      if (isAutoSave) {
        saveData.meta.lastAutoSave = now;
      }
      
      // 优化存档数据（清理历史记录等）
      const optimizedSaveData = this._optimizeSaveData(saveData);
      
      // 检查存档大小
      const sizeCheck = this._checkSaveSize(optimizedSaveData);
      
      if (!sizeCheck.isWithinLimit) {
        console.error(`存档大小 ${sizeCheck.size} 字节超过 ${this.storageLimits.maxSingleKeySize} 字节限制，无法保存`);
        
        // 尝试紧急清理
        console.warn('尝试紧急清理存档数据...');
        optimizedSaveData.dialogueHistory = optimizedSaveData.dialogueHistory?.slice(-50) || [];
        optimizedSaveData.eventLog = optimizedSaveData.eventLog?.slice(-100) || [];
        
        const secondSizeCheck = this._checkSaveSize(optimizedSaveData);
        if (!secondSizeCheck.isWithinLimit) {
          console.error('紧急清理后仍然超过限制，保存失败');
          return false;
        }
      }
      
      if (sizeCheck.warning) {
        console.warn(sizeCheck.warning);
      }
      
      // 检查总存储使用情况
      const storageInfo = this._checkTotalStorage();
      if (storageInfo && storageInfo.warning) {
        console.warn(storageInfo.warning);
      }
      
      // 序列化存档数据
      const saveString = JSON.stringify(optimizedSaveData);
      
      // 存储到本地
      const storageKey = `${STORAGE_KEY_PREFIX}${this.currentSlot}`;
      
      if (this._useMockStorage) {
        this._mockStorage[storageKey] = saveString;
      } else {
        wx.setStorageSync(storageKey, saveString);
      }
      
      console.log(`存档保存成功（${isAutoSave ? '自动' : '手动'}），槽位: ${this.currentSlot}, 大小: ${sizeCheck.size} 字节`);
      return true;
      
    } catch (error) {
      console.error('存档保存失败:', error);
      return false;
    }
  }
  
  /**
   * 加载存档
   * @param {number} slot - 存档槽位
   * @returns {object|null} 存档数据
   */
  load(slot = null) {
    try {
      const loadSlot = slot !== null ? slot : this.currentSlot;
      const storageKey = `${STORAGE_KEY_PREFIX}${loadSlot}`;
      
      let saveString;
      if (this._useMockStorage) {
        saveString = this._mockStorage[storageKey];
      } else {
        saveString = wx.getStorageSync(storageKey);
      }
      
      if (!saveString) {
        console.log(`存档槽位 ${loadSlot} 不存在`);
        return null;
      }
      
      const saveData = JSON.parse(saveString);
      
      // 检查版本兼容性
      if (saveData.meta.version !== SAVE_VERSION) {
        console.warn(`存档版本不匹配: ${saveData.meta.version} -> ${SAVE_VERSION}，尝试迁移`);
        // 可以在这里实现版本迁移逻辑
      }
      
      // 设置当前槽位
      this.currentSlot = loadSlot;
      
      console.log(`存档加载成功，槽位: ${loadSlot}, 玩家: ${saveData.meta.playerId}`);
      return saveData;
      
    } catch (error) {
      console.error('存档加载失败:', error);
      return null;
    }
  }
  
  /**
   * 删除存档
   * @param {number} slot - 存档槽位
   * @returns {boolean} 是否成功
   */
  deleteSave(slot) {
    try {
      const storageKey = `${STORAGE_KEY_PREFIX}${slot}`;
      
      if (this._useMockStorage) {
        delete this._mockStorage[storageKey];
      } else {
        wx.removeStorageSync(storageKey);
      }
      
      console.log(`存档删除成功，槽位: ${slot}`);
      return true;
      
    } catch (error) {
      console.error('存档删除失败:', error);
      return false;
    }
  }
  
  /**
   * 获取存档列表
   * @returns {array} 存档信息列表
   */
  getSaveList() {
    const saveList = [];
    
    try {
      // 检查所有槽位（假设有10个槽位）
      for (let slot = 0; slot < 10; slot++) {
        const storageKey = `${STORAGE_KEY_PREFIX}${slot}`;
        
        let saveString;
        if (this._useMockStorage) {
          saveString = this._mockStorage[storageKey];
        } else {
          saveString = wx.getStorageSync(storageKey);
        }
        
        if (saveString) {
          const saveData = JSON.parse(saveString);
          saveList.push({
            slot,
            name: saveData.meta.saveName,
            playerId: saveData.meta.playerId,
            lastSaved: saveData.meta.lastSaved,
            playerName: saveData.player.name || '无名氏',
            era: saveData.world.era,
            location: saveData.player.location.region
          });
        }
      }
      
      return saveList;
      
    } catch (error) {
      console.error('获取存档列表失败:', error);
      return [];
    }
  }
  
  /**
   * 记录事件（去重机制）
   * @param {object} saveData - 存档数据
   * @param {string} eventId - 事件ID
   * @param {string} playerId - 玩家ID
   * @returns {boolean} 是否为重复事件
   */
  logEvent(saveData, eventId, playerId = null) {
    if (!saveData || !eventId) {
      console.error('参数错误');
      return false;
    }
    
    const targetPlayerId = playerId || saveData.player.id;
    const eventKey = `${eventId}_${targetPlayerId}`;
    
    // 检查是否已记录（去重）
    const isDuplicate = saveData.eventLog.some(log => 
      log.eventId === eventId && log.playerId === targetPlayerId
    );
    
    if (isDuplicate) {
      console.log(`事件 ${eventId} 已记录，跳过重复`);
      return true;
    }
    
    // 记录新事件
    const now = new Date().toISOString();
    saveData.eventLog.push({
      eventId,
      playerId: targetPlayerId,
      triggeredAt: now,
      recordedAt: now
    });
    
    // 更新游戏进度
    saveData.progress.lastEventId = eventId;
    saveData.progress.lastEventTime = now;
    saveData.progress.totalTurns = (saveData.progress.totalTurns || 0) + 1;
    
    console.log(`事件记录成功: ${eventId}`);
    return false;
  }
  
  /**
   * 检查事件是否已触发
   * @param {object} saveData - 存档数据
   * @param {string} eventId - 事件ID
   * @returns {boolean} 是否已触发
   */
  isEventTriggered(saveData, eventId) {
    if (!saveData || !eventId) return false;
    
    return saveData.eventLog.some(log => 
      log.eventId === eventId && log.playerId === saveData.player.id
    );
  }
  
  /**
   * 更新玩家属性
   * @param {object} saveData - 存档数据
   * @param {object} attributeChanges - 属性变更
   * @returns {object} 更新后的存档数据
   */
  updatePlayerAttributes(saveData, attributeChanges) {
    if (!saveData || !attributeChanges) return saveData;
    
    // 更新基础属性
    if (attributeChanges.attrs) {
      Object.keys(attributeChanges.attrs).forEach(key => {
        if (saveData.player.attrs[key] !== undefined) {
          saveData.player.attrs[key] += attributeChanges.attrs[key];
          // 限制范围
          saveData.player.attrs[key] = Math.max(0, Math.min(100, saveData.player.attrs[key]));
        }
      });
    }
    
    // 更新传说度
    if (attributeChanges.legend !== undefined) {
      saveData.player.legend += attributeChanges.legend;
      saveData.player.legend = Math.max(0, saveData.player.legend);
    }
    
    // 更新声望
    if (attributeChanges.reputation !== undefined) {
      saveData.player.reputation += attributeChanges.reputation;
      saveData.player.reputation = Math.max(0, Math.min(100, saveData.player.reputation));
    }
    
    // 更新资源
    if (attributeChanges.resources) {
      Object.keys(attributeChanges.resources).forEach(key => {
        if (saveData.player.resources[key] !== undefined) {
          saveData.player.resources[key] += attributeChanges.resources[key];
          saveData.player.resources[key] = Math.max(0, saveData.player.resources[key]);
        }
      });
    }
    
    return saveData;
  }
  
  /**
   * 更新世界状态
   * @param {object} saveData - 存档数据
   * @param {object} worldChanges - 世界状态变更
   * @returns {object} 更新后的存档数据
   */
  updateWorldState(saveData, worldChanges) {
    if (!saveData || !worldChanges) return saveData;
    
    // 更新时代
    if (worldChanges.era) {
      saveData.world.era = worldChanges.era;
    }
    
    // 更新旗帜
    if (worldChanges.flags) {
      worldChanges.flags.forEach(flag => {
        if (!saveData.world.flags.includes(flag)) {
          saveData.world.flags.push(flag);
        }
      });
    }
    
    // 更新时间
    if (worldChanges.time) {
      Object.assign(saveData.world.time, worldChanges.time);
    }
    
    // 更新区域状态
    if (worldChanges.regions) {
      Object.keys(worldChanges.regions).forEach(regionKey => {
        if (!saveData.world.regions[regionKey]) {
          saveData.world.regions[regionKey] = {};
        }
        Object.assign(saveData.world.regions[regionKey], worldChanges.regions[regionKey]);
      });
    }
    
    return saveData;
  }
  
  /**
   * 添加对话历史
   * @param {object} saveData - 存档数据
   * @param {string|array} dialogue - 对话内容
   * @returns {object} 更新后的存档数据
   */
  addDialogueHistory(saveData, dialogue) {
    if (!saveData || !dialogue) return saveData;
    
    if (Array.isArray(dialogue)) {
      saveData.dialogueHistory.push(...dialogue);
    } else {
      saveData.dialogueHistory.push(dialogue);
    }
    
    // 限制对话历史长度（防止存储过大）
    const maxHistoryLength = 100;
    if (saveData.dialogueHistory.length > maxHistoryLength) {
      saveData.dialogueHistory = saveData.dialogueHistory.slice(-maxHistoryLength);
    }
    
    return saveData;
  }
  
  /**
   * 开始自动保存
   */
  startAutoSave() {
    if (!this.autoSaveEnabled || this.autoSaveTimer) return;
    
    this.autoSaveTimer = setInterval(() => {
      const currentSave = this.load(this.currentSlot);
      if (currentSave) {
        this.save(currentSave, true);
      }
    }, this.autoSaveInterval * 1000);
    
    console.log(`自动保存已启动，间隔: ${this.autoSaveInterval}秒`);
  }
  
  /**
   * 停止自动保存
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log('自动保存已停止');
    }
  }
  
  /**
   * 设置自动保存间隔
   * @param {number} seconds - 间隔秒数
   */
  setAutoSaveInterval(seconds) {
    this.autoSaveInterval = Math.max(10, seconds); // 最小10秒
    
    if (this.autoSaveTimer) {
      this.stopAutoSave();
      this.startAutoSave();
    }
  }
  
  /**
   * 导出存档数据（用于备份）
   * @param {number} slot - 存档槽位
   * @returns {string|null} 存档字符串
   */
  exportSave(slot = null) {
    const saveData = this.load(slot !== null ? slot : this.currentSlot);
    return saveData ? JSON.stringify(saveData, null, 2) : null;
  }
  
  /**
   * 导入存档数据
   * @param {string} saveString - 存档字符串
   * @param {number} slot - 存档槽位
   * @returns {boolean} 是否成功
   */
  importSave(saveString, slot) {
    try {
      const saveData = JSON.parse(saveString);
      
      // 验证存档结构
      if (!saveData.meta || !saveData.player) {
        throw new Error('存档格式无效');
      }
      
      // 设置槽位
      if (slot !== undefined) {
        this.currentSlot = slot;
      }
      
      // 保存存档
      return this.save(saveData);
      
    } catch (error) {
      console.error('导入存档失败:', error);
      return false;
    }
  }
  
  /**
   * 获取存储使用情况
   * @returns {object} 存储信息
   */
  getStorageInfo() {
    try {
      if (this._useMockStorage) {
        return {
          total: 10 * 1024 * 1024, // 10MB
          used: 0,
          available: 10 * 1024 * 1024,
          usagePercentage: 0
        };
      }
      
      const info = wx.getStorageInfoSync();
      return {
        total: 10 * 1024 * 1024, // 微信小游戏固定10MB
        used: info.currentSize * 1024, // currentSize单位KB
        available: 10 * 1024 * 1024 - info.currentSize * 1024,
        usagePercentage: (info.currentSize / (10 * 1024)) * 100,
        keys: info.keys
      };
      
    } catch (error) {
      console.error('获取存储信息失败:', error);
      return null;
    }
  }
}

// 创建全局实例
const saveManager = new SaveManager();

// 导出模块
module.exports = {
  SaveManager,
  saveManager,
  DEFAULT_SAVE_DATA,
  SAVE_VERSION
};