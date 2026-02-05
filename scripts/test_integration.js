// 垂直切片集成测试
// 测试客户端、服务端、存档系统的完整集成

const axios = require('axios');
const path = require('path');

// 模拟微信小游戏环境
global.wx = {
  request: function(options) {
    // 直接调用本地服务端
    return axios({
      method: options.method,
      url: options.url,
      data: options.data,
      headers: options.header
    }).then(response => {
      if (options.success) {
        options.success({
          statusCode: response.status,
          data: response.data
        });
      }
    }).catch(error => {
      if (options.fail) {
        options.fail(error);
      }
    });
  },
  
  // 存储API模拟
  setStorageSync: function(key, data) {
    this._storage = this._storage || {};
    this._storage[key] = data;
    return true;
  },
  
  getStorageSync: function(key) {
    this._storage = this._storage || {};
    return this._storage[key] || null;
  },
  
  removeStorageSync: function(key) {
    this._storage = this._storage || {};
    delete this._storage[key];
    return true;
  },
  
  getStorageInfoSync: function() {
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
      currentSize: Math.ceil(totalSize / 1024),
      limitSize: 10240
    };
  },
  
  // 键盘API模拟
  showKeyboard: function() {
    console.log('模拟：显示键盘');
  },
  
  hideKeyboard: function() {
    console.log('模拟：隐藏键盘');
  },
  
  onKeyboardInput: function() {},
  onKeyboardConfirm: function() {},
  onKeyboardComplete: function() {},
  
  // 触摸事件模拟
  onTouchStart: function() {},
  
  // 画布API模拟
  createCanvas: function() {
    return {
      width: 375,
      height: 667,
      getContext: function() {
        return {
          clearRect: () => {},
          fillRect: () => {},
          fillText: () => {},
          measureText: () => ({ width: 50 }),
          strokeRect: () => {}
        };
      }
    };
  }
};

// 导入客户端模块
const game = require('../src/client/main.js');

async function runIntegrationTest() {
  console.log('=== 垂直切片集成测试开始 ===\n');
  
  try {
    // 1. 初始化游戏
    console.log('1. 初始化游戏...');
    game.initGame();
    console.log('✓ 游戏初始化完成\n');
    
    // 2. 模拟玩家输入
    console.log('2. 模拟玩家输入...');
    const testIntent = "我想去洛阳结交豪杰";
    console.log(`玩家意图: "${testIntent}"`);
    
    // 3. 调用submitInput函数
    console.log('3. 提交意图到服务端...');
    
    // 设置当前输入
    const gameState = game.getState();
    gameState.currentInput = testIntent;
    
    // 执行提交
    game.submitInput();
    
    console.log('✓ 意图已提交，等待裁决结果\n');
    
    // 4. 等待一小段时间让异步请求完成
    console.log('4. 等待裁决结果...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 5. 检查对话历史
    const newState = game.getState();
    console.log('当前对话历史:');
    newState.dialogueHistory.slice(-5).forEach((line, i) => {
      console.log(`  ${i+1}. ${line}`);
    });
    
    // 6. 检查存档状态
    console.log('\n6. 检查存档状态...');
    if (newState.currentSaveData) {
      console.log('✓ 存档数据存在');
      console.log(`存档名: ${newState.currentSaveData.meta.saveName}`);
      console.log(`最后保存: ${new Date(newState.currentSaveData.meta.lastSaved).toLocaleString()}`);
      console.log(`对话记录数: ${newState.currentSaveData.dialogueHistory?.length || 0}`);
    } else {
      console.log('✗ 未找到存档数据');
    }
    
    console.log('\n=== 集成测试完成 ===');
    console.log('结果: 核心循环基本工作，需在微信开发者工具中进一步验证');
    
  } catch (error) {
    console.error('集成测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
runIntegrationTest();