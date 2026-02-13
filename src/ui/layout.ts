export interface UIRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UILayout {
  safeMargin: number;
  attributePanel: UIRect;
  dialogueArea: UIRect;
  inputArea: UIRect;
  saveLoadPanel: UIRect;
}

export interface LayoutOptions {
  screenWidth: number;
  screenHeight: number;
  /** 顶部安全区域高度（刘海/状态栏），默认 0 */
  safeAreaTop?: number;
}

export function createUILayout(
  screenWidth: number,
  screenHeight: number,
  safeAreaTop = 0
): UILayout;
export function createUILayout(opts: LayoutOptions): UILayout;
export function createUILayout(
  screenWidthOrOpts: number | LayoutOptions,
  screenHeight?: number,
  safeAreaTop = 0
): UILayout {
  let screenWidth: number;
  let screenHeightVal: number;
  if (typeof screenWidthOrOpts === "object") {
    screenWidth = screenWidthOrOpts.screenWidth;
    screenHeightVal = screenWidthOrOpts.screenHeight;
    safeAreaTop = screenWidthOrOpts.safeAreaTop ?? 0;
  } else {
    screenWidth = screenWidthOrOpts;
    screenHeightVal = screenHeight ?? 667;
  }
  const topInset = Math.max(0, safeAreaTop);
  const safeMargin = Math.max(16, Math.min(24, Math.round(screenWidth * 0.04)));
  const contentWidth = screenWidth - safeMargin * 2;
  const gap = Math.max(10, Math.round(screenHeightVal * 0.012));

  const attributePanelHeight = Math.max(90, Math.min(100, Math.round(screenHeightVal * 0.1)));
  const inputAreaHeight = Math.max(72, Math.min(88, Math.round(screenHeightVal * 0.11)));
  const saveLoadPanelHeight = Math.max(64, Math.min(80, Math.round(screenHeightVal * 0.09)));

  const attributePanel: UIRect = {
    x: safeMargin,
    y: safeMargin + topInset,
    width: contentWidth,
    height: attributePanelHeight
  };

  const inputArea: UIRect = {
    x: safeMargin,
    y: screenHeightVal - safeMargin - inputAreaHeight,
    width: contentWidth,
    height: inputAreaHeight
  };

  const saveLoadPanel: UIRect = {
    x: safeMargin,
    y: inputArea.y - gap - saveLoadPanelHeight,
    width: contentWidth,
    height: saveLoadPanelHeight
  };

  const dialogueArea: UIRect = {
    x: safeMargin,
    y: attributePanel.y + attributePanel.height + gap,
    width: contentWidth,
    height: saveLoadPanel.y - (attributePanel.y + attributePanel.height) - gap * 2
  };

  return {
    safeMargin,
    attributePanel,
    dialogueArea,
    inputArea,
    saveLoadPanel
  };
}
