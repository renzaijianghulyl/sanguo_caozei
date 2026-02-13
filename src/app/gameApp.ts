import { ClientConfig, DEFAULT_NPC_STATE, DEFAULT_PLAYER_STATE, INITIAL_DIALOGUE } from "@config/index";
import { buildAdjudicationPayload } from "@core/snapshot";
import type { GameSaveData, PlayerAttributes, PlayerState, WorldState } from "@core/state";
import { clearInput, createInputState, setInputValue, setKeyboardVisible } from "@ui/input";
import { createUILayout, type UILayout } from "@ui/layout";
import { renderScreen } from "@ui/renderer";
import { saveManager } from "@services/storage/saveManager";
import { appendDialogue, removeLast } from "@utils/dialogueBuffer";
import {
  callAdjudication,
  type AdjudicationRequest,
  type AdjudicationResponse
} from "@services/network/adjudication";
import {
  createCanvas,
  type CanvasSurface,
  getSystemInfo,
  hasWx,
  hideKeyboard,
  nextFrame,
  onKeyboardComplete,
  onKeyboardConfirm,
  onKeyboardInput,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  showKeyboard as wxShowKeyboard
} from "@utils/wxHelpers";
import { requestRewardedAd } from "@services/ads/rewardedAd";
import { ensurePlayerInputSafe, sanitizeNarrative } from "@services/security/contentGuard";

export type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
export type TouchEvent = { touches?: Array<{ x: number; y: number }> };

export interface GameInitResult {
  ready: boolean;
  message?: string;
}

export interface GameState {
  initialized: boolean;
  input: ReturnType<typeof createInputState>;
  currentSaveData: GameSaveData | null;
  dialogueHistory: string[];
  playerAttributes: PlayerAttributes & { legend: number };
}

interface GameRuntime {
  canvas: CanvasSurface | null;
  ctx: CanvasCtx;
  layout: UILayout | null;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  playerAttributes: PlayerAttributes & { legend: number };
  dialogueHistory: string[];
  input: ReturnType<typeof createInputState>;
  isSaveLoadPanelVisible: boolean;
  currentSaveData: GameSaveData | null;
  isAdjudicating: boolean;
  loopActive: boolean;
  dialogueScrollOffset: number;
  touchStartY: number;
  touchStartScroll: number;
  isDialogueScrollActive: boolean;
}

const runtime: GameRuntime = {
  canvas: null,
  ctx: null,
  layout: null,
  screenWidth: 0,
  screenHeight: 0,
  pixelRatio: 1,
  playerAttributes: {
    strength: DEFAULT_PLAYER_STATE.attrs.strength,
    intelligence: DEFAULT_PLAYER_STATE.attrs.intelligence,
    charm: DEFAULT_PLAYER_STATE.attrs.charm,
    luck: DEFAULT_PLAYER_STATE.attrs.luck,
    legend: DEFAULT_PLAYER_STATE.legend
  },
  dialogueHistory: [...INITIAL_DIALOGUE],
  input: createInputState(),
  isSaveLoadPanelVisible: false,
  currentSaveData: null,
  isAdjudicating: false,
  loopActive: false,
  dialogueScrollOffset: 0,
  touchStartY: 0,
  touchStartScroll: 0,
  isDialogueScrollActive: false
};

let initialized = false;
let handlersRegistered = false;

function pointInRect(
  rect: { x?: number; y?: number; width: number; height: number },
  x: number,
  y: number
): boolean {
  const left = rect.x ?? 0;
  const top = rect.y ?? 0;
  return x >= left && x <= left + rect.width && y >= top && y <= top + rect.height;
}

function render(): void {
  if (!runtime.ctx || !runtime.layout) return;
  const placeholderIndex = Math.floor(Date.now() / 4000) % 3;
  renderScreen({
    ctx: runtime.ctx,
    layout: runtime.layout,
    screenWidth: runtime.screenWidth,
    screenHeight: runtime.screenHeight,
    playerAttributes: runtime.playerAttributes,
    dialogueHistory: runtime.dialogueHistory,
    currentInput: runtime.input.value,
    currentSaveData: runtime.currentSaveData,
    isSaveLoadPanelVisible: runtime.isSaveLoadPanelVisible,
    keyboardActive: runtime.input.isKeyboardVisible,
    dialogueScrollOffset: runtime.dialogueScrollOffset,
    placeholderIndex
  });
}

function autoSave(): void {
  if (!runtime.currentSaveData) return;
  saveManager.save(runtime.currentSaveData, true);
}

/** 切出时立即存档，供 wx.onHide 调用 */
export function onAppHide(): void {
  if (runtime.currentSaveData) {
    saveManager.save(runtime.currentSaveData, true);
  }
}

function updateGameDataFromSave(): void {
  if (!runtime.currentSaveData) return;
  runtime.playerAttributes = {
    strength: runtime.currentSaveData.player.attrs.strength ?? DEFAULT_PLAYER_STATE.attrs.strength,
    intelligence:
      runtime.currentSaveData.player.attrs.intelligence ?? DEFAULT_PLAYER_STATE.attrs.intelligence,
    charm: runtime.currentSaveData.player.attrs.charm ?? DEFAULT_PLAYER_STATE.attrs.charm,
    luck: runtime.currentSaveData.player.attrs.luck ?? DEFAULT_PLAYER_STATE.attrs.luck,
    legend: runtime.currentSaveData.player.legend ?? DEFAULT_PLAYER_STATE.legend
  };
  runtime.dialogueHistory =
    runtime.currentSaveData.dialogueHistory.length > 0
      ? [...runtime.currentSaveData.dialogueHistory]
      : [...INITIAL_DIALOGUE];
}

function dropWaitingPlaceholder(): void {
  const last = runtime.dialogueHistory.at(-1);
  if (last?.startsWith("（正在生成剧情") || last === "（等待裁决结果...）") {
    removeLast(runtime.dialogueHistory);
  }
}

function buildAdjudicationRequest(intent: string) {
  return buildAdjudicationPayload({
    saveData: runtime.currentSaveData,
    playerIntent: intent,
    recentDialogue: runtime.currentSaveData?.dialogueHistory?.slice(-5)
  });
}

function applyPlayerStateChanges(changes: string[]): void {
  if (!runtime.currentSaveData) return;
  const attrDelta: Partial<PlayerState["attrs"]> = {};
  const resourceDelta: Partial<PlayerState["resources"]> = {};
  let legendDelta = 0;
  let reputationDelta = 0;

  for (const change of changes) {
    const match = change.match(/^([a-zA-Z_]+)([+-]\d+)$/);
    if (!match) continue;
    const [, key, raw] = match;
    const value = Number(raw);
    if (Number.isNaN(value)) continue;
    if (key in runtime.currentSaveData!.player.attrs) {
      attrDelta[key as keyof PlayerState["attrs"]] =
        (attrDelta[key as keyof PlayerState["attrs"]] ?? 0) + value;
    } else if (key === "legend") {
      legendDelta += value;
    } else if (key === "reputation") {
      reputationDelta += value;
    } else if (key in runtime.currentSaveData!.player.resources) {
      resourceDelta[key as keyof PlayerState["resources"]] =
        (resourceDelta[key as keyof PlayerState["resources"]] ?? 0) + value;
    }
  }

  saveManager.updatePlayerAttributes(runtime.currentSaveData, {
    attrs: attrDelta,
    legend: legendDelta,
    reputation: reputationDelta,
    resources: resourceDelta
  });
}

function handleAdjudicationResult(response: AdjudicationResponse): void {
  runtime.dialogueScrollOffset = 0;
  const narrative = response.result?.narrative ?? "你的举动引起了注意。";
  sanitizeNarrative(narrative)
    .then((result) => {
      if (result.allowed && result.text) {
        appendDialogue(runtime.dialogueHistory, result.text);
      } else {
        appendDialogue(runtime.dialogueHistory, result.reason ?? "内容暂时不可用");
      }
      render();
    })
    .catch(() => {
      appendDialogue(runtime.dialogueHistory, narrative);
      render();
    });

  if (runtime.currentSaveData) {
    saveManager.addDialogueHistory(runtime.currentSaveData, narrative);
    if (response.state_changes?.player && response.state_changes.player.length > 0) {
      applyPlayerStateChanges(response.state_changes.player);
    }
    if (response.result?.effects) {
      applyPlayerStateChanges(response.result.effects);
    }
    if (response.state_changes?.world) {
      saveManager.updateWorldState(runtime.currentSaveData, response.state_changes.world);
    }
    autoSave();
    updateGameDataFromSave();
  }

  const effects = response.result?.effects ?? [];
  if (effects.some((e) => e.includes("legend+") || e.includes("gold+"))) {
    requestRewardedAd("legend-boost");
  }
}

function simulateAdjudication(intent: string): void {
  setTimeout(() => {
    const fallback = "你的举动引起了县尉的注意，他对你的行为表示赞赏。";
    sanitizeNarrative(fallback)
      .then((result) => {
        if (result.allowed && result.text) {
          appendDialogue(runtime.dialogueHistory, result.text);
        } else {
          appendDialogue(runtime.dialogueHistory, result.reason ?? "内容暂时不可用");
        }
      })
      .finally(() => {
        if (runtime.currentSaveData) {
          saveManager.addDialogueHistory(runtime.currentSaveData, fallback);
          saveManager.updatePlayerAttributes(runtime.currentSaveData, {
            attrs: { intelligence: 1 },
            reputation: 3
          });
          autoSave();
          updateGameDataFromSave();
        }
        render();
      });
  }, 1000);
}

/** 本地指令类型，供单测使用 */
export type LocalIntentType = "help" | "save" | "load" | "about" | "ad" | null;

/** 纯函数：判断输入是否为本地指令，不产生副作用 */
export function getLocalIntentType(intent: string): LocalIntentType {
  const n = intent.trim().toLowerCase();
  if (["help", "帮助", "指令"].includes(n)) return "help";
  if (["存档", "保存", "save"].includes(n)) return "save";
  if (["读档", "载入", "load"].includes(n)) return "load";
  if (["你是谁", "who are you", "about"].includes(n)) return "about";
  if (["广告", "福利", "reward"].includes(n)) return "ad";
  return null;
}

async function tryHandleLocalIntent(intent: string): Promise<boolean> {
  const type = getLocalIntentType(intent);
  if (!type) return false;
  if (type === "help") {
    appendDialogue(runtime.dialogueHistory, [
      "【指令提示】直接输入以下命令，无需调用裁决：",
      "• 存档 / 保存 / save — 手动保存进度",
      "• 读档 / 载入 / load — 加载最新存档",
      "• 你是谁 / about — 了解游戏",
      "• 广告 / 福利 — 观看激励广告",
      "【玩法】输入剧情意图（如「前往洛阳」「打听消息」「投靠曹操」）可推进故事，武力、智力等属性会影响剧情走向。"
    ]);
    render();
    return true;
  }
  if (type === "save") {
    manualSave();
    return true;
  }
  if (type === "load") {
    const loaded = loadLatestSave();
    appendDialogue(
      runtime.dialogueHistory,
      loaded ? "【提示】最新存档已加载。" : "【提示】暂无可用存档。"
    );
    render();
    return true;
  }
  if (type === "about") {
    appendDialogue(runtime.dialogueHistory, "我是一名负责主持冒险的军机参谋，随时记录你的每一次抉择。");
    render();
    return true;
  }
  if (type === "ad") {
    requestRewardedAd("user-request");
    appendDialogue(runtime.dialogueHistory, "广告加载中，完成观看可获得额外资源奖励。");
    render();
    return true;
  }
  return false;
}

function registerWxHandlers(): void {
  if (handlersRegistered || !hasWx()) return;
  onTouchStart((evt) => handleTouch(evt));
  onTouchMove((evt) => handleTouchMove(evt));
  onTouchEnd((evt) => handleTouchEnd(evt));
  onKeyboardInput((evt) => {
    setInputValue(runtime.input, evt.value);
    render();
  });
  onKeyboardConfirm(() => {
    submitInput().catch((err) => console.error(err));
  });
  onKeyboardComplete(() => {
    setKeyboardVisible(runtime.input, false);
    render();
  });
  handlersRegistered = true;
}

function handleInputAreaTouch(x: number, y: number): void {
  if (!runtime.layout) return;
  const area = runtime.layout.inputArea;
  const pad = 12;
  const btnWidth = 64;
  const sendButton = {
    x: area.x! + area.width - pad - btnWidth,
    y: area.y! + pad,
    width: btnWidth,
    height: area.height - pad * 2
  };
  if (pointInRect(sendButton, x, y)) {
    submitInput().catch((err) => console.error(err));
  } else {
    showKeyboard();
  }
}

export function initGame(): GameInitResult {
  if (initialized) return { ready: true };
  const canvas = createCanvas();
  if (!canvas) return { ready: false, message: "无法创建 Canvas，上下文不可用" };

  const systemInfo = getSystemInfo();
  const pixelRatio = systemInfo.pixelRatio || 1;
  const logicalWidth = systemInfo.windowWidth;
  const logicalHeight = systemInfo.windowHeight;
  const ctx = canvas.getContext("2d") as CanvasCtx;
  if (!ctx) return { ready: false, message: "无法获取 CanvasRenderingContext2D" };

  if (pixelRatio !== 1 && typeof ctx.scale === "function") {
    ctx.scale(pixelRatio, pixelRatio);
  }

  runtime.canvas = canvas;
  runtime.ctx = ctx;
  runtime.screenWidth = logicalWidth;
  runtime.screenHeight = logicalHeight;
  runtime.pixelRatio = pixelRatio;
  runtime.layout = createUILayout(runtime.screenWidth, runtime.screenHeight, systemInfo.safeAreaTop ?? 0);

  saveManager.init();
  loadLatestSave();
  registerWxHandlers();
  render();

  initialized = true;
  return { ready: true };
}

export function gameLoop(): void {
  if (runtime.loopActive) return;
  runtime.loopActive = true;
  const tick = () => {
    render();
    nextFrame(tick);
  };
  nextFrame(tick);
}

function getTouchPoint(event: TouchEvent): { x: number; y: number } | null {
  const touchPoint = event.touches?.[0] ?? (event as unknown as { changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }> }).changedTouches?.[0];
  if (!touchPoint) return null;
  const rawX = (touchPoint as { clientX?: number; x?: number }).clientX ?? (touchPoint as { x?: number }).x;
  const rawY = (touchPoint as { clientY?: number; y?: number }).clientY ?? (touchPoint as { y?: number }).y;
  if (rawX == null || rawY == null) return null;
  const ratio = runtime.pixelRatio > 0 ? runtime.pixelRatio : 1;
  const usedClient = typeof (touchPoint as { clientX?: number }).clientX === "number";
  return { x: usedClient ? rawX : rawX / ratio, y: usedClient ? rawY : rawY / ratio };
}

export function handleTouchMove(event: TouchEvent): void {
  if (!runtime.isDialogueScrollActive || !runtime.layout) return;
  const pt = getTouchPoint(event);
  if (!pt) return;
  const deltaY = runtime.touchStartY - pt.y;
  const maxScroll = Math.max(0, runtime.dialogueHistory.length * 50 - runtime.layout.dialogueArea.height);
  runtime.dialogueScrollOffset = Math.max(0, Math.min(maxScroll, runtime.touchStartScroll + deltaY));
  runtime.touchStartY = pt.y;
  runtime.touchStartScroll = runtime.dialogueScrollOffset;
}

export function handleTouchEnd(event: TouchEvent): void {
  runtime.isDialogueScrollActive = false;
}

export function handleTouch(event: TouchEvent): void {
  if (!runtime.layout) return;
  const pt = getTouchPoint(event);
  if (!pt) return;
  const { x, y } = pt;

  if (ClientConfig.DEBUG_TOUCH && typeof wx !== "undefined" && wx.showToast) {
    wx.showToast({ title: `x:${Math.round(x)} y:${Math.round(y)}`, icon: "none", duration: 500 });
  }

  const { inputArea, saveLoadPanel, attributePanel, dialogueArea } = runtime.layout;
  if (pointInRect(inputArea, x, y)) {
    handleInputAreaTouch(x, y);
    return;
  }

  if (pointInRect(dialogueArea, x, y)) {
    runtime.isDialogueScrollActive = true;
    runtime.touchStartY = y;
    runtime.touchStartScroll = runtime.dialogueScrollOffset;
    return;
  }

  if (runtime.isSaveLoadPanelVisible && pointInRect(saveLoadPanel, x, y)) {
    const leftHalfRight = (saveLoadPanel.x ?? 0) + saveLoadPanel.width / 2;
    if (x < leftHalfRight) manualSave();
    else toggleSaveLoadPanel();
    return;
  }

  const attrRight = (attributePanel.x ?? 0) + attributePanel.width - 60;
  if (pointInRect(attributePanel, x, y) && x >= attrRight) {
    toggleSaveLoadPanel();
  }
}

export function showKeyboard(): void {
  setKeyboardVisible(runtime.input, true);
  wxShowKeyboard(runtime.input.value);
  render();
}

export async function submitInput(): Promise<void> {
  if (runtime.isAdjudicating) {
    if (typeof wx !== "undefined" && wx.showToast) {
      wx.showToast({ title: "正在处理，请稍候", icon: "none", duration: 1500 });
    }
    return;
  }
  const trimmed = runtime.input.value.trim();
  if (!trimmed) return;

  const localHandled = await tryHandleLocalIntent(trimmed);
  if (localHandled) {
    clearInput(runtime.input);
    hideKeyboard();
    setKeyboardVisible(runtime.input, false);
    render();
    return;
  }

  const auditResult = await ensurePlayerInputSafe(trimmed);
  if (!auditResult.allowed) {
    appendDialogue(runtime.dialogueHistory, auditResult.reason ?? "输入未通过安全审核");
    render();
    return;
  }

  const waitingMsg = "（正在生成剧情，请稍候…首次响应可能需 5～15 秒）";
  appendDialogue(runtime.dialogueHistory, [`你说："${trimmed}"`, waitingMsg]);
  if (runtime.currentSaveData) {
    saveManager.addDialogueHistory(runtime.currentSaveData, [`你说："${trimmed}"`, waitingMsg]);
  }

  clearInput(runtime.input);
  hideKeyboard();
  setKeyboardVisible(runtime.input, false);
  autoSave();
  render();

  runtime.isAdjudicating = true;
  const payload = buildAdjudicationRequest(trimmed);
  const apiUrl = ClientConfig.ADJUDICATION_API;
  const isLocalhost = /localhost|127\.0\.0\.1/.test(apiUrl);
  const isDevice = typeof wx !== "undefined" && ["android", "ios"].includes(String(wx.getSystemInfoSync?.()?.platform ?? "").toLowerCase());
  const useCloud = Boolean(typeof wx !== "undefined" && (wx as { cloud?: { callFunction?: unknown } }).cloud?.callFunction && ClientConfig.CLOUD_ENV);

  if (isLocalhost && isDevice && !useCloud) {
    dropWaitingPlaceholder();
    simulateAdjudication(trimmed);
    runtime.isAdjudicating = false;
    return;
  }

  try {
    const response = await callAdjudication(payload);
    dropWaitingPlaceholder();
    handleAdjudicationResult(response);
  } catch (error) {
    dropWaitingPlaceholder();
    runtime.dialogueScrollOffset = 0;
    const errMsg = error instanceof Error ? error.message : "裁决请求失败";
    appendDialogue(
      runtime.dialogueHistory,
      `裁决失败：${errMsg}（请检查云函数配置与网络，或稍后重试）`
    );
    render();
    console.warn("裁决 API 调用失败:", error);
  } finally {
    runtime.isAdjudicating = false;
  }
}

export function toggleSaveLoadPanel(): void {
  runtime.isSaveLoadPanelVisible = !runtime.isSaveLoadPanelVisible;
  render();
}

export function manualSave(): void {
  if (!runtime.currentSaveData) {
    runtime.currentSaveData = saveManager.createNewSave(0, "手动存档");
  }
  if (saveManager.save(runtime.currentSaveData, false)) {
    appendDialogue(runtime.dialogueHistory, "【游戏已保存】");
    render();
    setTimeout(() => {
      if (runtime.dialogueHistory.at(-1) === "【游戏已保存】") {
        removeLast(runtime.dialogueHistory);
        render();
      }
    }, 5000);
  }
}

export function loadLatestSave(): boolean {
  const loaded = saveManager.load(0);
  if (loaded) {
    runtime.currentSaveData = loaded;
    updateGameDataFromSave();
    return true;
  }
  const newSave = saveManager.createNewSave(0, "初始存档");
  if (!saveManager.save(newSave, false)) {
    runtime.currentSaveData = null;
    runtime.dialogueHistory = [...INITIAL_DIALOGUE];
    return false;
  }
  runtime.currentSaveData = newSave;
  updateGameDataFromSave();
  return true;
}

export function setCurrentInput(value: string): void {
  setInputValue(runtime.input, value);
  render();
}

export function getState(): GameState {
  return {
    initialized,
    input: runtime.input,
    currentSaveData: runtime.currentSaveData,
    dialogueHistory: runtime.dialogueHistory,
    playerAttributes: runtime.playerAttributes
  };
}

export { render };
