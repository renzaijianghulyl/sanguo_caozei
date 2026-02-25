export interface UIRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UILayout {
  safeMargin: number;
  /** 胶囊左侧可用宽度（时间/地点/资源+菜单按钮），仅顶部一行使用 */
  contentWidthTop: number;
  /** 顶部状态区：上行为信息模块+菜单，下行为属性行（全宽） */
  statusPanel: UIRect;
  dialogueArea: UIRect;
  /** 行动引导槽：3 个可选动作按钮，位于对话区与输入区之间 */
  actionGuideSlot: UIRect;
  inputArea: UIRect;
  /** 微信胶囊垂直中心 Y（逻辑坐标），用于「系统」按钮与胶囊中线对齐；无则按行高居中 */
  capsuleCenterY?: number;
  /** 微信胶囊高度，用于「系统」按钮高度与胶囊一致 */
  capsuleHeight?: number;
}

export interface LayoutOptions {
  screenWidth: number;
  screenHeight: number;
  /** 顶部安全区域高度（刘海/状态栏），默认 0 */
  safeAreaTop?: number;
  /** 底部安全区域高度（Home 条等），默认 0 */
  safeAreaBottom?: number;
  /** 内容区右边界上限（如微信胶囊左边界），避免与右上角胶囊重叠；不传则用屏宽 */
  safeAreaRight?: number;
  /** 微信胶囊中心 Y，用于系统按钮对齐 */
  capsuleCenterY?: number;
  /** 微信胶囊高度，用于系统按钮高度 */
  capsuleHeight?: number;
}

export function createUILayout(
  screenWidth: number,
  screenHeight: number,
  safeAreaTop?: number,
  safeAreaBottom?: number
): UILayout;
export function createUILayout(opts: LayoutOptions): UILayout;
export function createUILayout(
  screenWidthOrOpts: number | LayoutOptions,
  screenHeight?: number,
  safeAreaTop?: number,
  safeAreaBottom?: number
): UILayout {
  let screenWidth: number;
  let screenHeightVal: number;
  let safeAreaRight: number | undefined;
  let capsuleCenterY: number | undefined;
  let capsuleHeight: number | undefined;
  if (typeof screenWidthOrOpts === "object") {
    const opts = screenWidthOrOpts;
    screenWidth = opts.screenWidth;
    screenHeightVal = opts.screenHeight;
    safeAreaTop = opts.safeAreaTop;
    safeAreaBottom = opts.safeAreaBottom;
    safeAreaRight = opts.safeAreaRight;
    capsuleCenterY = opts.capsuleCenterY;
    capsuleHeight = opts.capsuleHeight;
  } else {
    screenWidth = screenWidthOrOpts;
    screenHeightVal = screenHeight ?? 667;
  }
  const topInset = Math.max(0, safeAreaTop ?? 0);
  const bottomInset = Math.max(0, safeAreaBottom ?? 0);
  const safeMargin = Math.max(16, Math.min(24, Math.round(screenWidth * 0.04)));
  /** 主内容区全宽（对话、行动槽、输入区在胶囊下方，无需避让） */
  const contentWidthMain = screenWidth - safeMargin * 2;
  /** 仅顶部区域（时间条、状态栏、生平）需避让胶囊，使用收窄宽度 */
  const contentRightLimit = safeAreaRight != null ? safeAreaRight - safeMargin : screenWidth - safeMargin;
  const contentWidthTop = Math.min(contentWidthMain, Math.max(0, contentRightLimit - safeMargin));
  const gap = Math.max(10, Math.round(screenHeightVal * 0.012));

  const statusPanelHeight = Math.max(126, Math.min(146, Math.round(screenHeightVal * 0.18)));
  const inputAreaHeight = Math.max(58, Math.min(72, Math.round(screenHeightVal * 0.09)));
  const actionGuideHeight = Math.max(52, Math.min(60, Math.round(screenHeightVal * 0.075)));

  const statusPanel: UIRect = {
    x: safeMargin,
    y: safeMargin + topInset,
    width: contentWidthMain,
    height: statusPanelHeight
  };

  const inputArea: UIRect = {
    x: safeMargin,
    y: screenHeightVal - bottomInset - safeMargin - inputAreaHeight,
    width: contentWidthMain,
    height: inputAreaHeight
  };

  const actionGuideSlot: UIRect = {
    x: safeMargin,
    y: inputArea.y - gap - actionGuideHeight,
    width: contentWidthMain,
    height: actionGuideHeight
  };

  const dialogueArea: UIRect = {
    x: safeMargin,
    y: statusPanel.y + statusPanel.height + gap,
    width: contentWidthMain,
    height: actionGuideSlot.y - (statusPanel.y + statusPanel.height) - gap * 2
  };

  return {
    safeMargin,
    contentWidthTop,
    statusPanel,
    dialogueArea,
    actionGuideSlot,
    inputArea,
    capsuleCenterY,
    capsuleHeight
  };
}
