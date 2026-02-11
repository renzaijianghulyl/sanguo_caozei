import {
  gameLoop,
  handleTouch,
  initGame,
  manualSave,
  render,
  setCurrentInput,
  showKeyboard,
  submitInput,
  toggleSaveLoadPanel
} from "./app";

let initialized = false;

function bootstrap() {
  if (initialized) {
    return;
  }
  const result = initGame();
  if (!result.ready) {
    console.error("游戏初始化失败:", result.message);
    return;
  }
  gameLoop();
  initialized = true;
  console.log("小游戏入口初始化完成（占位实现）");
}

const wxApi: any = typeof wx !== "undefined" ? wx : null;

if (wxApi && typeof wxApi.onShow === "function") {
  wxApi.onShow(() => {
    bootstrap();
  });

  wxApi.onHide(() => {
    console.log("游戏进入后台");
  });

  wxApi.onError((error: unknown) => {
    console.error("游戏错误:", error);
  });
} else {
  console.warn("wx 全局对象不可用，使用本地调试模式自动启动。");
  bootstrap();
}

export const game = {
  initGame,
  gameLoop,
  handleTouch,
  showKeyboard,
  submitInput,
  manualSave,
  toggleSaveLoadPanel,
  render,
  setCurrentInput
};

export type GameExports = typeof game;
