export type CanvasSurface = WechatMiniprogram.OffscreenCanvas;

export interface SystemInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  /** 状态栏高度，刘海屏设备用于顶部留白 */
  statusBarHeight: number;
  /** 安全区域顶部偏移（刘海/异形屏），无则取 statusBarHeight */
  safeAreaTop: number;
  /** 安全区域底部留白（Home 条/异形屏），输入区应在此之上 */
  safeAreaBottom: number;
}

type TouchEventShape = {
  touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>;
  changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>;
};
type TouchHandler = (event: TouchEventShape) => void;
type KeyboardInputHandler = (res: { value: string }) => void;
type KeyboardConfirmHandler = () => void;
type KeyboardCompleteHandler = () => void;
type FrameRequestCallback = (time: number) => void;

export function hasWx(): boolean {
  return typeof wx !== "undefined";
}

function getWx(): WechatMiniprogram.Wx {
  return wx;
}

export function getSystemInfo(): SystemInfo {
  const info = getWx().getSystemInfoSync() as {
    windowWidth?: number;
    windowHeight?: number;
    pixelRatio?: number;
    statusBarHeight?: number;
    safeArea?: { top?: number; bottom?: number };
  };
  const statusBar = info.statusBarHeight ?? 0;
  const safeTop = info.safeArea?.top ?? statusBar;
  const winH = info.windowHeight ?? 667;
  const safeBottom = info.safeArea?.bottom;
  const bottomInset =
    safeBottom != null ? Math.max(0, winH - safeBottom) : 0;
  return {
    windowWidth: info.windowWidth || 375,
    windowHeight: winH,
    pixelRatio: info.pixelRatio || 2,
    statusBarHeight: statusBar,
    safeAreaTop: Math.max(statusBar, safeTop, 0),
    safeAreaBottom: bottomInset
  };
}

type MenuButtonRect = { left?: number; top?: number; height?: number; width?: number };

/** 微信小程序右上角胶囊左边界 x（逻辑坐标），用于布局避让；无 API 时返回 undefined */
export function getMenuButtonCapsuleLeft(): number | undefined {
  const rect = getMenuButtonRect();
  return typeof rect?.left === "number" ? rect.left : undefined;
}

/** 微信小程序右上角胶囊位置与尺寸（逻辑坐标），用于与「系统」按钮对齐；无 API 时返回 undefined */
export function getMenuButtonRect(): MenuButtonRect | undefined {
  if (typeof wx === "undefined" || typeof (wx as { getMenuButtonBoundingClientRect?: () => MenuButtonRect }).getMenuButtonBoundingClientRect !== "function") {
    return undefined;
  }
  try {
    const rect = (wx as { getMenuButtonBoundingClientRect: () => MenuButtonRect }).getMenuButtonBoundingClientRect();
    return rect && (typeof rect.left === "number" || typeof rect.top === "number") ? rect : undefined;
  } catch {
    return undefined;
  }
}

export function createCanvas(): CanvasSurface | null {
  if (!hasWx() || typeof wx.createCanvas !== "function") {
    return null;
  }
  const info = getSystemInfo();
  const canvas = wx.createCanvas();
  canvas.width = info.windowWidth * info.pixelRatio;
  canvas.height = info.windowHeight * info.pixelRatio;
  return canvas;
}

export function onTouchStart(handler: TouchHandler): void {
  if (!hasWx()) return;
  const fn = (wx as { onTouchStart?: (h: TouchHandler) => void }).onTouchStart;
  if (typeof fn !== "function") {
    console.warn("[wxHelpers] wx.onTouchStart 不可用，触摸将无法响应");
    return;
  }
  fn.call(wx, handler as any);
}

export function onTouchMove(handler: TouchHandler): void {
  if (!hasWx()) return;
  const fn = (wx as { onTouchMove?: (h: TouchHandler) => void }).onTouchMove;
  if (typeof fn === "function") fn.call(wx, handler as any);
}

export function onTouchEnd(handler: TouchHandler): void {
  if (!hasWx()) return;
  const fn = (wx as { onTouchEnd?: (h: TouchHandler) => void }).onTouchEnd;
  if (typeof fn === "function") fn.call(wx, handler as any);
}

export function onKeyboardInput(handler: KeyboardInputHandler): void {
  if (!hasWx() || typeof wx.onKeyboardInput !== "function") return;
  wx.onKeyboardInput(handler as any);
}

export function onKeyboardConfirm(handler: KeyboardConfirmHandler): void {
  if (!hasWx() || typeof wx.onKeyboardConfirm !== "function") return;
  wx.onKeyboardConfirm(handler as any);
}

export function onKeyboardComplete(handler: KeyboardCompleteHandler): void {
  if (!hasWx() || typeof wx.onKeyboardComplete !== "function") return;
  wx.onKeyboardComplete(handler as any);
}

export function showKeyboard(defaultValue: string, maxLength = 100): void {
  if (!hasWx() || typeof wx.showKeyboard !== "function") return;
  try {
    const info = wx.getSystemInfoSync();
    const platform = String(info?.platform || "").toLowerCase();
    if (platform === "devtools" || platform === "mac" || platform === "windows") return;
    wx.showKeyboard({
      defaultValue: defaultValue || "",
      maxLength: Math.max(1, Math.min(maxLength, 200)),
      multiple: false,
      confirmHold: false,
      confirmType: "done"
    });
  } catch {
    try {
      wx.hideKeyboard({});
    } catch {
      /* ignore */
    }
  }
}

export function hideKeyboard(): void {
  if (!hasWx() || typeof wx.hideKeyboard !== "function") return;
  wx.hideKeyboard({});
}

export function nextFrame(callback: FrameRequestCallback): void {
  if (typeof wx !== "undefined" && typeof (wx as any).requestAnimationFrame === "function") {
    (wx as any).requestAnimationFrame(callback);
    return;
  }
  setTimeout(() => callback(Date.now()), 16);
}

export function request<T>(opts: {
  url: string;
  data?: unknown;
  method?: WechatMiniprogram.RequestOption["method"];
  header?: Record<string, string>;
  timeout?: number;
}): Promise<{ statusCode: number; data: T }> {
  if (!hasWx() || typeof wx.request !== "function") {
    return Promise.reject(new Error("wx.request 不可用"));
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: opts.url,
      data: opts.data as WechatMiniprogram.IAnyObject,
      method: opts.method || "POST",
      header: opts.header || { "Content-Type": "application/json" },
      timeout: opts.timeout ?? 15000,
      enableChunked: true,
      success(res) {
        resolve({ statusCode: res.statusCode, data: res.data as T });
      },
      fail(err) {
        reject(err instanceof Error ? err : new Error("wx.request 调用失败"));
      }
    });
  });
}
