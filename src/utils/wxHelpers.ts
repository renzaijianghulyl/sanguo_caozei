type FrameRequestCallback = (time: number) => void;
type KeyboardInputHandler = (res: { value: string }) => void;
type KeyboardConfirmHandler = () => void;
type KeyboardCompleteHandler = () => void;
type TouchHandler = (event: { touches?: Array<{ x: number; y: number }> }) => void;

export type CanvasSurface = WechatMiniprogram.OffscreenCanvas | HTMLCanvasElement;

export interface SystemInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
}

function getWx(): any {
  return hasWx() ? (wx as any) : null;
}

export function hasWx(): boolean {
  return typeof wx !== "undefined";
}

export function getSystemInfo(): SystemInfo {
  const wxApi = getWx();
  if (wxApi && typeof wxApi.getSystemInfoSync === "function") {
    const info = wxApi.getSystemInfoSync();
    return {
      windowWidth: info.windowWidth || 375,
      windowHeight: info.windowHeight || 667,
      pixelRatio: info.pixelRatio || 2
    };
  }
  const win = typeof window !== "undefined" ? window : undefined;
  return {
    windowWidth: win?.innerWidth || 375,
    windowHeight: win?.innerHeight || 667,
    pixelRatio: win?.devicePixelRatio || 2
  };
}

export function createCanvas(): CanvasSurface | null {
  const wxApi = getWx();
  const systemInfo = getSystemInfo();
  const width = systemInfo.windowWidth * systemInfo.pixelRatio;
  const height = systemInfo.windowHeight * systemInfo.pixelRatio;

  if (wxApi && typeof wxApi.createCanvas === "function") {
    const canvas = wxApi.createCanvas();
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  console.warn("wx.createCanvas 不可用，返回 null。");
  return null;
}

export function onTouchStart(handler: TouchHandler): void {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.onTouchStart !== "function") {
    return;
  }
  wxApi.onTouchStart(handler as any);
}

export function onKeyboardInput(handler: KeyboardInputHandler): void {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.onKeyboardInput !== "function") {
    return;
  }
  wxApi.onKeyboardInput(handler as any);
}

export function onKeyboardConfirm(handler: KeyboardConfirmHandler): void {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.onKeyboardConfirm !== "function") {
    return;
  }
  wxApi.onKeyboardConfirm(handler as any);
}

export function onKeyboardComplete(handler: KeyboardCompleteHandler): void {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.onKeyboardComplete !== "function") {
    return;
  }
  wxApi.onKeyboardComplete(handler as any);
}

export function showKeyboard(defaultValue: string, maxLength = 100): void {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.showKeyboard !== "function") {
    console.warn("wx.showKeyboard 不可用。");
    return;
  }
  wxApi.showKeyboard({
    defaultValue,
    maxLength,
    multiple: false,
    confirmHold: false,
    confirmType: "send"
  });
}

export function hideKeyboard(): void {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.hideKeyboard !== "function") {
    return;
  }
  wxApi.hideKeyboard({});
}

export function request<T>({
  url,
  data,
  method = "POST",
  timeout = 15_000,
  header = { "Content-Type": "application/json" }
}: {
  url: string;
  data?: unknown;
  method?: WechatMiniprogram.RequestOption["method"];
  timeout?: number;
  header?: Record<string, string>;
}): Promise<{ statusCode: number; data: T }> {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.request !== "function") {
    return Promise.reject(new Error("wx.request 不可用，无法发起网络请求"));
  }

  return new Promise((resolve, reject) => {
    wxApi.request({
      url,
      data: data as WechatMiniprogram.IAnyObject,
      method,
      timeout,
      header,
      enableChunked: true,
      success(res: { statusCode: number; data: T }) {
        resolve({ statusCode: res.statusCode, data: res.data });
      },
      fail(error: unknown) {
        reject(error);
      }
    });
  });
}

export function nextFrame(callback: FrameRequestCallback): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(() => callback(Date.now()), 16);
}
