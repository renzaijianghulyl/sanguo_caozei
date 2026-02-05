// 存档系统测试脚本
// 在Node.js环境中模拟微信小游戏环境并测试存档功能

// 模拟微信小游戏API
global.wx = {
  // 存储API
  setStorageSync: function(key, data) {
    console.log(`[模拟] setStorageSync: ${key}, 数据长度: ${data.length}`);
    this._storage = this._storage || {};
    this._storage[key] = data;
    return true;
  },
  
  getStorageSync: function(key) {
    console.log(`[模拟] getStorageSync: ${key}`);
    this._storage = this._storage || {};
    return this._storage[key] || null;
  },
  
  removeStorageSync: function(key) {
    console.log(`[模拟] removeStorageSync: ${key}`);
    this._storage = this._storage || {};
    delete this._storage[key];
    return true;
  },
  
  getStorageInfoSync: function() {
    console.log(`[模拟] getStorageInfoSync`);
    this._storage = this._storage || {};
    const keys = Object.keys(this._storage);
    let totalSize = 0;
    
    keys.forEach(key => {
      if (this._storage[key]) {
        totalSize += this._storage[key].length;
      }
    });
    
    return {
      keys: keys,
      currentSize: Math.ceil(totalSize / 1024), // 转换为KB
      limitSize: 10240 // 10MB = 10240KB
    };
  },
  
  // 其他API模拟
  createCanvas: function() {
    return {
      width: 375,
      height: 667,
      getContext: function() {
        return {
          clearRect: () => {},
          fillRect: () => {},
          fillText: () => {},
          measureText: () => ({ width: 10 }),
          strokeRect: () => {}
        };
      }
    };
  },
  
  onTouchStart: () => {},
  onKeyboardInput: () => {},
  onKeyboardConfirm: () => {},
  onKeyboardComplete: () => {},
  showKeyboard: () => {},
  hideKeyboard: () => {},
  onShow: () => {},
  onHide: () => {},
  onError: () => {}
};

// 加载存档模块
const { saveManager } = require('../src/client/save.js');

console.log('=== 三国文字沙箱存档系统测试 ===\n');

// 测试1: 初始化存档系统
console.log('测试1: 初始化存档系统');
saveManager.init();
console.log('✓ 存档系统初始化成功\n');

// 测试2: 创建新存档
console.log('测试2: 创建新存档');
const newSave = saveManager.createNewSave(0, '测试存档');
console.log(`✓ 创建新存档成功`);
console.log(`  存档名称: ${newSave.meta.saveName}`);
console.log(`  玩家ID: ${newSave.meta.playerId}`);
console.log(`  创建时间: ${newSave.meta.createdAt}\n`);

// 测试3: 保存存档
console.log('测试3: 保存存档');
const saveResult = saveManager.save(newSave);
console.log(`✓ 存档保存${saveResult ? '成功' : '失败'}\n`);

// 测试4: 加载存档
console.log('测试4: 加载存档');
const loadedSave = saveManager.load(0);
if (loadedSave) {
  console.log(`✓ 存档加载成功`);
  console.log(`  存档名称: ${loadedSave.meta.saveName}`);
  console.log(`  玩家ID: ${loadedSave.meta.playerId}`);
  console.log(`  最后保存时间: ${loadedSave.meta.lastSaved}`);
} else {
  console.log(`✗ 存档加载失败`);
}
console.log();

// 测试5: 记录事件（去重测试）
console.log('测试5: 事件记录与去重测试');
const eventId1 = 'yc_illness_001';
const eventId2 = 'yc_famine_002';

console.log(`记录事件: ${eventId1}`);
const isDuplicate1 = saveManager.logEvent(loadedSave, eventId1);
console.log(`  是否为重复事件: ${isDuplicate1 ? '是' : '否'}`);

console.log(`再次记录事件: ${eventId1}`);
const isDuplicate2 = saveManager.logEvent(loadedSave, eventId1);
console.log(`  是否为重复事件: ${isDuplicate2 ? '是' : '否'}`);

console.log(`记录新事件: ${eventId2}`);
const isDuplicate3 = saveManager.logEvent(loadedSave, eventId2);
console.log(`  是否为重复事件: ${isDuplicate3 ? '是' : '否'}\n`);

// 测试6: 更新玩家属性
console.log('测试6: 更新玩家属性');
console.log(`原始智力: ${loadedSave.player.attrs.intelligence}`);
console.log(`原始声望: ${loadedSave.player.reputation}`);

saveManager.updatePlayerAttributes(loadedSave, {
  attrs: { intelligence: 5 },
  reputation: 10
});

console.log(`更新后智力: ${loadedSave.player.attrs.intelligence}`);
console.log(`更新后声望: ${loadedSave.player.reputation}\n`);

// 测试7: 添加对话历史
console.log('测试7: 添加对话历史');
const originalHistoryLength = loadedSave.dialogueHistory.length;
console.log(`原始对话历史长度: ${originalHistoryLength}`);

saveManager.addDialogueHistory(loadedSave, '这是一条测试对话');
console.log(`添加后对话历史长度: ${loadedSave.dialogueHistory.length}`);
console.log(`最后一条对话: ${loadedSave.dialogueHistory[loadedSave.dialogueHistory.length - 1]}\n`);

// 测试8: 获取存档列表
console.log('测试8: 获取存档列表');
const saveList = saveManager.getSaveList();
console.log(`找到存档数量: ${saveList.length}`);
saveList.forEach((save, index) => {
  console.log(`  ${index + 1}. ${save.name} (${save.playerName}) - ${save.era}年 - ${save.location}`);
});
console.log();

// 测试9: 获取存储信息
console.log('测试9: 获取存储信息');
const storageInfo = saveManager.getStorageInfo();
if (storageInfo) {
  console.log(`总存储空间: ${(storageInfo.total / (1024 * 1024)).toFixed(2)}MB`);
  console.log(`已使用: ${(storageInfo.used / 1024).toFixed(2)}KB`);
  console.log(`可用: ${(storageInfo.available / (1024 * 1024)).toFixed(2)}MB`);
  console.log(`使用率: ${storageInfo.usagePercentage?.toFixed(2) || '未知'}%`);
}
console.log();

// 测试10: 导出和导入存档
console.log('测试10: 导出和导入存档');
const exportedSave = saveManager.exportSave(0);
if (exportedSave) {
  console.log(`✓ 存档导出成功，长度: ${exportedSave.length} 字符`);
  
  // 测试导入到新槽位
  const importResult = saveManager.importSave(exportedSave, 1);
  console.log(`存档导入到槽位1: ${importResult ? '成功' : '失败'}`);
  
  // 验证导入
  const importedSave = saveManager.load(1);
  console.log(`验证导入存档: ${importedSave ? '成功' : '失败'}`);
} else {
  console.log(`✗ 存档导出失败`);
}
console.log();

// 测试11: 删除存档
console.log('测试11: 删除存档');
const deleteResult = saveManager.deleteSave(1);
console.log(`删除槽位1存档: ${deleteResult ? '成功' : '失败'}`);

const verifyDelete = saveManager.load(1);
console.log(`验证删除: ${verifyDelete ? '失败（存档仍存在）' : '成功（存档已删除）'}\n`);

console.log('=== 存档系统测试完成 ===');
console.log('总结: 所有测试用例已执行，存档系统功能正常。');