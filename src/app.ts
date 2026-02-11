import { DEFAULT_NPC_STATE, DEFAULT_PLAYER_STATE, DEFAULT_WORLD_STATE } from "@config/index";
import type { GameSaveData, NPCState, PlayerAttributes, PlayerState, WorldState } from "@core/state";
import { clearInput, createInputState, setInputValue, setKeyboardVisible } from "@ui/input";
import { createUILayout, type UILayout } from "@ui/layout";
import { renderScreen } from "@ui/renderer";
import { saveManager } from "@services/storage/saveManager";
import { appendDialogue, removeLast, replaceLast } from "@utils/dialogueBuffer";
import { postJson } from "@utils/network/request";
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
  onTouchStart,
  showKeyboard as wxShowKeyboard
} from "@utils/wxHelpers";

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
type TouchEvent = { touches?: Array<{ x: number; y: number }> };

interface GameRuntime {
  canvas: CanvasSurface | null;
  ctx: CanvasCtx;
  layout: UILayout | null;
  screenWidth: number;
  screenHeight: number;
  playerAttributes: PlayerAttributes & { legend: number };
  dialogueHistory: string[];
  input: ReturnType<typeof createInputState>;
  isSaveLoadPanelVisible: boolean;
  currentSaveData: GameSaveData | null;
  isAdjudicating: boolean;
  loopActive: boolean;
}

interface GameInitResult {
  ready: boolean;
  message?: string;
}

interface AdjudicationResponse {
  result?: {
    narrative?: string;
    effects?: string[];
  };
  state_changes?: {
    player?: string[];
    world?: Partial<WorldState>;
  };
}

interface AdjudicationRequest {
  player_state: PlayerState;
  world_state: WorldState;
  npc_state: NPCState[];
  event_context?: Record<string, unknown>;
  player_intent: string;
}

const INITIAL_DIALOGUE = [
  "建宁元年（公元168年），你醒来发现自己身处洛阳城外的小村庄。",
  "村中长者告诉你，黄巾之乱即将爆发，天下将乱。",
  "你可以选择投靠官府，也可以暗中结交豪杰，甚至加入太平道……"
];

const runtime: GameRuntime = {
  canvas: null,
  ctx: null,
  layout: null,
  screenWidth: 0,
  screenHeight: 0,
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
  loopActive: false
};

let initialized = false;
let handlersRegistered = false;

export function initGame(): GameInitResult {
  if (initialized) {
    return { ready: true };
  }
  const canvas = createCanvas();
  if (!canvas) {
    return { ready: false, message: "无法创建 Canvas，上下文不可用" };
  }
  const systemInfo = getSystemInfo();
  const pixelRatio = systemInfo.pixelRatio || 1;
  const logicalWidth = systemInfo.windowWidth;
  const logicalHeight = systemInfo.windowHeight;
  const ctx = canvas.getContext("2d") as CanvasCtx;
  if (!ctx) {
    return { ready: false, message: "无法获取 CanvasRenderingContext2D" };
  }
  if (pixelRatio !== 1 && typeof ctx.scale === "function") {
    ctx.scale(pixelRatio, pixelRatio);
  }

  runtime.canvas = canvas;
  runtime.ctx = ctx;
  runtime.screenWidth = logicalWidth || canvas.width;
  runtime.screenHeight = logicalHeight || canvas.height;
  runtime.layout = createUILayout(runtime.screenWidth, runtime.screenHeight);

  saveManager.init();
  loadLatestSave();
  registerWxHandlers();
  render();

  initialized = true;
  return { ready: true };
}

export function gameLoop(): void {
  if (runtime.loopActive) {
    return;
  }
  runtime.loopActive = true;
  const tick = () => {
    render();
    nextFrame(tick);
  };
  nextFrame(tick);
}

export function handleTouch(event: TouchEvent): void {
  if (!runtime.layout) {
    return;
  }
  const touchPoint = event.touches?.[0];
  if (!touchPoint) {
    return;
  }
  const { x, y } = touchPoint;

  const { inputArea, saveLoadPanel, attributePanel } = runtime.layout;
  if (pointInRect(inputArea, x, y)) {
    handleInputAreaTouch(x, y);
    return;
  }

  if (runtime.isSaveLoadPanelVisible && pointInRect(saveLoadPanel, x, y)) {
    const midPoint = saveLoadPanel.width / 2;
    if (x <= midPoint) {
      manualSave();
    } else {
      toggleSaveLoadPanel();
    }
    return;
  }

  if (pointInRect(attributePanel, x, y) && x >= attributePanel.width - 60) {
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
    return;
  }
  const trimmed = runtime.input.value.trim();
  if (!trimmed) {
    return;
  }

  appendDialogue(runtime.dialogueHistory, [`你说：“${trimmed}”`, "（等待裁决结果...）"]);
  if (runtime.currentSaveData) {
    saveManager.addDialogueHistory(runtime.currentSaveData, [`你说：“${trimmed}”`, "（等待裁决结果...）"]);
  }

  clearInput(runtime.input);
  hideKeyboard();
  setKeyboardVisible(runtime.input, false);
  autoSave();
  render();

  runtime.isAdjudicating = true;
  const payload = buildAdjudicationRequest(trimmed);

  try {
    const response = await postJson<AdjudicationResponse>({ payload });
    dropWaitingPlaceholder();
    handleAdjudicationResult(response);
  } catch (error) {
    dropWaitingPlaceholder();
    appendDialogue(runtime.dialogueHistory, "网络波动，请稍后重试 (点击输入框重试)");
    render();
    console.error("裁决 API 调用失败:", error);
    simulateAdjudication(trimmed);
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
    }, 3000);
  }
}

export function loadLatestSave(): boolean {
  const loaded = saveManager.load(0);
  if (loaded) {
    runtime.currentSaveData = loaded;
    updateGameDataFromSave();
    console.log("存档加载成功");
    return true;
  }
  const newSave = saveManager.createNewSave(0, "初始存档");
  if (!saveManager.save(newSave, false)) {
    console.warn("初始存档保存失败，使用默认数据");
    runtime.currentSaveData = null;
    runtime.dialogueHistory = [...INITIAL_DIALOGUE];
    return false;
  }
  runtime.currentSaveData = newSave;
  updateGameDataFromSave();
  console.log("新存档创建并保存成功");
  return true;
}

export function render(): void {
  if (!runtime.ctx || !runtime.layout) {
    return;
  }
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
    keyboardActive: runtime.input.isKeyboardVisible
  });
}

export function setCurrentInput(value: string): void {
  setInputValue(runtime.input, value);
  render();
}

export function getState() {
  return {
    initialized,
    input: runtime.input,
    currentSaveData: runtime.currentSaveData,
    dialogueHistory: runtime.dialogueHistory,
    playerAttributes: runtime.playerAttributes
  };
}

function registerWxHandlers(): void {
  if (handlersRegistered || !hasWx()) {
    return;
  }
  onTouchStart((event) => handleTouch(event));
  onKeyboardInput((event) => {
    setInputValue(runtime.input, event.value);
    render();
  });
  onKeyboardConfirm(() => {
    submitInput().catch((error) => console.error(error));
  });
  onKeyboardComplete(() => {
    setKeyboardVisible(runtime.input, false);
    render();
  });
  handlersRegistered = true;
}

function handleInputAreaTouch(x: number, y: number): void {
  if (!runtime.layout) {
    return;
  }
  const area = runtime.layout.inputArea;
  const sendButton = {
    x: area.width - 70,
    y: area.y + 20,
    width: 60,
    height: 40
  };
  if (pointInRect(sendButton, x, y)) {
    submitInput().catch((error) => console.error(error));
  } else {
    showKeyboard();
  }
}

function buildAdjudicationRequest(intent: string): AdjudicationRequest {
  let playerState: PlayerState = DEFAULT_PLAYER_STATE;
  let worldState: WorldState = DEFAULT_WORLD_STATE;
  let npcState: NPCState[] = DEFAULT_NPC_STATE;
  let eventContext: Record<string, unknown> | undefined;

  if (runtime.currentSaveData) {
    playerState = runtime.currentSaveData.player;
    worldState = runtime.currentSaveData.world;
    npcState = runtime.currentSaveData.npcs || DEFAULT_NPC_STATE;
    eventContext = {
      recent_dialogue: runtime.currentSaveData.dialogueHistory.slice(-3)
    };
  }

  return {
    player_state: playerState,
    world_state: worldState,
    npc_state: npcState,
    event_context: eventContext,
    player_intent: intent
  };
}

function handleAdjudicationResult(response: AdjudicationResponse): void {
  const narrative = response.result?.narrative || "你的举动引起了注意。";
  appendDialogue(runtime.dialogueHistory, narrative);

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

  render();
}

function applyPlayerStateChanges(changes: string[]): void {
  if (!runtime.currentSaveData) {
    return;
  }
  const attrDelta: Partial<PlayerState["attrs"]> = {};
  const resourceDelta: Partial<PlayerState["resources"]> = {};
  let legendDelta = 0;
  let reputationDelta = 0;

  changes.forEach((change) => {
    const match = change.match(/^([a-zA-Z_]+)([+-]\d+)$/);
    if (!match) {
      return;
    }
    const [, key, raw] = match;
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return;
    }
    if (key in runtime.currentSaveData!.player.attrs) {
      attrDelta[key as keyof PlayerState["attrs"]] = (attrDelta[key as keyof PlayerState["attrs"]] || 0) + value;
    } else if (key === "legend") {
      legendDelta += value;
    } else if (key === "reputation") {
      reputationDelta += value;
    } else if (key in runtime.currentSaveData!.player.resources) {
      resourceDelta[key as keyof PlayerState["resources"]] =
        (resourceDelta[key as keyof PlayerState["resources"]] || 0) + value;
    }
  });

  saveManager.updatePlayerAttributes(runtime.currentSaveData, {
    attrs: attrDelta,
    legend: legendDelta,
    reputation: reputationDelta,
    resources: resourceDelta
  });
}

function simulateAdjudication(intent: string): void {
  setTimeout(() => {
    const fallback = "你的举动引起了县尉的注意，他对你的行为表示赞赏。";
    appendDialogue(runtime.dialogueHistory, fallback);
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
  }, 1000);
}

function autoSave(): void {
  if (!runtime.currentSaveData) {
    return;
  }
  saveManager.save(runtime.currentSaveData, true);
}

function updateGameDataFromSave(): void {
  if (!runtime.currentSaveData) {
    return;
  }
  runtime.playerAttributes = {
    strength: runtime.currentSaveData.player.attrs.strength || DEFAULT_PLAYER_STATE.attrs.strength,
    intelligence: runtime.currentSaveData.player.attrs.intelligence || DEFAULT_PLAYER_STATE.attrs.intelligence,
    charm: runtime.currentSaveData.player.attrs.charm || DEFAULT_PLAYER_STATE.attrs.charm,
    luck: runtime.currentSaveData.player.attrs.luck || DEFAULT_PLAYER_STATE.attrs.luck,
    legend: runtime.currentSaveData.player.legend || DEFAULT_PLAYER_STATE.legend
  };
  runtime.dialogueHistory = runtime.currentSaveData.dialogueHistory.length
    ? [...runtime.currentSaveData.dialogueHistory]
    : [...INITIAL_DIALOGUE];
}

function dropWaitingPlaceholder(): void {
  if (runtime.dialogueHistory.at(-1) === "（等待裁决结果...）") {
    removeLast(runtime.dialogueHistory);
  }
}

function pointInRect(rect: { x?: number; y?: number; width: number; height: number }, x: number, y: number): boolean {
  const left = rect.x ?? 0;
  const top = rect.y ?? 0;
  return x >= left && x <= left + rect.width && y >= top && y <= top + rect.height;
}
