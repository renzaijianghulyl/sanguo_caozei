// 垂直切片完整测试
// 测试核心循环：场景呈现→玩家输入→LLM裁决→状态更新→叙事反馈→存档保存

const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

// 测试配置
const SERVER_PORT = 3000;
const API_URL = `http://localhost:${SERVER_PORT}/intent/resolve`;
const SERVER_PATH = path.join(__dirname, '../src/server/index.js');

// 全局变量
let serverProcess = null;

// 启动服务端
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('启动裁决服务器...');
    
    serverProcess = spawn('node', [SERVER_PATH], {
      env: { ...process.env, PORT: SERVER_PORT },
      stdio: 'pipe',
      cwd: path.join(__dirname, '..')
    });
    
    let serverReady = false;
    let stdoutData = '';
    let stderrData = '';
    
    // 处理输出
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutData += output;
      console.log(`[Server] ${output.trim()}`);
      
      if (output.includes('裁决服务器运行在端口') && !serverReady) {
        serverReady = true;
        // 不立即resolve，等待健康检查
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      stderrData += error;
      console.error(`[Server Error] ${error.trim()}`);
    });
    
    // 进程退出处理
    serverProcess.on('exit', (code, signal) => {
      console.error(`[Server] 进程退出，code=${code}, signal=${signal}`);
      console.error(`[Server] stderr: ${stderrData}`);
      reject(new Error(`服务器进程意外退出，退出码: ${code}, 信号: ${signal}`));
    });
    
    // 错误处理
    serverProcess.on('error', (err) => {
      console.error(`[Server] 进程错误: ${err.message}`);
      reject(err);
    });
    
    // 健康检查轮询
    const startTime = Date.now();
    const timeout = 20000; // 20秒超时
    const checkInterval = 500; // 每500ms检查一次
    
    const checkHealth = async () => {
      // 检查进程是否退出
      if (serverProcess.exitCode !== null) {
        // exit事件应该已经处理，但以防万一
        reject(new Error(`服务器进程已退出，退出码: ${serverProcess.exitCode}`));
        return;
      }
      
      try {
        const response = await axios.get(`http://localhost:${SERVER_PORT}/health`);
        if (response.status === 200) {
          console.log(`✓ 服务端健康检查通过: ${JSON.stringify(response.data)}`);
          resolve();
          return;
        }
      } catch (err) {
        // 健康检查失败，继续重试
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error(`服务器启动超时，最后输出: ${stdoutData.substring(stdoutData.length - 200)}，错误输出: ${stderrData.substring(stderrData.length - 200)}`));
        return;
      }
      
      setTimeout(checkHealth, checkInterval);
    };
    
    // 开始健康检查轮询
    setTimeout(checkHealth, 1000);
  });
}

// 停止服务端
function stopServer() {
  if (serverProcess) {
    console.log('停止裁决服务器...');
    serverProcess.kill();
    serverProcess = null;
  }
}

// 模拟微信小游戏环境
function setupWxMock() {
  global.wx = {
    // 存储API
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
          totalSize += JSON.stringify(this._storage[key]).length;
        }
      });
      
      return {
        keys: keys,
        currentSize: Math.ceil(totalSize / 1024),
        limitSize: 10240
      };
    },
    
    // 网络请求API
    request: function(options) {
      console.log(`[Mock wx.request] 调用URL: ${options.url}, 方法: ${options.method || 'GET'}`);
      console.log(`[Mock wx.request] 数据:`, JSON.stringify(options.data ? options.data : {}));
      // 使用axios实际调用本地服务端
      const requestConfig = {
        method: options.method || 'GET',
        url: options.url,
        data: options.data,
        headers: options.header || {},
        timeout: options.timeout || 15000
      };
      
      axios(requestConfig)
        .then(response => {
          console.log(`[Mock wx.request] 响应状态: ${response.status}`);
          if (options.success) {
            options.success({
              statusCode: response.status,
              data: response.data
            });
          }
        })
        .catch(error => {
          console.error(`[Mock wx.request] 请求失败:`, error.message);
          if (options.fail) {
            options.fail(error);
          }
        });
    },
    
    // 键盘API
    showKeyboard: function() {
      console.log('[Mock] 显示键盘');
    },
    
    hideKeyboard: function() {
      console.log('[Mock] 隐藏键盘');
    },
    
    onKeyboardInput: function() {},
    onKeyboardConfirm: function() {},
    onKeyboardComplete: function() {},
    
    // 触摸事件
    onTouchStart: function() {},
    
    // 画布API
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
}

// 运行垂直切片测试
async function runVerticalSliceTest() {
  console.log('=== 三国文字沙箱垂直切片测试 ===\n');
  
  try {
    // 1. 启动服务端
    await startServer();
    console.log('✓ 裁决服务器已启动\n');
    
    // 2. 健康检查
    console.log('2. 服务端健康检查...');
    const healthResponse = await axios.get(`http://localhost:${SERVER_PORT}/health`);
    console.log(`✓ 服务端状态: ${JSON.stringify(healthResponse.data)}\n`);
    
    // 3. 设置微信模拟环境
    console.log('3. 设置微信模拟环境...');
    setupWxMock();
    console.log('✓ 微信API模拟完成\n');
    
    // 4. 导入并初始化游戏
    console.log('4. 初始化游戏...');
    const game = require('../src/client/main.js');
    game.initGame();
    console.log('✓ 游戏初始化完成\n');
    
    // 5. 检查存档状态
    console.log('5. 检查存档状态...');
    const gameState = game.getState();
    if (gameState.currentSaveData) {
      console.log(`✓ 存档已创建: ${gameState.currentSaveData.meta.saveName}`);
      console.log(`玩家ID: ${gameState.currentSaveData.meta.playerId}`);
      console.log(`对话历史: ${gameState.currentSaveData.dialogueHistory?.length || 0}条\n`);
    } else {
      console.log('✗ 存档创建失败\n');
      throw new Error('存档系统未正常工作');
    }
    
    // 6. 模拟玩家输入
    console.log('6. 模拟玩家输入...');
    const testIntents = [
      '我想去洛阳结交豪杰',
      '我打算投靠官府',
      '我要暗中调查太平道'
    ];
    
    const selectedIntent = testIntents[0];
    console.log(`玩家意图: "${selectedIntent}"\n`);
    
    // 7. 提交意图并等待裁决
    console.log('7. 提交意图到服务端...');
    
    // 设置当前输入
    game.setCurrentInput(selectedIntent);
    
    // 记录提交前的存档状态
    const beforeSaveData = JSON.parse(JSON.stringify(gameState.currentSaveData));
    
    // 提交意图
    const dialogueHistoryLengthBefore = gameState.dialogueHistory.length;
    game.submitInput();
    
    console.log('意图已提交，等待裁决结果...\n');
    
    // 8. 等待裁决完成
    console.log('8. 等待裁决处理...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 9. 验证结果
    console.log('9. 验证核心循环结果...');
    
    const afterState = game.getState();
    
    // 检查对话历史是否更新
    const dialogueUpdated = afterState.dialogueHistory.length > dialogueHistoryLengthBefore;
    console.log(`对话历史更新: ${dialogueUpdated ? '✓' : '✗'}`);
    
    if (dialogueUpdated) {
      console.log('最后几条对话:');
      afterState.dialogueHistory.slice(-3).forEach((line, i) => {
        console.log(`  ${i+1}. ${line}`);
      });
    }
    
    // 检查存档是否保存
    const saveManager = require('../src/client/save.js').saveManager;
    const savedData = saveManager.load(0);
    const savePersisted = savedData && savedData.meta.lastSaved !== beforeSaveData.meta.lastSaved;
    console.log(`\n存档持久化: ${savePersisted ? '✓' : '✗'}`);
    
    if (savePersisted) {
      console.log(`保存时间: ${new Date(savedData.meta.lastSaved).toLocaleString()}`);
      console.log(`对话记录数: ${savedData.dialogueHistory?.length || 0}`);
    }
    
    // 10. 验证状态变化
    console.log('\n10. 验证状态变化...');
    
    if (afterState.currentSaveData) {
      const playerAttrs = afterState.currentSaveData.player.attrs;
      console.log('玩家属性:');
      console.log(`  武力: ${playerAttrs.strength}`);
      console.log(`  智力: ${playerAttrs.intelligence}`);
      console.log(`  魅力: ${playerAttrs.charm}`);
      console.log(`  运气: ${playerAttrs.luck}`);
      
      const legend = afterState.currentSaveData.player.legend || 30;
      console.log(`  传奇度: ${legend}`);
    }
    
    // 11. 测试总结
    console.log('\n=== 测试总结 ===');
    const testsPassed = dialogueUpdated && savePersisted;
    console.log(`核心循环测试: ${testsPassed ? '通过' : '失败'}`);
    
    if (testsPassed) {
      console.log('✓ 场景呈现 → 玩家输入 → LLM裁决 → 状态更新 → 叙事反馈 → 存档保存');
      console.log('✓ 垂直切片集成完成');
    } else {
      console.log('✗ 部分功能未正常工作');
    }
    
    return {
      success: testsPassed,
      beforeState: gameState,
      afterState: afterState,
      testIntent: selectedIntent
    };
    
  } catch (error) {
    console.error('测试失败:', error.message);
    throw error;
  } finally {
    // 清理
    stopServer();
  }
}

// 运行测试
if (require.main === module) {
  runVerticalSliceTest()
    .then(result => {
      console.log('\n垂直切片测试完成');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('测试执行失败:', error);
      process.exit(1);
    });
}

module.exports = { runVerticalSliceTest };