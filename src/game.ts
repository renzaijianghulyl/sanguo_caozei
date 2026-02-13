/**
 * 微信小游戏入口：仅负责生命周期与 bootstrap，业务逻辑在 app/gameApp
 */
import { gameLoop, initGame, onAppHide } from "./app";
import { ClientConfig } from "./config";

let bootstrapped = false;

function bootstrap(): void {
  if (bootstrapped) return;
  if (typeof wx !== "undefined" && (wx as { cloud?: { init?: (opts: { env: string }) => void } }).cloud?.init && ClientConfig.CLOUD_ENV) {
    (wx as { cloud: { init: (opts: { env: string }) => void } }).cloud.init({ env: ClientConfig.CLOUD_ENV });
  }
  const result = initGame();
  if (!result.ready) {
    console.error("游戏初始化失败:", result.message);
    return;
  }
  gameLoop();
  bootstrapped = true;
}

if (typeof wx !== "undefined" && typeof wx.onShow === "function") {
  wx.onShow(bootstrap);
  wx.onHide(() => {
    onAppHide();
  });
  wx.onError((err: unknown) => {
    console.error("游戏错误:", err);
  });
}
