/**
 * 打字机效果：逐字显示叙事，支持点击跳过
 * 长跨度叙事模式：略快速度 + 段落间 500ms 停顿，模拟翻页节奏
 * 节流：每 N 字才触发一次 onTick（重绘），减少约一半的 render 调用
 */
const MS_PER_CHAR = 50;
const MS_PER_CHAR_FAST = 35;
const PARAGRAPH_PAUSE_MS = 500;
/** 每几个字触发一次 onTick（1 = 每字都触发，2 = 每两字触发一次重绘） */
const TICK_THROTTLE = 2;

/** 段落边界：以 】 或 双换行 结尾 */
function isParagraphEnd(s: string): boolean {
  return /(】|\n\n)\s*$/.test(s);
}

export interface TypewriterState {
  fullText: string;
  displayedLen: number;
}

export interface TypewriterOptions {
  /** 长叙事模式：加快速度，段落间 500ms 停顿 */
  isLongNarrative?: boolean;
}

export interface TypewriterController {
  start: (fullText: string, onComplete: () => void, options?: TypewriterOptions) => void;
  skip: () => boolean;
  getState: () => TypewriterState | null;
  clear: () => void;
}

export function createTypewriter(onTick: () => void): TypewriterController {
  let state: {
    fullText: string;
    displayedLen: number;
    onComplete: () => void;
    msPerChar: number;
  } | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let pauseTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function clear() {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
    if (pauseTimeoutId != null) {
      clearTimeout(pauseTimeoutId);
      pauseTimeoutId = null;
    }
  }

  function finish() {
    clear();
    const s = state;
    if (!s) return;
    state = null;
    s.onComplete();
    onTick();
  }

  function scheduleTick() {
    if (!state) return;
    timerId = setInterval(() => {
      if (!state) return;
      state.displayedLen += 1;
      if (state.displayedLen >= state.fullText.length) {
        finish();
        return;
      }
      const shown = state.fullText.slice(0, state.displayedLen);
      const isLong = state.msPerChar === MS_PER_CHAR_FAST;
      if (isLong && isParagraphEnd(shown)) {
        clearInterval(timerId!);
        timerId = null;
        pauseTimeoutId = setTimeout(() => {
          pauseTimeoutId = null;
          scheduleTick();
        }, PARAGRAPH_PAUSE_MS);
      }
      if (
        state.displayedLen === 1 ||
        state.displayedLen % TICK_THROTTLE === 0
      ) {
        onTick();
      }
    }, state.msPerChar);
  }

  function start(fullText: string, onComplete: () => void, options?: TypewriterOptions) {
    clear();
    const isLong = options?.isLongNarrative ?? false;
    state = {
      fullText,
      displayedLen: 0,
      onComplete,
      msPerChar: isLong ? MS_PER_CHAR_FAST : MS_PER_CHAR
    };
    scheduleTick();
    onTick();
  }

  function skip() {
    if (!state) return false;
    state.displayedLen = state.fullText.length;
    finish();
    return true;
  }

  function getState(): TypewriterState | null {
    return state ? { fullText: state.fullText, displayedLen: state.displayedLen } : null;
  }

  return { start, skip, getState, clear };
}
