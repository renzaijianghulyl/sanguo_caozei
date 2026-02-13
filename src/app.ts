/**
 * 应用入口薄壳：对外暴露 gameApp 的公开 API，供 game.ts 及外部调用
 */
export {
  initGame,
  gameLoop,
  handleTouch,
  showKeyboard,
  submitInput,
  toggleSaveLoadPanel,
  manualSave,
  loadLatestSave,
  render,
  setCurrentInput,
  getState,
  onAppHide
} from "./app/gameApp";
export type { GameInitResult, GameState, TouchEvent } from "./app/gameApp";
