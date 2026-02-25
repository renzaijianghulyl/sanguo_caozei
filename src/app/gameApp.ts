import {
  ATTR_BONUS_POINTS,
  ASPIRATION_QUESTION,
  ClientConfig,
  DEFAULT_NPC_STATE,
  DEFAULT_PLAYER_STATE,
  getIntroSequence,
  INITIAL_DIALOGUE,
  INPUT_HINT_FIXED
} from "@config/index";
import { resolveAspiration } from "./aspirationParser";
import { bootstrapSanguoDb } from "../data/sanguoDb";
import { processPlayerAction } from "@core/actionProcessor";
import {
  buildAdjudicationRequest,
  applyTypewriterCompletion as applyTypewriterCompletionFlow,
  handleAdjudicationResult as handleAdjudicationResultFlow,
  type TypewriterCompletionContext,
  type HandleAdjudicationResultContext
} from "./adjudicationFlow";
import {
  loadLatestSave as lifecycleLoadLatestSave,
  manualSave as lifecycleManualSave,
  onAppHide as lifecycleOnAppHide
} from "./lifecycle";
import {
  getLocalIntentType,
  getLastPlayerIntent,
  type LocalIntentType
} from "./localIntents";
import type { GameSaveData, PlayerAttributes, PlayerState, WorldState } from "@core/state";
import { clearInput, createInputState, setInputValue, setKeyboardVisible } from "@ui/input";
import { createUILayout, type UILayout } from "@ui/layout";
import {
  ATTR_EXPLANATIONS,
  DEFAULT_CREATION_FORM,
  createCharacterCreationLayout,
  getCreationTouchTargets,
  renderCharacterCreation
} from "@ui/characterCreation";
import type { RenderState } from "@ui/renderer";
import {
  getActionGuideChipRects,
  getAttrHelpButtonRect,
  invalidateDialogueCache,
  lastDialogueTotalHeight,
  renderScreen
} from "@ui/renderer";
import {
  getStatusMenuButtonRect,
  getStatusMenuPopupRects
} from "@ui/menu";
import { getSuggestedActions } from "../data/actionSuggestions";
import { createSplashLayout, renderSplash } from "@ui/splash";
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
  getMenuButtonCapsuleLeft,
  getMenuButtonRect,
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
import { createTypewriter } from "./typewriter";
import { playAmbientAudio } from "@services/audio/ambientAudio";
import { requestRewardedAd } from "@services/ads/rewardedAd";
import { ensurePlayerInputSafe, sanitizeNarrative } from "@services/security/contentGuard";
import {
  recordAdjudicationFailure,
  recordSanitizeFailure,
  getLatestFeedbackSnapshot
} from "@services/security/feedbackLogger";

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

type GamePhase = "splash" | "characterCreation" | "aspirationSetting" | "playing";

interface GameRuntime {
  canvas: CanvasSurface | null;
  ctx: CanvasCtx;
  layout: UILayout | null;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  phase: GamePhase;
  splashLayout: ReturnType<typeof createSplashLayout> | null;
  creationLayout: ReturnType<typeof createCharacterCreationLayout> | null;
  creationForm: import("@ui/characterCreation").CharacterCreationForm;
  playerAttributes: PlayerAttributes & { legend: number };
  dialogueHistory: string[];
  input: ReturnType<typeof createInputState>;
  currentSaveData: GameSaveData | null;
  isAdjudicating: boolean;
  loopActive: boolean;
  dialogueScrollOffset: number;
  /** 平滑滚动目标，非 null 时每帧向目标插值 */
  targetScrollOffset: number | null;
  touchStartY: number;
  touchStartScroll: number;
  isDialogueScrollActive: boolean;
  /** 行动引导槽：3 个可选动作，裁决后更新 */
  suggestedActions: string[];
  /** 是否已对开场长文案做过「从顶部显示」的校正，避免重复把用户拉回顶部 */
  appliedInitialDialogueScrollTop?: boolean;
  /** 属性说明弹窗是否显示（点击属性说明按钮或输入「属性说明」时为 true） */
  attrsModalVisible: boolean;
  /** TimeBanner 已展示到的年份，用于年份跨越闪烁 */
  lastDisplayedYearForBanner?: number;
  /** 年份跨越闪烁结束时间戳 */
  yearChangeFlashUntil?: number;
  /** 生平回顾弹窗是否显示 */
  historyModalVisible?: boolean;
  /** 状态栏菜单（生平/重新开始）是否展开 */
  statusMenuVisible?: boolean;
}

const runtime: GameRuntime = {
  canvas: null,
  ctx: null,
  layout: null,
  screenWidth: 0,
  screenHeight: 0,
  pixelRatio: 1,
  phase: "splash",
  splashLayout: null,
  creationLayout: null,
  creationForm: { ...DEFAULT_CREATION_FORM },
  playerAttributes: {
    strength: DEFAULT_PLAYER_STATE.attrs.strength,
    intelligence: DEFAULT_PLAYER_STATE.attrs.intelligence,
    charm: DEFAULT_PLAYER_STATE.attrs.charm,
    luck: DEFAULT_PLAYER_STATE.attrs.luck,
    legend: DEFAULT_PLAYER_STATE.legend
  },
  dialogueHistory: [...INITIAL_DIALOGUE],
  input: createInputState(),
  currentSaveData: null,
  isAdjudicating: false,
  loopActive: false,
  dialogueScrollOffset: 0,
  targetScrollOffset: null,
  touchStartY: 0,
  touchStartScroll: 0,
  isDialogueScrollActive: false,
  suggestedActions: [],
  attrsModalVisible: false
};

let initialized = false;
let handlersRegistered = false;

let typewriter: ReturnType<typeof createTypewriter> | null = null;

const renderState: RenderState = {
  ctx: null as unknown as RenderState["ctx"],
  layout: null as unknown as RenderState["layout"],
  screenWidth: 0,
  screenHeight: 0,
  playerAttributes: {
    ...DEFAULT_PLAYER_STATE.attrs,
    legend: DEFAULT_PLAYER_STATE.legend
  } as RenderState["playerAttributes"],
  dialogueHistory: [],
  currentInput: "",
  currentSaveData: null,
  keyboardActive: false,
  dialogueScrollOffset: 0,
  isAdjudicating: false,
  suggestedActions: []
};

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
  if (!runtime.ctx) return;
  if (runtime.phase === "splash" && runtime.splashLayout) {
    renderSplash(runtime.ctx, runtime.splashLayout);
    return;
  }
  if (runtime.phase === "characterCreation") {
    if (runtime.creationLayout) {
      const form = { ...runtime.creationForm };
      if (runtime.input.isKeyboardVisible) {
        form.name = runtime.input.value;
      }
      renderCharacterCreation(runtime.ctx, runtime.creationLayout, form);
    }
    return;
  }
  if (runtime.phase === "aspirationSetting" || runtime.phase === "playing") {
    if (!runtime.layout) return;
    renderState.ctx = runtime.ctx;
    renderState.layout = runtime.layout;
    renderState.screenWidth = runtime.screenWidth;
    renderState.screenHeight = runtime.screenHeight;
    renderState.playerAttributes = runtime.playerAttributes;
    renderState.dialogueHistory = runtime.dialogueHistory;
    renderState.currentInput = runtime.input.value;
    renderState.currentSaveData = runtime.currentSaveData;
    renderState.keyboardActive = runtime.input.isKeyboardVisible;
    renderState.dialogueScrollOffset = runtime.dialogueScrollOffset;
    renderState.isAdjudicating = runtime.phase === "playing" ? runtime.isAdjudicating : false;
    renderState.suggestedActions =
      runtime.phase === "aspirationSetting" ? ["输入你的愿望并发送"] : runtime.suggestedActions;
    renderState.typingState = typewriter?.getState() ?? null;
    renderState.attrsModalVisible = runtime.attrsModalVisible ?? false;
    renderState.attrsModalContent =
      runtime.attrsModalVisible
        ? [
            ATTR_EXPLANATIONS.strength,
            ATTR_EXPLANATIONS.intelligence,
            ATTR_EXPLANATIONS.charm,
            ATTR_EXPLANATIONS.luck,
            LEGEND_EXPLANATION
          ]
        : undefined;
    const w = runtime.currentSaveData?.world?.time;
    renderState.worldTime = w ? { year: w.year, month: w.month ?? 1 } : undefined;
    renderState.yearChangeFlashUntil = runtime.yearChangeFlashUntil;
    renderState.historyModalVisible = runtime.historyModalVisible ?? false;
    renderState.historyLogs = runtime.currentSaveData?.history_logs ?? [];
    renderState.statusMenuVisible = runtime.statusMenuVisible ?? false;
    const hasUserSentOnce = runtime.dialogueHistory.some(
      (e) => e.startsWith("你：") || e.startsWith("你说：")
    );
    renderState.showInputHint =
      runtime.phase === "playing" && !hasUserSentOnce;
    renderState.inputHintText = INPUT_HINT_FIXED;
    renderState.playerName = runtime.currentSaveData?.player?.name?.trim();
    if (w && w.year > (runtime.lastDisplayedYearForBanner ?? 0)) {
      runtime.yearChangeFlashUntil = Date.now() + 600;
      runtime.lastDisplayedYearForBanner = w.year;
    }
    renderScreen(renderState);

    // 开场仅一条长文案时从顶部显示（仅 playing 阶段）
    if (
      runtime.phase === "playing" &&
      runtime.layout &&
      !runtime.appliedInitialDialogueScrollTop &&
      runtime.dialogueHistory.length >= 1 &&
      runtime.dialogueHistory.length <= 2
    ) {
      const area = runtime.layout.dialogueArea;
      const areaContentHeight = area.height - 32;
      if (
        lastDialogueTotalHeight > areaContentHeight &&
        runtime.dialogueScrollOffset === 0 &&
        !runtime.isAdjudicating &&
        !typewriter?.getState()
      ) {
        const maxScroll = Math.max(0, lastDialogueTotalHeight - areaContentHeight);
        runtime.dialogueScrollOffset = maxScroll;
        runtime.appliedInitialDialogueScrollTop = true;
      }
    }
    return;
  }
}

function autoSave(): void {
  if (!runtime.currentSaveData) return;
  const data = runtime.currentSaveData;
  setTimeout(() => {
    if (data) saveManager.save(data, true);
  }, 0);
}

/** 切出时立即存档，供 wx.onHide 调用 */
export function onAppHide(): void {
  lifecycleOnAppHide(runtime, saveManager);
}

function updateSuggestedActions(): void {
  if (!runtime.currentSaveData) {
    runtime.suggestedActions = [];
    return;
  }
  const region = runtime.currentSaveData.player?.location?.region ?? "";
  const scene = runtime.currentSaveData.player?.location?.scene ?? "";
  const stamina = runtime.currentSaveData.player?.stamina;
  const [a, b] = getSuggestedActions(region, scene, stamina);
  runtime.suggestedActions = [a, b];
}

/** 单一数据源：对话权威在 currentSaveData.dialogueHistory，此处将 runtime 同步为副本 */
function syncDialogueToRuntime(): void {
  if (!runtime.currentSaveData) return;
  runtime.dialogueHistory =
    runtime.currentSaveData.dialogueHistory.length > 0
      ? [...runtime.currentSaveData.dialogueHistory]
      : [...INITIAL_DIALOGUE];
}

function updateGameDataFromSave(): void {
  if (!runtime.currentSaveData) return;
  updateSuggestedActions();
  runtime.playerAttributes = {
    strength: runtime.currentSaveData.player.attrs.strength ?? DEFAULT_PLAYER_STATE.attrs.strength,
    intelligence:
      runtime.currentSaveData.player.attrs.intelligence ?? DEFAULT_PLAYER_STATE.attrs.intelligence,
    charm: runtime.currentSaveData.player.attrs.charm ?? DEFAULT_PLAYER_STATE.attrs.charm,
    luck: runtime.currentSaveData.player.attrs.luck ?? DEFAULT_PLAYER_STATE.attrs.luck,
    legend: runtime.currentSaveData.player.legend ?? DEFAULT_PLAYER_STATE.legend
  };
  syncDialogueToRuntime();
}

/** 裁决等待时的旁白式提示语（中性、氛围感，随机展示） */
const WAITING_MESSAGES = [
  "（稍候片刻…）",
  "（静待分晓…）",
  "（时间悄然流逝…）",
  "（且待…）",
  "（推演之中…）",
  "（局势未定，稍候…）",
  "（风声过耳…）",
  "（静候…）"
];

function getRandomWaitingMessage(): string {
  return WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)];
}

function dropWaitingPlaceholder(): void {
  const last = runtime.dialogueHistory.at(-1);
  if (last && WAITING_MESSAGES.includes(last)) {
    removeLast(runtime.dialogueHistory);
  }
}

function getTypewriterCompletionContext(): TypewriterCompletionContext {
  return {
    saveData: runtime.currentSaveData,
    updatePlayerAttrs: (saveData, delta) =>
      saveManager.updatePlayerAttributes(saveData, {
        attrs: delta.attrs,
        legend: delta.legend,
        reputation: delta.reputation,
        fame: delta.fame,
        infamy: delta.infamy,
        resources: delta.resources
      }),
    updateWorldState: (saveData, worldDelta) => saveManager.updateWorldState(saveData, worldDelta),
    autoSave,
    syncFromSave: updateGameDataFromSave,
    setSuggestedActions: (actions) => {
      runtime.suggestedActions = actions;
    },
    requestRewardedAd,
    playAmbientAudio
  };
}

function applyTypewriterCompletion(
  response: AdjudicationResponse,
  requestPayload?: AdjudicationRequest
): void {
  applyTypewriterCompletionFlow(response, requestPayload, getTypewriterCompletionContext());
}

/** 下一帧先 render 再滚动到底部。对话区约定：scroll=0 表示显示底部（最新），scroll=max 表示顶部 */
function scheduleScrollToBottom(): void {
  nextFrame(() => {
    render();
    runtime.targetScrollOffset = 0;
  });
}

function handleAdjudicationResult(
  response: AdjudicationResponse,
  requestPayload?: AdjudicationRequest
): void {
  const setDialogueScrollOffset = (n: number) => {
    runtime.dialogueScrollOffset = n;
    runtime.targetScrollOffset = null;
  };
  const setDialogueScrollOffsetAnimated = (target: number) => {
    runtime.targetScrollOffset = target;
  };
  const scrollToBottomAnimated = () => {
    nextFrame(() => {
      setDialogueScrollOffsetAnimated(0);
    });
  };

  const ctx: HandleAdjudicationResultContext = {
    saveData: runtime.currentSaveData,
    requestPayload,
    setDialogueScrollOffset,
    addDialogueToSave: (saveData, content) => {
      saveManager.addDialogueHistory(saveData, content);
    },
    syncDialogueToRuntime,
    startTypewriter: (text, isLongNarrative, onComplete) => {
      typewriter!.start(text, () => {
        onComplete();
        render();
        nextFrame(() => {
          render();
          scrollToBottomAnimated();
        });
      }, { isLongNarrative });
    },
    applyTypewriterCompletion: applyTypewriterCompletionFlow,
    completionContext: getTypewriterCompletionContext(),
    sanitizeNarrative,
    recordSanitizeFailure
  };
  handleAdjudicationResultFlow(response, ctx);
}

function simulateAdjudication(intent: string): void {
  setTimeout(() => {
    const fallback = "你的举动引起了县尉的注意，他对你的行为表示赞赏。";
    sanitizeNarrative(fallback)
      .then((result) => {
        const text = result.allowed && result.text ? result.text : result.reason ?? "内容暂时不可用";
        if (runtime.currentSaveData) {
          saveManager.updatePlayerAttributes(runtime.currentSaveData, {
            attrs: { intelligence: 1 },
            reputation: 3
          });
          autoSave();
          updateGameDataFromSave();
          typewriter!.start(text, false, () => {
            if (runtime.currentSaveData) {
              saveManager.addDialogueHistory(runtime.currentSaveData, text);
              syncDialogueToRuntime();
            }
          });
        }
      })
      .finally(() => {
        if (runtime.currentSaveData) render();
      });
  }, 1000);
}

/** 传奇属性说明（游戏内获得，创建角色时不可分配） */
const LEGEND_EXPLANATION =
  "传奇：在剧情中建立功业后获得，代表你在乱世中的名望与影响力。传奇越高，越易获得诸侯重视与百姓拥戴。";

export type { LocalIntentType } from "./localIntents";
export { getLocalIntentType, getLastPlayerIntent } from "./localIntents";

async function tryHandleLocalIntent(intent: string): Promise<boolean> {
  const type = getLocalIntentType(intent);
  if (!type) return false;
  if (type === "help") {
    appendDialogue(runtime.dialogueHistory, [
      "【指令提示】直接输入以下命令，无需调用裁决：",
      "• 存档 / 保存 / save — 手动保存进度",
      "• 读档 / 载入 / load — 加载最新存档",
      "• 重试 / retry — 再次发送上一条意图（裁决失败时可使用）",
      "• 属性 / 属性说明 — 查看武力、智力、魅力、运气、传奇的含义",
      "• 你是谁 / about — 了解游戏",
      "• 广告 / 福利 — 观看激励广告",
      "• 反馈 / feedback — 记录最近错误快照（遇逻辑异常时使用）",
      "【玩法】输入剧情意图（如「前往洛阳」「打听消息」「投靠曹操」）可推进故事，武力、智力等属性会影响剧情走向。"
    ]);
    render();
    scheduleScrollToBottom();
    return true;
  }
  if (type === "save") {
    manualSave();
    return true;
  }
  if (type === "attrs") {
    runtime.attrsModalVisible = true;
    render();
    return true;
  }
  if (type === "load") {
    const loaded = loadLatestSave();
    appendDialogue(
      runtime.dialogueHistory,
      loaded ? "【提示】最新存档已加载。" : "【提示】暂无可用存档。"
    );
    render();
    scheduleScrollToBottom();
    return true;
  }
  if (type === "about") {
    appendDialogue(runtime.dialogueHistory, "我是一名负责主持冒险的军机参谋，随时记录你的每一次抉择。");
    render();
    scheduleScrollToBottom();
    return true;
  }
  if (type === "ad") {
    requestRewardedAd("user-request");
    appendDialogue(runtime.dialogueHistory, "广告加载中，完成观看可获得额外资源奖励。");
    render();
    scheduleScrollToBottom();
    return true;
  }
  if (type === "feedback") {
    const snapshot = getLatestFeedbackSnapshot();
    if (snapshot) {
      const msg =
        snapshot.type === "adjudication_failure"
          ? `【反馈】已记录最近一次裁决失败（${snapshot.error}），快照可上传至服务器。`
          : `【反馈】已记录最近一次内容审核失败，快照可上传至服务器。`;
      appendDialogue(runtime.dialogueHistory, msg);
      if (typeof wx !== "undefined" && wx.showToast) {
        wx.showToast({ title: "反馈已记录", icon: "none" });
      }
    } else {
      appendDialogue(
        runtime.dialogueHistory,
        "【反馈】暂无错误记录。若遇逻辑异常，请先复现问题再输入「反馈」。"
      );
    }
    render();
    scheduleScrollToBottom();
    return true;
  }
  if (type === "retry") {
    const lastIntent = getLastPlayerIntent(runtime.dialogueHistory);
    if (!lastIntent) {
      appendDialogue(runtime.dialogueHistory, "【提示】暂无上一条意图可重试，请先输入一次行动。");
      render();
      scheduleScrollToBottom();
      return true;
    }
    clearInput(runtime.input);
    hideKeyboard();
    setKeyboardVisible(runtime.input, false);
    render();
    await submitIntentForAdjudication(lastIntent, true);
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
  });
  onKeyboardConfirm(() => {
    if (runtime.phase === "characterCreation") {
      runtime.creationForm.name = runtime.input.value;
      hideKeyboard();
      setKeyboardVisible(runtime.input, false);
      render();
    } else if (runtime.phase === "aspirationSetting" || runtime.phase === "playing") {
      submitInput().catch((err) => console.error(err));
    }
  });
  onKeyboardComplete(() => {
    if (runtime.phase === "characterCreation") {
      runtime.creationForm.name = runtime.input.value;
    }
    setKeyboardVisible(runtime.input, false);
    render();
  });
  handlersRegistered = true;
}

function handleInputAreaTouch(x: number, y: number): void {
  if (!runtime.layout) return;
  const area = runtime.layout.inputArea;
  const pad = 12;
  const sendBtnWidth = 48;
  const sendButton = {
    x: area.x + area.width - pad - sendBtnWidth,
    y: area.y + pad,
    width: sendBtnWidth,
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
  const capsuleRect = getMenuButtonRect();
  const capsuleLeft = getMenuButtonCapsuleLeft();
  const safeAreaRight = capsuleLeft != null ? capsuleLeft : runtime.screenWidth - 90;
  const capsuleCenterY =
    capsuleRect && typeof capsuleRect.top === "number" && typeof capsuleRect.height === "number"
      ? capsuleRect.top + capsuleRect.height / 2
      : undefined;
  const capsuleHeight = capsuleRect && typeof capsuleRect.height === "number" ? capsuleRect.height : undefined;
  runtime.layout = createUILayout({
    screenWidth: runtime.screenWidth,
    screenHeight: runtime.screenHeight,
    safeAreaTop: systemInfo.safeAreaTop ?? 0,
    safeAreaBottom: systemInfo.safeAreaBottom ?? 0,
    safeAreaRight,
    capsuleCenterY,
    capsuleHeight
  });
  runtime.splashLayout = createSplashLayout(
    runtime.screenWidth,
    runtime.screenHeight,
    systemInfo.safeAreaTop ?? 0
  );
  runtime.creationLayout = createCharacterCreationLayout(
    runtime.screenWidth,
    runtime.screenHeight,
    systemInfo.safeAreaTop ?? 0
  );

  bootstrapSanguoDb(184);
  saveManager.init();
  loadLatestSave();
  typewriter = createTypewriter(render);
  runtime.phase = "splash";
  registerWxHandlers();
  render();

  initialized = true;
  return { ready: true };
}

/** 需要高频率渲染：动画或滚动中 */
function needsHighFrequencyRender(): boolean {
  if (runtime.phase === "splash") return true;
  if (runtime.phase === "characterCreation" && runtime.input.isKeyboardVisible) return true;
  if (runtime.phase === "aspirationSetting" || runtime.phase === "playing") {
    if (runtime.targetScrollOffset != null) return true;
    if (runtime.isAdjudicating || runtime.isDialogueScrollActive || typewriter?.getState()) return true;
  }
  return false;
}

const SCROLL_TWEEN_FACTOR = 0.22;
const SCROLL_TWEEN_EPS = 1;

function updateScrollTween(): void {
  const target = runtime.targetScrollOffset;
  if (target == null) return;
  const cur = runtime.dialogueScrollOffset;
  const next = cur + (target - cur) * SCROLL_TWEEN_FACTOR;
  if (Math.abs(next - target) < SCROLL_TWEEN_EPS) {
    runtime.dialogueScrollOffset = target;
    runtime.targetScrollOffset = null;
  } else {
    runtime.dialogueScrollOffset = next;
  }
}

export function gameLoop(): void {
  if (runtime.loopActive) return;
  runtime.loopActive = true;
  const tick = () => {
    render();
    if (runtime.phase === "playing" && runtime.targetScrollOffset != null) updateScrollTween();
    if (needsHighFrequencyRender()) {
      nextFrame(tick);
    } else {
      setTimeout(() => tick(), 33);
    }
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
  const area = runtime.layout.dialogueArea;
  const areaContentHeight = area.height - 28;
  const maxScroll = Math.max(0, lastDialogueTotalHeight - areaContentHeight);
  const deltaY = pt.y - runtime.touchStartY;
  runtime.dialogueScrollOffset = Math.max(0, Math.min(maxScroll, runtime.touchStartScroll + deltaY));
  runtime.touchStartY = pt.y;
  runtime.touchStartScroll = runtime.dialogueScrollOffset;
}

export function handleTouchEnd(event: TouchEvent): void {
  runtime.isDialogueScrollActive = false;
}

export function handleTouch(event: TouchEvent): void {
  const pt = getTouchPoint(event);
  if (!pt) return;
  const { x, y } = pt;

  if (ClientConfig.DEBUG_TOUCH && typeof wx !== "undefined" && wx.showToast) {
    wx.showToast({ title: `x:${Math.round(x)} y:${Math.round(y)}`, icon: "none", duration: 500 });
  }

  if (runtime.phase === "splash") {
    runtime.phase = runtime.currentSaveData ? "playing" : "characterCreation";
    if (runtime.phase === "characterCreation") {
      runtime.currentSaveData = null;
      runtime.dialogueHistory = [...INITIAL_DIALOGUE];
    }
    invalidateDialogueCache();
    render();
    return;
  }

  if (runtime.phase === "characterCreation") {
    handleCharacterCreationTouch(x, y);
    return;
  }

  if (!runtime.layout) return;
  if (runtime.phase === "aspirationSetting") {
    handleInputAreaTouch(x, y);
    return;
  }
  if (runtime.phase === "playing" && runtime.attrsModalVisible) {
    runtime.attrsModalVisible = false;
    render();
    return;
  }
  if (runtime.phase === "playing" && runtime.historyModalVisible) {
    runtime.historyModalVisible = false;
    render();
    return;
  }
  if (runtime.phase === "playing" && runtime.statusMenuVisible) {
    const popup = getStatusMenuPopupRects(runtime.layout);
    if (pointInRect(popup.history, x, y)) {
      runtime.statusMenuVisible = false;
      runtime.historyModalVisible = true;
      render();
      return;
    }
    if (pointInRect(popup.restart, x, y)) {
      runtime.statusMenuVisible = false;
      promptRestartConfirm();
      render();
      return;
    }
    runtime.statusMenuVisible = false;
    render();
    return;
  }
  if (typewriter?.getState() && typewriter.skip()) return;
  const { inputArea, statusPanel, dialogueArea, actionGuideSlot } = runtime.layout;

  const menuBtnRect = getStatusMenuButtonRect(runtime.layout);
  if (pointInRect(menuBtnRect, x, y)) {
    runtime.statusMenuVisible = true;
    render();
    return;
  }
  if (pointInRect(inputArea, x, y)) {
    handleInputAreaTouch(x, y);
    return;
  }

  const chipRects = getActionGuideChipRects(runtime.layout, runtime.suggestedActions);
  for (const { rect, text } of chipRects) {
    if (pointInRect(actionGuideSlot, x, y) && pointInRect(rect, x, y) && !runtime.isAdjudicating) {
      setInputValue(runtime.input, text);
      submitInput();
      return;
    }
  }

  if (pointInRect(dialogueArea, x, y)) {
    runtime.targetScrollOffset = null;
    runtime.isDialogueScrollActive = true;
    runtime.touchStartY = y;
    runtime.touchStartScroll = runtime.dialogueScrollOffset;
    return;
  }

  const attrHelpRect = getAttrHelpButtonRect(runtime.layout);
  if (pointInRect(statusPanel, x, y) && pointInRect(attrHelpRect, x, y)) {
    runtime.attrsModalVisible = true;
    render();
    return;
  }

}

const INPUT_MAX_LENGTH = 150;

export function showKeyboard(): void {
  setKeyboardVisible(runtime.input, true);
  wxShowKeyboard(runtime.input.value, INPUT_MAX_LENGTH);
  render();
}

/**
 * 发送意图到裁决 API 并处理结果。skipAppendPlayerLine 为 true 时不追加「你：xxx」（用于重试上一条）。
 */
async function submitIntentForAdjudication(trimmed: string, skipAppendPlayerLine: boolean): Promise<void> {
  if (!skipAppendPlayerLine && runtime.currentSaveData) {
    saveManager.addDialogueHistory(runtime.currentSaveData, [`你：${trimmed}`]);
    syncDialogueToRuntime();
  }
  clearInput(runtime.input);
  hideKeyboard();
  setKeyboardVisible(runtime.input, false);
  autoSave();
  render();
  if (!skipAppendPlayerLine) scheduleScrollToBottom();

  runtime.isAdjudicating = true;
  let payload = buildAdjudicationRequest(runtime.currentSaveData, trimmed);
  payload = processPlayerAction(payload);
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
    handleAdjudicationResult(response, payload);
  } catch (error) {
    dropWaitingPlaceholder();
    runtime.dialogueScrollOffset = 0;
    runtime.targetScrollOffset = null;
    recordAdjudicationFailure(payload, error);
    const errMsg = error instanceof Error ? error.message : "裁决请求失败";
    appendDialogue(
      runtime.dialogueHistory,
      `裁决失败：${errMsg}（可输入「重试」再次发送上一条意图）`
    );
    render();
    scheduleScrollToBottom();
    console.warn("裁决 API 调用失败:", error);
  } finally {
    runtime.isAdjudicating = false;
  }
}

export async function submitInput(): Promise<void> {
  if (runtime.isAdjudicating) {
    if (typeof wx !== "undefined" && wx.showToast) {
      wx.showToast({ title: "军师正在推演，请稍候", icon: "none", duration: 1500 });
    }
    return;
  }
  const trimmed = runtime.input.value.trim();

  if (runtime.phase === "aspirationSetting") {
    if (!trimmed) {
      if (typeof wx !== "undefined" && wx.showToast) {
        wx.showToast({ title: "请输入你的愿望", icon: "none" });
      }
      return;
    }
    const aspiration = resolveAspiration(trimmed);
    if (!runtime.currentSaveData) return;
    if (!runtime.currentSaveData.player) {
      runtime.currentSaveData.player = { ...DEFAULT_PLAYER_STATE };
    }
    runtime.currentSaveData.player.aspiration = aspiration;
    saveManager.addDialogueHistory(runtime.currentSaveData, [trimmed]);
    syncDialogueToRuntime();
    clearInput(runtime.input);
    hideKeyboard();
    setKeyboardVisible(runtime.input, false);
    runtime.phase = "playing";
    updateGameDataFromSave();
    invalidateDialogueCache();
    runIntroSequence();
    render();
    return;
  }

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
    scheduleScrollToBottom();
    return;
  }

  await submitIntentForAdjudication(trimmed, false);
}

function promptRestartConfirm(): void {
  if (typeof wx !== "undefined" && typeof wx.showModal === "function") {
    wx.showModal({
      title: "重开新局",
      content: "此番历迹皆存于本机，若决意重来，往昔足迹将一去不返。可愿舍弃旧档？",
      confirmText: "决意重来",
      cancelText: "暂不",
      success(res) {
        if (res.confirm) {
          restartGame();
        }
      }
    });
  } else {
    restartGame();
  }
}

export function restartGame(): void {
  clearInput(runtime.input);
  setKeyboardVisible(runtime.input, false);
  hideKeyboard();
  invalidateDialogueCache();
  typewriter?.clear();
  runtime.creationForm = { ...DEFAULT_CREATION_FORM };
  runtime.phase = "characterCreation";
  runtime.currentSaveData = null;
  runtime.dialogueHistory = [...INITIAL_DIALOGUE];
  runtime.dialogueScrollOffset = 0;
  runtime.targetScrollOffset = null;
  runtime.appliedInitialDialogueScrollTop = false;
  runtime.attrsModalVisible = false;
  render();
}

function confirmCharacterCreation(): void {
  const form = runtime.creationForm;
  const totalBonus = (["strength", "intelligence", "charm", "luck"] as const).reduce(
    (s, k) => s + (form.attrBonus[k] ?? 0),
    0
  );
  if (!form.name.trim()) {
    if (typeof wx !== "undefined" && wx.showToast) {
      wx.showToast({ title: "请输入姓名", icon: "none" });
    }
    return;
  }
  if (totalBonus !== ATTR_BONUS_POINTS) {
    if (typeof wx !== "undefined" && wx.showToast) {
      wx.showToast({ title: `请分配完 ${ATTR_BONUS_POINTS} 点属性`, icon: "none" });
    }
    return;
  }
  const newSave = saveManager.createNewSaveWithConfig(0, form.name.trim(), {
    name: form.name.trim(),
    gender: form.gender,
    attrBonus: form.attrBonus
  });
  newSave.dialogueHistory = [ASPIRATION_QUESTION];
  saveManager.save(newSave, false);
  runtime.currentSaveData = newSave;
  runtime.dialogueHistory = [ASPIRATION_QUESTION];
  runtime.dialogueScrollOffset = 0;
  runtime.targetScrollOffset = null;
  runtime.appliedInitialDialogueScrollTop = false;
  runtime.phase = "aspirationSetting";
  updateGameDataFromSave();
  invalidateDialogueCache();
  render();
}

/** 开场打字机叙事（立志提交后或读档后若有 intro 需求时调用） */
function runIntroSequence(): void {
  if (!runtime.currentSaveData) return;
  const introLines = getIntroSequence(runtime.currentSaveData);
  let step = 0;
  function runNext(): void {
    if (step >= introLines.length) {
      updateSuggestedActions();
      autoSave();
      invalidateDialogueCache();
      return;
    }
    const line = introLines[step];
    typewriter!.start(line, () => {
      if (runtime.currentSaveData) {
        saveManager.addDialogueHistory(runtime.currentSaveData, [line]);
        syncDialogueToRuntime();
      }
      render();
      scheduleScrollToBottom();
      step += 1;
      runNext();
    });
  }
  runNext();
}

function handleCharacterCreationTouch(x: number, y: number): void {
  if (!runtime.creationLayout) return;
  const targets = getCreationTouchTargets(runtime.creationLayout);
  if (pointInRect(targets.nameArea, x, y)) {
    setInputValue(runtime.input, runtime.creationForm.name);
    setKeyboardVisible(runtime.input, true);
    wxShowKeyboard(runtime.creationForm.name);
    render();
    return;
  }
  if (pointInRect(targets.maleButton, x, y)) {
    runtime.creationForm.gender = "male";
    render();
    return;
  }
  if (pointInRect(targets.femaleButton, x, y)) {
    runtime.creationForm.gender = "female";
    render();
    return;
  }
  for (const row of targets.attrRows) {
    if (pointInRect(row.helpIcon, x, y)) {
      const text = ATTR_EXPLANATIONS[row.key];
      if (typeof wx !== "undefined" && wx.showModal) {
        wx.showModal({
          title: "属性说明",
          content: text,
          showCancel: false,
          confirmText: "知道了"
        });
      }
      return;
    }
    const totalBonus = (["strength", "intelligence", "charm", "luck"] as const).reduce(
      (s, k) => s + (runtime.creationForm.attrBonus[k] ?? 0),
      0
    );
    if (pointInRect(row.minus, x, y)) {
      const cur = runtime.creationForm.attrBonus[row.key] ?? 0;
      if (cur > 0) {
        runtime.creationForm.attrBonus = { ...runtime.creationForm.attrBonus, [row.key]: cur - 1 };
      }
      render();
      return;
    }
    if (pointInRect(row.plus, x, y)) {
      if (totalBonus < ATTR_BONUS_POINTS) {
        const cur = runtime.creationForm.attrBonus[row.key] ?? 0;
        runtime.creationForm.attrBonus = { ...runtime.creationForm.attrBonus, [row.key]: cur + 1 };
      }
      render();
      return;
    }
  }
  if (pointInRect(targets.startButton, x, y)) {
    confirmCharacterCreation();
  }
}

export function manualSave(): void {
  lifecycleManualSave(runtime, saveManager, {
    appendDialogue,
    removeLast,
    render
  });
}

export function loadLatestSave(): boolean {
  return lifecycleLoadLatestSave(saveManager, 0, runtime, updateGameDataFromSave);
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
