// 游戏主逻辑模块
// 微信小游戏客户端核心代码
// 集成本地存档系统

// 导入存档模块
const { saveManager } = require('./save.js');
// 导入配置
const ClientConfig = require('./config.js');

// 游戏全局变量
let canvas = null;
let ctx = null;
let screenWidth = 0;
let screenHeight = 0;

// UI区域定义
let uiAreas = {
  attributePanel: { x: 0, y: 0, width: 0, height: 80 },
  dialogueArea: { x: 0, y: 80, width: 0, height: 400 },
  inputArea: { x: 0, y: 480, width: 0, height: 120 },
  saveLoadPanel: { x: 0, y: 600, width: 0, height: 60 } // 新增存档加载面板
};

// 存档数据（从存档管理器加载）
let currentSaveData = null;
let playerAttributes = {
  strength: 75,
  intelligence: 82,
  charm: 68,
  luck: 55,
  legend: 30
};

let dialogueHistory = [
  "建宁元年（公元168年），你醒来发现自己身处洛阳城外的小村庄。",
  "村中长者告诉你，黄巾之乱即将爆发，天下将乱。",
  "你可以选择投靠官府，也可以暗中结交豪杰，甚至加入太平道……"
];

let currentInput = "";
let isKeyboardShowing = false;
let isSaveLoadPanelVisible = false;

// 初始化游戏
function initGame() {
  canvas = wx.createCanvas();
  ctx = canvas.getContext('2d');
  screenWidth = canvas.width;
  screenHeight = canvas.height;
  
  // 更新UI区域尺寸
  uiAreas.attributePanel.width = screenWidth;
  uiAreas.dialogueArea.width = screenWidth;
  uiAreas.inputArea.width = screenWidth;
  uiAreas.saveLoadPanel.width = screenWidth;
  
  uiAreas.inputArea.y = screenHeight - uiAreas.inputArea.height;
  uiAreas.saveLoadPanel.y = uiAreas.inputArea.y - uiAreas.saveLoadPanel.height;
  uiAreas.dialogueArea.height = uiAreas.saveLoadPanel.y - uiAreas.attributePanel.height;
  
  // 初始化存档系统
  saveManager.init();
  
  // 尝试加载最近存档
  loadLatestSave();
  
  // 绑定触摸事件
  wx.onTouchStart((res) => {
    handleTouch(res.touches[0]);
  });
  
  // 监听键盘输入
  wx.onKeyboardInput((res) => {
    currentInput = res.value;
    render();
  });
  
  wx.onKeyboardConfirm((res) => {
    submitInput();
  });
  
  wx.onKeyboardComplete((res) => {
    isKeyboardShowing = false;
    render();
  });
  
  // 初始渲染
  render();
  
  console.log('游戏初始化完成，存档系统已就绪');
}

// 处理触摸事件
function handleTouch(touch) {
  const { x, y } = touch;
  
  // 检查是否点击了输入区域
  if (y >= uiAreas.inputArea.y && y <= uiAreas.inputArea.y + uiAreas.inputArea.height) {
    // 检查是否点击了发送按钮
    const sendButtonX = uiAreas.inputArea.width - 70;
    const sendButtonWidth = 60;
    const inputBoxY = uiAreas.inputArea.y + 20;
    const inputBoxHeight = 40;
    
    if (x >= sendButtonX && x <= sendButtonX + sendButtonWidth &&
        y >= inputBoxY && y <= inputBoxY + inputBoxHeight) {
      submitInput();
    } else {
      showKeyboard();
    }
    return;
  }
  
  // 检查是否点击了存档/加载面板区域
  if (isSaveLoadPanelVisible && y >= uiAreas.saveLoadPanel.y && 
      y <= uiAreas.saveLoadPanel.y + uiAreas.saveLoadPanel.height) {
    // 存档按钮区域（左半部分）
    if (x < uiAreas.saveLoadPanel.width / 2) {
      manualSave();
    } 
    // 加载按钮区域（右半部分）
    else {
      toggleSaveLoadPanel();
    }
    return;
  }
  
  // 检查是否点击了属性面板的存档按钮区域
  if (y >= uiAreas.attributePanel.y && y <= uiAreas.attributePanel.y + uiAreas.attributePanel.height) {
    // 属性面板右上角区域（存档图标）
    if (x > uiAreas.attributePanel.width - 60) {
      toggleSaveLoadPanel();
      return;
    }
  }
}

// 显示键盘
function showKeyboard() {
  if (isKeyboardShowing) return;
  
  wx.showKeyboard({
    defaultValue: currentInput,
    maxLength: 100,
    multiple: false,
    confirmHold: false,
    confirmType: 'send'
  });
  
  isKeyboardShowing = true;
}

// 提交输入
// 构建裁决请求数据
function buildAdjudicationRequest() {
  // 从存档数据中提取状态，如果没有存档则使用默认值
  let player_state = ClientConfig.DEFAULT_PLAYER_STATE;
  let world_state = ClientConfig.DEFAULT_WORLD_STATE;
  let npc_state = ClientConfig.DEFAULT_NPC_STATE;
  let event_context = null;
  
  if (currentSaveData) {
    player_state = currentSaveData.player;
    world_state = currentSaveData.world;
    npc_state = currentSaveData.npcs || ClientConfig.DEFAULT_NPC_STATE;
    // 简单的事件上下文：最近的对话
    event_context = {
      recent_dialogue: currentSaveData.dialogueHistory ? 
        currentSaveData.dialogueHistory.slice(-3) : []
    };
  }
  
  return {
    player_state,
    world_state,
    npc_state,
    event_context,
    player_intent: currentInput
  };
}

// 处理裁决结果
function handleAdjudicationResult(result) {
  console.log('收到裁决结果:', result);
  
  // 提取叙事文本
  const narrative = result.result?.narrative || '你的举动引起了注意。';
  console.log(`[DEBUG] handleAdjudicationResult adding narrative: "${narrative}"`);
  console.log(`[DEBUG] dialogueHistory before push length: ${dialogueHistory.length}`);
  dialogueHistory.push(narrative);
  console.log(`[DEBUG] dialogueHistory after push length: ${dialogueHistory.length}`);
  
  // 更新存档数据
  if (currentSaveData) {
    saveManager.addDialogueHistory(currentSaveData, narrative);
    
    // 应用状态变化
    if (result.state_changes) {
      // 应用玩家属性变化
      if (result.state_changes.player && result.state_changes.player.length > 0) {
        const attrChanges = {};
        const reputationChange = { reputation: 0 };
        
        result.state_changes.player.forEach(change => {
          if (change.includes('+')) {
            const [attr, value] = change.split('+');
            if (attr === 'reputation') {
              reputationChange.reputation = parseInt(value);
            } else {
              attrChanges[attr] = parseInt(value);
            }
          }
        });
        
        // 应用属性变化
        if (Object.keys(attrChanges).length > 0) {
          saveManager.updatePlayerAttributes(currentSaveData, {
            attrs: attrChanges
          });
        }
        
        // 应用声望变化
        if (reputationChange.reputation !== 0) {
          saveManager.updatePlayerAttributes(currentSaveData, {
            reputation: reputationChange.reputation
          });
        }
      }
      
      // 也检查result.result.effects中的变化
      if (result.result?.effects && result.result.effects.length > 0) {
        result.result.effects.forEach(effect => {
          if (effect.includes('reputation+')) {
            const value = parseInt(effect.replace('reputation+', ''));
            saveManager.updatePlayerAttributes(currentSaveData, {
              reputation: value
            });
          }
        });
      }
    }
    
    // 自动保存
    autoSave();
  }
  
  // 更新属性显示
  updateGameDataFromSave();
  
  render();
}

function submitInput() {
  console.log(`[DEBUG] submitInput currentInput: "${currentInput}"`);
  if (currentInput.trim() === '') return;
  
  const intentText = currentInput.trim();
  
  // 添加玩家输入到对话历史
  dialogueHistory.push(`你说：“${intentText}”`);
  dialogueHistory.push('（等待裁决结果...）');
  
  // 更新存档数据
  if (currentSaveData) {
    saveManager.addDialogueHistory(currentSaveData, `你说：“${intentText}”`);
    saveManager.addDialogueHistory(currentSaveData, '（等待裁决结果...）');
  }
  
  // 清空输入
  currentInput = '';
  wx.hideKeyboard();
  isKeyboardShowing = false;
  
  // 自动保存当前状态
  autoSave();
  
  render();
  
  // 构建请求数据
  const requestData = buildAdjudicationRequest();
  requestData.player_intent = intentText;
  
  console.log('发送裁决请求:', requestData.player_intent.substring(0, 50));
  
  // 调用服务端裁决API
  wx.request({
    url: ClientConfig.ADJUDICATION_API,
    method: 'POST',
    data: requestData,
    header: {
      'Content-Type': 'application/json'
    },
    timeout: ClientConfig.REQUEST_TIMEOUT,
    success: (res) => {
      console.log('裁决API响应状态:', res.statusCode);
      if (res.statusCode === 200) {
        // 移除等待提示
        if (dialogueHistory[dialogueHistory.length - 1] === '（等待裁决结果...）') {
          dialogueHistory.pop();
        }
        handleAdjudicationResult(res.data);
      } else {
        // 错误处理
        dialogueHistory.push('裁决服务暂时不可用，请稍后重试。');
        render();
      }
    },
    fail: (err) => {
      console.error('裁决API调用失败:', err);
      // 移除等待提示
      if (dialogueHistory[dialogueHistory.length - 1] === '（等待裁决结果...）') {
        dialogueHistory.pop();
      }
      // 使用模拟裁决作为兜底
      dialogueHistory.push('（网络连接失败，使用模拟裁决）');
      simulateAdjudication(intentText);
    }
  });
}

// 模拟裁决（兜底）
function simulateAdjudication(intentText) {
  setTimeout(() => {
    const narrative = "你的举动引起了县尉的注意，他对你的行为表示赞赏。";
    dialogueHistory.push(narrative);
    
    if (currentSaveData) {
      saveManager.addDialogueHistory(currentSaveData, narrative);
      // 模拟属性变化
      saveManager.updatePlayerAttributes(currentSaveData, {
        attrs: { intelligence: 1 },
        reputation: 3
      });
      autoSave();
      updateGameDataFromSave();
    }
    
    render();
  }, 1000);
}

// 自动保存
function autoSave() {
  if (!currentSaveData) return;
  
  const success = saveManager.save(currentSaveData, true);
  if (success) {
    console.log('自动保存成功');
  }
}

// 手动保存
function manualSave() {
  if (!currentSaveData) {
    // 创建新存档
    currentSaveData = saveManager.createNewSave(0, '手动存档');
    updateGameDataFromSave();
  }
  
  const success = saveManager.save(currentSaveData, false);
  if (success) {
    // 显示保存成功提示
    dialogueHistory.push('【游戏已保存】');
    render();
    
    // 3秒后移除提示
    setTimeout(() => {
      if (dialogueHistory[dialogueHistory.length - 1] === '【游戏已保存】') {
        dialogueHistory.pop();
        render();
      }
    }, 3000);
  }
}

// 加载最新存档
function loadLatestSave() {
  const saveList = saveManager.getSaveList();
  
  if (saveList.length > 0) {
    // 加载第一个存档
    currentSaveData = saveManager.load(0);
    if (currentSaveData) {
      updateGameDataFromSave();
      console.log('存档加载成功');
      return true;
    }
  }
  
  console.log('无存档可用，创建新存档');
  // 创建新存档
  currentSaveData = saveManager.createNewSave(0, '初始存档');
  if (currentSaveData) {
    updateGameDataFromSave();
    // 保存新存档
    saveManager.save(currentSaveData, false);
    console.log('新存档创建并保存成功');
    return true;
  }
  
  console.log('存档创建失败，使用默认数据');
  return false;
}

// 从存档数据更新游戏数据
function updateGameDataFromSave() {
  if (!currentSaveData) return;
  
  // 更新玩家属性
  playerAttributes = {
    strength: currentSaveData.player.attrs.strength || 75,
    intelligence: currentSaveData.player.attrs.intelligence || 82,
    charm: currentSaveData.player.attrs.charm || 68,
    luck: 55, // 默认值
    legend: currentSaveData.player.legend || 30
  };
  
  // 更新对话历史
  dialogueHistory = currentSaveData.dialogueHistory || [
    "建宁元年（公元168年），你醒来发现自己身处洛阳城外的小村庄。",
    "村中长者告诉你，黄巾之乱即将爆发，天下将乱。",
    "你可以选择投靠官府，也可以暗中结交豪杰，甚至加入太平道……"
  ];
}

// 切换存档/加载面板显示
function toggleSaveLoadPanel() {
  isSaveLoadPanelVisible = !isSaveLoadPanelVisible;
  render();
}

// 渲染游戏画面
function render() {
  // 清空画布
  ctx.clearRect(0, 0, screenWidth, screenHeight);
  
  // 绘制属性面板
  drawAttributePanel();
  
  // 绘制对话区域
  drawDialogueArea();
  
  // 绘制输入区域
  drawInputArea();
  
  // 绘制存档/加载面板（如果需要）
  if (isSaveLoadPanelVisible) {
    drawSaveLoadPanel();
  }
}

// 绘制属性面板
function drawAttributePanel() {
  const panel = uiAreas.attributePanel;
  
  // 背景
  ctx.fillStyle = '#2C3E50';
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
  
  // 标题
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('玩家属性', panel.width / 2, panel.y + 25);
  
  // 属性列表
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  const attributes = [
    `武力: ${playerAttributes.strength}`,
    `智力: ${playerAttributes.intelligence}`,
    `魅力: ${playerAttributes.charm}`,
    `运气: ${playerAttributes.luck}`,
    `传奇度: ${playerAttributes.legend}`
  ];
  
  const startX = 20;
  const startY = panel.y + 50;
  const spacing = 20;
  
  attributes.forEach((text, index) => {
    ctx.fillStyle = '#ECF0F1';
    ctx.fillText(text, startX, startY + index * spacing);
  });
  
  // 存档状态指示器
  const saveStatus = currentSaveData ? '已存档' : '新游戏';
  ctx.fillStyle = currentSaveData ? '#27AE60' : '#E74C3C';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`状态: ${saveStatus}`, panel.width - 20, panel.y + 25);
  
  // 存档按钮图标
  ctx.fillStyle = '#3498DB';
  ctx.fillRect(panel.width - 50, panel.y + 10, 40, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('存档', panel.width - 30, panel.y + 25);
}

// 绘制对话区域
function drawDialogueArea() {
  const area = uiAreas.dialogueArea;
  
  // 背景
  ctx.fillStyle = '#34495E';
  ctx.fillRect(area.x, area.y, area.width, area.height);
  
  // 文本内容
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  
  const padding = 20;
  const lineHeight = 24;
  let currentY = area.y + padding;
  
  // 绘制对话历史
  for (let i = 0; i < dialogueHistory.length; i++) {
    const text = dialogueHistory[i];
    
    // 检查是否需要换行（简单的文本换行）
    const maxWidth = area.width - padding * 2;
    const words = text.split('');
    let line = '';
    
    for (let j = 0; j < words.length; j++) {
      const testLine = line + words[j];
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && j > 0) {
        ctx.fillText(line, padding, currentY);
        currentY += lineHeight;
        line = words[j];
      } else {
        line = testLine;
      }
    }
    
    if (line) {
      ctx.fillText(line, padding, currentY);
      currentY += lineHeight;
    }
    
    // 检查是否超出区域
    if (currentY > area.y + area.height - padding) {
      ctx.fillStyle = '#E74C3C';
      ctx.fillText('（更多内容...）', padding, area.y + area.height - padding);
      break;
    }
    
    // 段落间距
    currentY += lineHeight / 2;
  }
}

// 绘制输入区域
function drawInputArea() {
  const area = uiAreas.inputArea;
  
  // 背景
  ctx.fillStyle = '#2C3E50';
  ctx.fillRect(area.x, area.y, area.width, area.height);
  
  // 输入框背景
  ctx.fillStyle = '#ECF0F1';
  const inputBoxHeight = 40;
  const inputBoxY = area.y + 20;
  ctx.fillRect(20, inputBoxY, area.width - 100, inputBoxHeight);
  
  // 输入文本
  ctx.fillStyle = '#2C3E50';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  const displayText = currentInput || '点击此处输入你的意图...';
  ctx.fillText(displayText, 25, inputBoxY + 25);
  
  // 发送按钮
  ctx.fillStyle = '#27AE60';
  ctx.fillRect(area.width - 70, inputBoxY, 60, inputBoxHeight);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('发送', area.width - 40, inputBoxY + 25);
  
  // 自动保存状态
  if (currentSaveData) {
    ctx.fillStyle = '#27AE60';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('自动保存已启用', 20, area.y + 10);
  }
}

// 绘制存档/加载面板
function drawSaveLoadPanel() {
  const panel = uiAreas.saveLoadPanel;
  
  // 背景
  ctx.fillStyle = 'rgba(44, 62, 80, 0.95)';
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
  
  // 边框
  ctx.strokeStyle = '#3498DB';
  ctx.lineWidth = 2;
  ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  
  // 标题
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('存档管理', panel.width / 2, panel.y + 25);
  
  // 存档按钮（左半部分）
  ctx.fillStyle = '#27AE60';
  ctx.fillRect(panel.width * 0.1, panel.y + 35, panel.width * 0.35, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('保存游戏', panel.width * 0.275, panel.y + 50);
  
  // 加载按钮（右半部分）
  ctx.fillStyle = '#3498DB';
  ctx.fillRect(panel.width * 0.55, panel.y + 35, panel.width * 0.35, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('关闭面板', panel.width * 0.725, panel.y + 50);
  
  // 存档信息
  if (currentSaveData) {
    const meta = currentSaveData.meta;
    ctx.fillStyle = '#ECF0F1';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    
    const infoLines = [
      `存档: ${meta.saveName}`,
      `玩家: ${meta.playerId.substring(0, 8)}...`,
      `时间: ${new Date(meta.lastSaved).toLocaleString()}`
    ];
    
    infoLines.forEach((text, index) => {
      ctx.fillText(text, 20, panel.y + 80 + index * 15);
    });
  } else {
    ctx.fillStyle = '#E74C3C';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('无存档数据，请先保存游戏', 20, panel.y + 80);
  }
}

// 游戏主循环
function gameLoop() {
  render();
  requestAnimationFrame(gameLoop);
}

// 测试辅助函数：设置当前输入
function setCurrentInput(input) {
  console.log(`[DEBUG] setCurrentInput called with: "${input}"`);
  currentInput = input;
}

// 导出函数供外部调用
module.exports = {
  initGame,
  gameLoop,
  handleTouch,
  showKeyboard,
  submitInput,
  manualSave,
  loadLatestSave,
  toggleSaveLoadPanel,
  render,
  setCurrentInput,
  getState: () => ({
    canvas,
    ctx,
    screenWidth,
    screenHeight,
    uiAreas,
    playerAttributes,
    dialogueHistory,
    currentInput,
    isKeyboardShowing,
    currentSaveData,
    isSaveLoadPanelVisible
  })
};