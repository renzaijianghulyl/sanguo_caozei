// 游戏入口文件
// 微信小游戏启动逻辑

const game = require('./src/client/main.js');

let canvas = null;
let gameInitialized = false;

// 启动游戏
wx.onShow(() => {
  if (!gameInitialized) {
    game.initGame();
    game.gameLoop();
    gameInitialized = true;
    console.log('游戏启动完成');
  }
});

wx.onHide(() => {
  console.log('游戏进入后台');
});

// 处理错误
wx.onError((error) => {
  console.error('游戏错误:', error);
});

// 导出全局变量（如果需要）
module.exports = {
  game
};