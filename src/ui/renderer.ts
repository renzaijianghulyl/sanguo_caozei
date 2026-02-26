import type { GameSaveData, PlayerAttributes } from "@core/state";
import type { UILayout, UIRect } from "@ui/layout";
import { colors, radius, sizes } from "@ui/theme";
import { drawRoundedRect, wrapText, wrapTextWithParagraphs } from "@ui/primitives";
import { getEraLabel, getMonthNameForDisplay } from "@core/historyLog";
import {
  drawHistoryModal,
  drawStatusMenuButton,
  drawStatusMenuPopup,
  STATUS_ROW0_HEIGHT,
  STATUS_ROW1_HEIGHT
} from "@ui/menu";

/** “重新开始”按钮尺寸，与 gameApp 点击检测一致 */
const RESTART_BTN_WIDTH = sizes.restartBtnWidth;
const RESTART_BTN_HEIGHT = sizes.restartBtnHeight;
const RESTART_BTN_PAD = sizes.restartBtnPad;
const ATTR_HELP_ICON_SIZE = sizes.attrHelpIconSize;
/** 属性列与「传奇」? 图标之间的间距，保证五列与数值同轴不挤 */
const ATTR_ICON_GAP = 10;

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 段落间隔倍数（相对行高），\n\n 后 1.5 倍行距 */
const PARAGRAPH_GAP_RATIO = 0.5;

/** 对话区气泡高度 + 换行结果缓存：只对稳定列表缓存，测高与绘制共用一次 wrap */
interface DialogueHeightCache {
  heights: number[];
  lines: string[][];
  /** 每个气泡的「段落后间隔」行下标，用于 1.5 倍行距 */
  paragraphGapAfterIndex: number[][];
  maxWidth: number;
  /** 当前缓存是否按「角色名替换后」的展示文案计算，用于 playerName 变化时失效 */
  builtWithDisplaySubstitution?: boolean;
}
const dialogueHeightCache: DialogueHeightCache = {
  heights: [],
  lines: [],
  paragraphGapAfterIndex: [],
  maxWidth: 0
};

/** 供 touch 计算使用的对话区总高度（每帧由 drawDialogueArea 更新） */
export let lastDialogueTotalHeight = 0;

/** 离屏缓冲：历史对话绘制到此，主 Canvas 只叠加实时打字层，避免重叠与掉帧 */
let dialogueOffscreen: { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasCtx } | null = null;
let dialogueOffscreenValid = false;
let lastOffscreenHistoryLen = -1;
let lastOffscreenWidth = -1;

/** 清空对话区高度缓存与离屏缓冲，供重新开始/读档时调用 */
export function invalidateDialogueCache(): void {
  dialogueHeightCache.heights = [];
  dialogueHeightCache.lines = [];
  dialogueHeightCache.paragraphGapAfterIndex = [];
  dialogueHeightCache.maxWidth = 0;
  dialogueOffscreenValid = false;
  lastOffscreenHistoryLen = -1;
  lastOffscreenWidth = -1;
}

function createOffscreenCanvas(
  width: number,
  height: number,
  sourceCtx: CanvasCtx
): HTMLCanvasElement | OffscreenCanvas | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(width, height) as OffscreenCanvas;
    }
    const c = (sourceCtx as { canvas?: { createOffscreenCanvas?: (w: number, h: number) => unknown } })
      .canvas as { createOffscreenCanvas?: (w: number, h: number) => unknown } | undefined;
    if (c?.createOffscreenCanvas) {
      return c.createOffscreenCanvas(width, height) as HTMLCanvasElement;
    }
    if (typeof document !== "undefined" && document.createElement) {
      const el = document.createElement("canvas");
      el.width = width;
      el.height = height;
      return el;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 输入框占位暗文（无输入时显示） */
const INPUT_PLACEHOLDER = "输入你的下一步动作";

const REGION_NAMES: Record<string, string> = {
  yingchuan: "颍川",
  luoyang: "洛阳",
  jingzhou: "荆州",
  jizhou: "冀州",
  yuzhou: "豫州",
  zhuoxian: "涿县"
};

const SCENE_NAMES: Record<string, string> = {
  village: "村庄",
  city: "城内",
  camp: "营地",
  inn: "客栈",
  temple: "庙宇"
};

export interface RenderState {
  ctx: CanvasCtx;
  layout: UILayout;
  screenWidth: number;
  screenHeight: number;
  playerAttributes: PlayerAttributes & { legend: number };
  dialogueHistory: string[];
  currentInput: string;
  currentSaveData: GameSaveData | null;
  keyboardActive: boolean;
  dialogueScrollOffset?: number;
  /** 对话区实际内容高度，用于滑动计算 */
  dialogueTotalHeight?: number;
  /** 裁决请求进行中，输入区显示「发送中」并禁用发送按钮 */
  isAdjudicating?: boolean;
  /** 行动引导槽：3 个可选动作，含志向高亮标记 */
  suggestedActions?: Array<{ text: string; is_aspiration_focused: boolean }>;
  /** 打字机效果：正在逐字显示的叙事，点击可跳过 */
  typingState?: { fullText: string; displayedLen: number } | null;
  /** 属性说明弹窗：为 true 时显示，内容由 attrsModalContent 提供 */
  attrsModalVisible?: boolean;
  attrsModalContent?: string[];
  /** 时间常驻条：世界年月，用于 TimeBanner */
  worldTime?: { year: number; month: number };
  /** 年份刚跨越时的闪烁结束时间戳，用于时光流逝动效 */
  yearChangeFlashUntil?: number;
  /** 生平回顾弹窗是否显示 */
  historyModalVisible?: boolean;
  /** 大事记列表，供生平回顾弹窗展示 */
  historyLogs?: import("@core/state").HistoryLogEntry[];
  /** 状态栏菜单（生平/重新开始）是否展开 */
  statusMenuVisible?: boolean;
  /** 是否在输入区上方显示固定提示（首屏/未发送过时） */
  showInputHint?: boolean;
  /** 输入区上方固定提示文案 */
  inputHintText?: string;
  /** 玩家角色名，用于将「你：」气泡显示为「角色名：」 */
  playerName?: string;
  /** 游戏终止原因（如意外殒命），非空时显示结束覆盖层与「重新开始」按钮 */
  gameOverReason?: string;
  /** 游戏结束时的玩家生平文案，结束界面中展示 */
  gameOverLifeSummary?: string;
}


export function renderScreen(state: RenderState): void {
  const { ctx, screenWidth, screenHeight } = state;
  drawBackground(ctx, screenWidth, screenHeight);
  drawStatusPanel(state);
  if (state.statusMenuVisible) {
    drawStatusMenuPopup(ctx, state.layout);
  }
  drawDialogueArea(state);
  drawActionGuideSlot(state);
  // 输入提示已改为输入框占位暗文，不再在输入区上方绘制
  drawInputArea(state);
  if (state.attrsModalVisible && state.attrsModalContent && state.attrsModalContent.length > 0) {
    drawAttrsModal(ctx, screenWidth, screenHeight, state.attrsModalContent);
  }
  if (state.historyModalVisible && state.historyLogs) {
    drawHistoryModal(ctx, screenWidth, screenHeight, state.historyLogs);
  }
  if (state.gameOverReason) {
    drawGameOverOverlay(
      ctx,
      screenWidth,
      screenHeight,
      state.gameOverReason,
      state.gameOverLifeSummary
    );
  }
}

/** 游戏终止覆盖层下「重新开始」按钮的矩形，供 gameApp 触摸检测；有生平文案时面板更高 */
export function getGameOverRestartRect(
  screenWidth: number,
  screenHeight: number,
  lifeSummary?: string
): UIRect {
  const panelMargin = Math.max(24, Math.round(screenWidth * 0.1));
  const panelWidth = screenWidth - panelMargin * 2;
  const baseHeight = 160;
  const lifeSummaryHeight = lifeSummary?.trim()
    ? Math.min(140, (lifeSummary.split("\n").length + 2) * 16)
    : 0;
  const panelHeight = baseHeight + lifeSummaryHeight;
  const panelX = panelMargin;
  const panelY = (screenHeight - panelHeight) / 2;
  const btnX = panelX + (panelWidth - RESTART_BTN_WIDTH) / 2;
  const btnY = panelY + panelHeight - RESTART_BTN_PAD - RESTART_BTN_HEIGHT;
  return { x: btnX, y: btnY, width: RESTART_BTN_WIDTH, height: RESTART_BTN_HEIGHT };
}

function drawGameOverOverlay(
  ctx: CanvasCtx,
  screenWidth: number,
  screenHeight: number,
  reason: string,
  lifeSummary?: string
): void {
  const panelMargin = Math.max(24, Math.round(screenWidth * 0.1));
  const panelWidth = screenWidth - panelMargin * 2;
  const baseHeight = 160;
  const hasLife = lifeSummary?.trim();
  const lifeSummaryHeight = hasLife ? Math.min(140, (lifeSummary!.split("\n").length + 2) * 16) : 0;
  const panelHeight = baseHeight + lifeSummaryHeight;
  const panelX = panelMargin;
  const panelY = (screenHeight - panelHeight) / 2;
  const panel: UIRect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, 0, screenWidth, screenHeight);
  drawRoundedRect(ctx, panel, colors.panel, colors.panelBorder, radius.panel);

  ctx.fillStyle = colors.warn;
  ctx.font = "bold 18px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("游戏结束", panelX + panelWidth / 2, panelY + 36);
  ctx.fillStyle = colors.textSecondary;
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.fillText(reason + "，请重新开始。", panelX + panelWidth / 2, panelY + 64);

  if (hasLife) {
    ctx.font = "12px 'PingFang SC', sans-serif";
    ctx.fillStyle = colors.textMuted;
    ctx.fillText("—— 生平 ——", panelX + panelWidth / 2, panelY + 90);
    ctx.fillStyle = colors.textSecondary;
    ctx.textAlign = "left";
    const lines = lifeSummary!.split("\n").slice(0, 8);
    const lineH = 14;
    lines.forEach((line, i) => {
      const y = panelY + 106 + i * lineH;
      if (y < panelY + panelHeight - RESTART_BTN_PAD - RESTART_BTN_HEIGHT - 8) {
        const truncated = line.length > 28 ? line.slice(0, 27) + "…" : line;
        ctx.fillText(truncated, panelX + 12, y);
      }
    });
    ctx.textAlign = "center";
  }

  const btnRect = getGameOverRestartRect(screenWidth, screenHeight, lifeSummary);
  drawRoundedRect(ctx, btnRect, colors.accent, colors.accentChipBorder, radius.button);
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.fillText("重新开始", btnRect.x + btnRect.width / 2, btnRect.y + btnRect.height / 2 + 5);
  ctx.restore();
}

function drawBackground(ctx: CanvasCtx, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.bgStart);
  gradient.addColorStop(0.4, colors.bgMid);
  gradient.addColorStop(1, colors.bgEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** 属性说明弹窗：遮罩 + 白底面板 + 多段说明 + 关闭提示 */
function drawAttrsModal(ctx: CanvasCtx, screenWidth: number, screenHeight: number, content: string[]) {
  const pad = 20;
  const lineH = 18;
  const panelMargin = Math.max(24, Math.round(screenWidth * 0.08));
  const panelWidth = screenWidth - panelMargin * 2;
  const maxTextWidth = panelWidth - pad * 2;

  ctx.save();
  ctx.font = "14px 'PingFang SC', sans-serif";
  let totalH = pad + lineH + 12;
  const wrapped: string[][] = [];
  for (const para of content) {
    const lines = wrapText(ctx, para, maxTextWidth);
    wrapped.push(lines);
    totalH += lines.length * lineH + 8;
  }
  totalH += lineH + pad + 20;
  const panelHeight = Math.min(totalH, screenHeight - 80);
  const panelX = panelMargin;
  const panelY = (screenHeight - panelHeight) / 2;
  const panel: UIRect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };

  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, screenWidth, screenHeight);
  drawRoundedRect(ctx, panel, colors.panel, colors.panelBorder, radius.panel);

  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, panelY, panelWidth, panelHeight);
  ctx.clip();

  let y = panelY + pad;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "bold 16px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("属性说明", panelX + pad, y + 14);
  y += lineH + 12;

  ctx.font = "13px 'PingFang SC', sans-serif";
  ctx.fillStyle = colors.textSecondary;
  for (const lines of wrapped) {
    for (const line of lines) {
      ctx.fillText(line, panelX + pad, y + 12);
      y += lineH;
    }
    y += 8;
  }
  ctx.fillStyle = colors.textMuted;
  ctx.font = "11px 'PingFang SC', sans-serif";
  ctx.fillText("点击任意处关闭", panelX + pad, y + 12);
  ctx.restore();
  ctx.restore();
}

function getSeason(month: number): string {
  if (month >= 1 && month <= 3) return "春";
  if (month >= 4 && month <= 6) return "夏";
  if (month >= 7 && month <= 9) return "秋";
  return "冬";
}

/** 状态栏：第 0 行=左上角「系统」按钮，第 1 行=时间/地点/行动力·健康度·金钱·粮草（胶囊下全宽），第 2 行=属性（全宽） */
function drawStatusPanel(state: RenderState) {
  const { ctx, layout, playerAttributes, currentSaveData, worldTime } = state;
  const area = layout.statusPanel;
  const pad = 14;

  drawRoundedRect(ctx, area, colors.panel, colors.panelBorder, radius.panel);

  drawStatusMenuButton(ctx, layout);

  const w = currentSaveData?.world?.time;
  const gold = currentSaveData?.player?.resources?.gold ?? 0;
  const food = currentSaveData?.player?.resources?.food ?? 0;
  const stamina = currentSaveData?.player?.stamina ?? 1000;
  const health = currentSaveData?.player?.health ?? 100;
  const season = w ? getSeason(w.month) : "";
  const region = currentSaveData?.player?.location?.region ?? "";
  const scene = currentSaveData?.player?.location?.scene ?? "";
  const regionName = (REGION_NAMES[region] ?? region) || "—";
  const sceneName = (SCENE_NAMES[scene] ?? scene) || "—";

  const eraStr = w && worldTime ? getEraLabel(w.year) : "";
  const monthStr = w ? getMonthNameForDisplay(w.month) : "";
  const timePart = w ? `【${eraStr}】${w.year}年·${season}·${monthStr}` : "";
  const locationPart = `${regionName} · ${sceneName}`;
  const resourcePart = `行动力${stamina}　健康度${health}　金钱${gold}　粮草${food}`;
  const seg = "　　　　    "; // 时间与地点之间留白（约为原两倍）

  const infoY = area.y + STATUS_ROW0_HEIGHT;
  const lineH = 18;
  const startX = area.x + pad;
  ctx.font = "11px 'PingFang SC', sans-serif";
  ctx.fillStyle = colors.textSecondary;
  ctx.textAlign = "left";
  const line1 = [timePart, locationPart].filter(Boolean).join(seg);
  if (line1) ctx.fillText(line1, startX, infoY + 12);
  // 「行动力/健康度/金钱/粮草」与「【中平元年】」的「中」字左对齐：第二行起始 = 时间行起始 + 「【」宽度
  const resourceX = timePart ? startX + ctx.measureText("【").width : startX;
  ctx.fillStyle = colors.stats;
  ctx.fillText(resourcePart, Math.round(resourceX), infoY + 12 + lineH);
  ctx.fillStyle = colors.textSecondary;

  const separatorY = area.y + STATUS_ROW0_HEIGHT + STATUS_ROW1_HEIGHT;
  ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x + pad, separatorY);
  ctx.lineTo(area.x + area.width - pad, separatorY);
  ctx.stroke();

  const labels = ["武力", "魅力", "运气", "传奇"];
  const values = [
    playerAttributes.strength,
    playerAttributes.charm,
    playerAttributes.luck,
    playerAttributes.legend
  ];
  const attrAreaW = area.width - pad * 2 - ATTR_HELP_ICON_SIZE - ATTR_ICON_GAP;
  const colWidth = attrAreaW / 4;
  const baseY = area.y + STATUS_ROW0_HEIGHT + STATUS_ROW1_HEIGHT + 4 + 18;
  ctx.font = "11px 'PingFang SC', sans-serif";
  labels.forEach((label, i) => {
    const cx = area.x + pad + colWidth * i + colWidth / 2;
    ctx.fillStyle = colors.textMuted;
    ctx.textAlign = "center";
    ctx.fillText(label, cx, baseY - 1);
    ctx.fillStyle = colors.textPrimary;
    ctx.font = "bold 13px 'PingFang SC', sans-serif";
    ctx.fillText(String(values[i]), cx, baseY + 14);
    ctx.font = "11px 'PingFang SC', sans-serif";
  });

  const iconX = area.x + pad + attrAreaW + (ATTR_ICON_GAP - ATTR_HELP_ICON_SIZE) / 2;
  const iconY = baseY - 2;
  drawAttrHelpIcon(ctx, iconX, iconY, ATTR_HELP_ICON_SIZE);
}

/** 供 gameApp 点击检测：顶部状态栏内「重新开始」按钮的矩形（已收至菜单弹层，此处返回无效矩形避免误触） */
export function getRestartButtonRect(layout: UILayout): UIRect {
  return { x: 0, y: 0, width: 0, height: 0 };
}

/** 供 gameApp 点击检测：属性说明 ? 图标的矩形 */
export function getAttrHelpButtonRect(layout: UILayout): UIRect {
  const area = layout.statusPanel;
  const pad = 14;
  const attrAreaW = area.width - pad * 2 - ATTR_HELP_ICON_SIZE - ATTR_ICON_GAP;
  const baseY = area.y + STATUS_ROW0_HEIGHT + STATUS_ROW1_HEIGHT + 4 + 18;
  const iconX = area.x + pad + attrAreaW + (ATTR_ICON_GAP - ATTR_HELP_ICON_SIZE) / 2;
  const iconY = baseY - 2;
  return { x: iconX, y: iconY, width: ATTR_HELP_ICON_SIZE, height: ATTR_HELP_ICON_SIZE };
}

function drawAttrHelpIcon(ctx: CanvasCtx, x: number, y: number, size: number): void {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  ctx.save();
  ctx.strokeStyle = colors.textMuted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = colors.textMuted;
  ctx.font = `bold ${Math.round(size * 0.55)}px 'PingFang SC', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", cx, cy);
  ctx.restore();
}

const BUBBLE_FONT = "15px 'PingFang SC', sans-serif";

/** 一次 wrap 得到 lines、段落间隔与高度；\n\n 段落后 1.5 倍行距 */
function wrapBubble(
  ctx: CanvasCtx,
  text: string,
  maxWidth: number
): { lines: string[]; paragraphGapAfterIndex: number[]; height: number } {
  const pad = sizes.bubblePadding;
  const lineH = sizes.bubbleLineHeight;
  const textMaxWidth = Math.max(20, maxWidth - pad * 2);
  ctx.save();
  ctx.font = BUBBLE_FONT;
  const { lines, paragraphGapAfterIndex } = wrapTextWithParagraphs(ctx, text, textMaxWidth);
  ctx.restore();
  const paragraphGap = paragraphGapAfterIndex.length * (lineH * PARAGRAPH_GAP_RATIO);
  const height = lines.length * lineH + paragraphGap + pad * 2;
  return { lines, paragraphGapAfterIndex, height };
}

/** 更新高度与换行缓存：仅对稳定部分（展示用文案）缓存，playerName 替换导致内容变化时需失效 */
function updateHeightCache(
  ctx: CanvasCtx,
  content: string[],
  maxWidth: number,
  builtWithDisplaySubstitution?: boolean
): number[] {
  const cache = dialogueHeightCache;
  const len = content.length;
  const displayMode = !!builtWithDisplaySubstitution;

  if (
    maxWidth !== cache.maxWidth ||
    len < cache.heights.length ||
    cache.builtWithDisplaySubstitution !== displayMode
  ) {
    cache.maxWidth = maxWidth;
    cache.builtWithDisplaySubstitution = displayMode;
    cache.heights = [];
    cache.lines = [];
    cache.paragraphGapAfterIndex = [];
  }
  if (len === 0) return [];

  const needCount = len - cache.heights.length;
  if (needCount <= 0) return cache.heights;

  for (let i = cache.heights.length; i < len; i++) {
    const { lines, paragraphGapAfterIndex, height } = wrapBubble(ctx, content[i], maxWidth);
    cache.heights.push(height);
    cache.lines.push(lines);
    cache.paragraphGapAfterIndex.push(paragraphGapAfterIndex);
  }
  return cache.heights;
}

/** 计算气泡在内容坐标系中的起始 Y（startY[i] = 前 i 条高度 + 间距） */
function getBubbleStartY(heights: number[], gap: number): number[] {
  const startY: number[] = [];
  let y = 0;
  for (let i = 0; i < heights.length; i++) {
    startY.push(y);
    y += heights[i] + gap;
  }
  return startY;
}

/** 将「你：」「你说：」替换为角色名显示，用于气泡展示 */
function toDisplayLine(line: string, playerName?: string): string {
  if (!playerName) return line;
  if (line.startsWith("你：")) return line.replace(/^你：/, playerName + "：");
  if (line.startsWith("你说：")) return line.replace(/^你说：/, playerName + "：");
  return line;
}

function isPlayerBubbleLine(line: string): boolean {
  return line.startsWith("你：") || line.startsWith("你说：");
}

function drawDialogueArea(state: RenderState) {
  const { ctx, layout, dialogueHistory, dialogueScrollOffset = 0, isAdjudicating = false, typingState, playerName } =
    state;
  const area = layout.dialogueArea;
  const padding = 16;
  const bubbleGap = 10;
  const maxWidth = area.width - padding * 2;
  const displayHistory = dialogueHistory.map((t) => toDisplayLine(t, playerName));
  const bubbles =
    typingState && typingState.displayedLen > 0
      ? [...displayHistory, typingState.fullText.slice(0, typingState.displayedLen)]
      : displayHistory;
  const areaContentHeight = area.height - padding * 2;

  const stableHeights = updateHeightCache(
    ctx,
    displayHistory,
    maxWidth,
    !!playerName && dialogueHistory.some(isPlayerBubbleLine)
  );
  const stableLines = dialogueHeightCache.lines;
  const stableParagraphGap = dialogueHeightCache.paragraphGapAfterIndex;
  let typingHeight = 0;
  let typingLines: string[] = [];
  let typingParagraphGap: number[] = [];
  if (typingState && typingState.displayedLen > 0) {
    const last = wrapBubble(ctx, bubbles[bubbles.length - 1], maxWidth);
    typingHeight = last.height;
    typingLines = last.lines;
    typingParagraphGap = last.paragraphGapAfterIndex;
  }
  const allHeights =
    typingState && typingState.displayedLen > 0
      ? [...stableHeights, typingHeight]
      : stableHeights;

  let totalHeight = 0;
  for (let i = 0; i < allHeights.length; i++) {
    totalHeight += allHeights[i] + (i > 0 ? bubbleGap : 0);
  }
  lastDialogueTotalHeight = totalHeight;

  const maxScroll = Math.max(0, totalHeight - areaContentHeight);
  const scroll = Math.max(0, Math.min(dialogueScrollOffset, maxScroll));
  const visibleSrcY = Math.max(0, totalHeight - areaContentHeight - scroll);

  const startYs = getBubbleStartY(allHeights, bubbleGap);
  let firstVisible = 0;
  for (; firstVisible < allHeights.length; firstVisible++) {
    if (startYs[firstVisible] + allHeights[firstVisible] > visibleSrcY) break;
  }
  let lastVisible = firstVisible;
  for (; lastVisible < allHeights.length; lastVisible++) {
    if (startYs[lastVisible] >= visibleSrcY + areaContentHeight) break;
  }
  lastVisible = Math.min(lastVisible, allHeights.length - 1);
  if (firstVisible > lastVisible) lastVisible = firstVisible;
  firstVisible = Math.max(0, firstVisible - 1);
  lastVisible = Math.min(allHeights.length - 1, lastVisible + 1);

  drawRoundedRect(ctx, area, colors.dialogueBg, colors.dialogueBorder, radius.panel);

  const historyStartYs = getBubbleStartY(stableHeights, bubbleGap);
  const historyTotalHeight =
    stableHeights.length > 0
      ? historyStartYs[stableHeights.length - 1] + stableHeights[stableHeights.length - 1]
      : 0;
  const needOffscreen =
    stableHeights.length > 0 &&
    (displayHistory.length !== lastOffscreenHistoryLen || maxWidth !== lastOffscreenWidth);
  if (needOffscreen && historyTotalHeight > 0) {
    if (
      !dialogueOffscreen ||
      dialogueOffscreen.canvas.width !== maxWidth ||
      dialogueOffscreen.canvas.height !== historyTotalHeight
    ) {
      const oc = createOffscreenCanvas(maxWidth, historyTotalHeight, ctx);
      if (oc) {
        dialogueOffscreen = {
          canvas: oc,
          ctx: oc.getContext("2d") as CanvasCtx
        };
      }
    }
    if (dialogueOffscreen?.ctx) {
      const ocCtx = dialogueOffscreen.ctx;
      ocCtx.clearRect(0, 0, maxWidth, historyTotalHeight);
      for (let k = 0; k < displayHistory.length; k++) {
        const text = displayHistory[k];
        const isPlayer = isPlayerBubbleLine(dialogueHistory[k]);
        drawBubble(
          ocCtx,
          { x: 0, y: historyStartYs[k], width: maxWidth, text, player: isPlayer },
          stableLines[k],
          stableParagraphGap[k]
        );
      }
      dialogueOffscreenValid = true;
      lastOffscreenHistoryLen = displayHistory.length;
      lastOffscreenWidth = maxWidth;
    }
  } else if (stableHeights.length === 0) {
    dialogueOffscreenValid = false;
    lastOffscreenHistoryLen = -1;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.width, area.height);
  ctx.clip();
  ctx.translate(area.x + padding, area.y + padding - visibleSrcY);

  if (dialogueOffscreenValid && dialogueOffscreen && historyTotalHeight > 0) {
    const srcH = Math.min(areaContentHeight, historyTotalHeight - visibleSrcY);
    if (srcH > 0) {
      ctx.drawImage(
        dialogueOffscreen.canvas as CanvasImageSource,
        0,
        visibleSrcY,
        maxWidth,
        srcH,
        0,
        0,
        maxWidth,
        srcH
      );
    }
    if (typingState && typingState.displayedLen > 0 && displayHistory.length < allHeights.length) {
      const k = displayHistory.length;
      const text = bubbles[k];
      const isPlayer = k < dialogueHistory.length ? isPlayerBubbleLine(dialogueHistory[k]) : false;
      drawBubble(
        ctx,
        { x: 0, y: startYs[k], width: maxWidth, text, player: isPlayer },
        typingLines,
        typingParagraphGap
      );
    }
  } else {
    for (let k = firstVisible; k <= lastVisible; k++) {
      const text = bubbles[k];
      const isPlayer = k < dialogueHistory.length ? isPlayerBubbleLine(dialogueHistory[k]) : false;
      const lines =
        k < stableLines.length ? stableLines[k] : k === stableHeights.length ? typingLines : [];
      const paraGap =
        k < stableParagraphGap.length
          ? stableParagraphGap[k]
          : k === stableHeights.length
            ? typingParagraphGap
            : [];
      drawBubble(
        ctx,
        { x: 0, y: startYs[k], width: maxWidth, text, player: isPlayer },
        lines,
        paraGap
      );
    }
  }

  ctx.restore();

  if (maxScroll > 8 && scroll < maxScroll - 4 && !isAdjudicating && !typingState) {
    ctx.fillStyle = colors.textSecondary;
    ctx.globalAlpha = 0.9;
    ctx.font = "11px 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("下滑查看更多", area.x + area.width / 2, area.y + area.height - 10);
    ctx.globalAlpha = 1;
  }

  if (typingState && typingState.displayedLen < typingState.fullText.length) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = colors.accent;
    ctx.font = "12px 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("点击屏幕跳过", area.x + area.width / 2, area.y + area.height - 10);
    ctx.globalAlpha = 1;
  }

  if (isAdjudicating) {
    drawLoadingIndicator(ctx, area);
  }
}

/** 对话区底部：动态转圈 + 带点点循环的等待文案 */
const ADJUDICATING_LABEL_BASE = "局势推演中";

function drawLoadingIndicator(ctx: CanvasCtx, area: UIRect): void {
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height - 28;
  const radius = 12;
  const t = Date.now() / 1000;
  const startAngle = t * Math.PI * 2;
  const endAngle = startAngle + Math.PI * 1.5;

  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(centerX, centerY - 16, radius, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();

  const dotCycle = Math.floor((Date.now() / 400) % 4);
  const dots = dotCycle === 0 ? "" : ".".repeat(dotCycle);
  const label = ADJUDICATING_LABEL_BASE + dots;

  const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = colors.textMuted;
  ctx.font = "12px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, centerX, centerY + 6);
  ctx.globalAlpha = 1;
}

const SEND_BTN_WIDTH = sizes.sendBtnWidth;
const ACTION_CHIP_GAP = sizes.actionChipGap;

/** 输入区上方固定提示（首屏/未发送过时），单行小字不占对话区 */
function drawInputHint(state: RenderState): void {
  const { ctx, layout, inputHintText } = state;
  if (!inputHintText) return;
  const area = layout.inputArea;
  const maxWidth = area.width - 16;
  const yBaseline = area.y - 6;
  ctx.save();
  ctx.font = "11px 'PingFang SC', sans-serif";
  ctx.fillStyle = colors.textMuted;
  ctx.textAlign = "left";
  const lines = wrapText(ctx, inputHintText, maxWidth);
  const display = lines.length > 1 ? (lines[0] ?? inputHintText) + "…" : (lines[0] ?? inputHintText);
  ctx.fillText(display, area.x, yBaseline);
  ctx.restore();
}

/** 行动引导槽：绘制 3 个可选动作芯片，志向相关用 accent 高亮 */
function drawActionGuideSlot({
  ctx,
  layout,
  suggestedActions,
  isAdjudicating
}: RenderState): void {
  const actions = suggestedActions ?? [];
  if (actions.length === 0) return;

  const area = layout.actionGuideSlot;
  const pad = 6;
  const chipCount = Math.min(3, actions.length);
  const totalGap = (chipCount - 1) * ACTION_CHIP_GAP;
  const chipWidth = Math.max(64, (area.width - pad * 2 - totalGap) / chipCount);
  const chipHeight = Math.max(40, area.height - pad * 2);

  ctx.font = "13px 'PingFang SC', sans-serif";
  actions.slice(0, 3).forEach((item, i) => {
    const text = item.text;
    const isAspiration = item.is_aspiration_focused;
    const x = area.x + pad + i * (chipWidth + ACTION_CHIP_GAP);
    const y = area.y + pad;
    const rect: UIRect = { x, y, width: chipWidth, height: chipHeight };
    const disabled = !!isAdjudicating;
    if (disabled) {
      drawRoundedRect(ctx, rect, colors.chipDisabled, colors.panelBorder, radius.chip);
      ctx.globalAlpha = 0.6;
    } else {
      drawRoundedRect(
        ctx,
        rect,
        isAspiration ? "rgba(56, 189, 248, 0.18)" : colors.accentChip,
        isAspiration ? "rgba(56, 189, 248, 0.5)" : colors.accentChipBorder,
        radius.chip
      );
    }
    ctx.fillStyle = disabled ? colors.textMuted : isAspiration ? colors.accent : colors.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = chipWidth - 12;
    const fullW = ctx.measureText(text).width;
    if (fullW <= maxW) {
      ctx.font = "13px 'PingFang SC', sans-serif";
      ctx.fillText(text, x + chipWidth / 2, y + chipHeight / 2);
    } else {
      ctx.font = "11px 'PingFang SC', sans-serif";
      const chars = Array.from(text);
      let line1Len = 0;
      for (let k = 1; k <= chars.length; k++) {
        if (ctx.measureText(chars.slice(0, k).join("")).width <= maxW) line1Len = k;
        else break;
      }
      const line1 = line1Len > 0 ? chars.slice(0, line1Len).join("") : text.slice(0, 1);
      let line2 = line1Len < chars.length ? chars.slice(line1Len).join("") : "";
      if (line2 && ctx.measureText(line2).width > maxW) {
        for (let k = line2.length; k > 0; k--) {
          const t = line2.slice(0, k) + "…";
          if (ctx.measureText(t).width <= maxW) {
            line2 = t;
            break;
          }
        }
      }
      const lineH = 13;
      const startY = y + (chipHeight - (line2 ? lineH * 2 : lineH)) / 2 + (line2 ? lineH : lineH / 2);
      ctx.fillText(line1, x + chipWidth / 2, startY);
      if (line2) ctx.fillText(line2, x + chipWidth / 2, startY + lineH);
    }
    ctx.font = "13px 'PingFang SC', sans-serif";
    ctx.globalAlpha = 1;
  });
}

/** 供 gameApp 点击检测：行动引导槽最多 3 颗芯片的矩形 */
export function getActionGuideChipRects(
  layout: UILayout,
  suggestedActions: Array<{ text: string; is_aspiration_focused: boolean }>
): Array<{ rect: UIRect; text: string }> {
  const actions = suggestedActions ?? [];
  if (actions.length === 0) return [];

  const area = layout.actionGuideSlot;
  const pad = 6;
  const chipCount = Math.min(3, actions.length);
  const totalGap = (chipCount - 1) * ACTION_CHIP_GAP;
  const chipWidth = Math.max(64, (area.width - pad * 2 - totalGap) / chipCount);
  const chipHeight = Math.max(40, area.height - pad * 2);

  return actions.slice(0, 3).map((item, i) => ({
    rect: {
      x: area.x + pad + i * (chipWidth + ACTION_CHIP_GAP),
      y: area.y + pad,
      width: chipWidth,
      height: chipHeight
    },
    text: item.text
  }));
}

/** 限制展示长度，超出时显示省略号+尾部，避免溢出与 measureText 卡顿 */
const MAX_INPUT_DISPLAY_LEN = 80;

function fitInputText(ctx: CanvasCtx, text: string, maxWidth: number): string {
  if (!text) return text;
  const safe = text.length > MAX_INPUT_DISPLAY_LEN ? text.slice(-MAX_INPUT_DISPLAY_LEN) : text;
  if (ctx.measureText(safe).width <= maxWidth) return safe;
  const ellipsis = "…";
  const targetW = maxWidth - ctx.measureText(ellipsis).width;
  const chars = Array.from(safe);
  let tail = "";
  for (let i = chars.length - 1; i >= 0; i--) {
    const next = chars[i] + tail;
    if (ctx.measureText(next).width > targetW) break;
    tail = next;
  }
  return ellipsis + tail;
}

function drawInputArea({
  ctx,
  layout,
  currentInput,
  keyboardActive,
  isAdjudicating
}: RenderState) {
  const area = layout.inputArea;
  const pad = 10;
  const btnGap = 10;
  drawRoundedRect(ctx, area, colors.panel, colors.panelBorder, radius.panel);

  const inputRect: UIRect = {
    x: area.x + pad,
    y: area.y + pad,
    width: area.width - pad * 2 - SEND_BTN_WIDTH - btnGap,
    height: area.height - pad * 2
  };
  drawRoundedRect(ctx, inputRect, colors.inputBg, colors.panelBorder, radius.input);

  const placeholder = currentInput
    ? ""
    : isAdjudicating
      ? ADJUDICATING_LABEL
      : keyboardActive
        ? "输入中..."
        : INPUT_PLACEHOLDER;
  ctx.fillStyle = currentInput ? colors.textPrimary : colors.textMuted;
  ctx.font = isAdjudicating ? "14px 'PingFang SC', sans-serif" : "15px 'PingFang SC', sans-serif";
  const textY = inputRect.y + inputRect.height / 2 + 5;
  const textPadding = 14;
  const availableWidth = inputRect.width - textPadding * 2;

  const rawDisplay = currentInput || placeholder;
  const displayText = fitInputText(ctx, rawDisplay, availableWidth);

  ctx.save();
  ctx.beginPath();
  ctx.rect(inputRect.x, inputRect.y, inputRect.width, inputRect.height);
  ctx.clip();

  if (displayText === rawDisplay) {
    ctx.textAlign = "left";
    ctx.fillText(displayText || " ", inputRect.x + textPadding, textY);
  } else {
    ctx.textAlign = "right";
    ctx.fillText(displayText || " ", inputRect.x + inputRect.width - textPadding, textY);
  }
  ctx.restore();

  const buttonRect: UIRect = {
    x: area.x + area.width - pad - SEND_BTN_WIDTH,
    y: area.y + pad,
    width: SEND_BTN_WIDTH,
    height: area.height - pad * 2
  };
  drawSendIconButton(ctx, buttonRect, isAdjudicating);
}

function drawBubble(
  ctx: CanvasCtx,
  bubble: { x: number; y: number; width: number; text: string; player: boolean },
  cachedLines?: string[],
  paragraphGapAfterIndex?: number[]
): number {
  const pad = sizes.bubblePadding;
  const lineH = sizes.bubbleLineHeight;
  let lines: string[];
  let gapAfter: number[] = paragraphGapAfterIndex ?? [];
  if (cachedLines != null) {
    lines = cachedLines;
  } else {
    const textMaxWidth = Math.max(20, bubble.width - pad * 2);
    ctx.save();
    ctx.font = BUBBLE_FONT;
    const wrapped = wrapTextWithParagraphs(ctx, bubble.text, textMaxWidth);
    ctx.restore();
    lines = wrapped.lines;
    gapAfter = wrapped.paragraphGapAfterIndex;
  }
  const paragraphGap = gapAfter.length * (lineH * PARAGRAPH_GAP_RATIO);
  const height = lines.length * lineH + paragraphGap + pad * 2;

  ctx.save();
  drawRoundedRect(
    ctx,
    { x: bubble.x, y: bubble.y, width: bubble.width, height },
    bubble.player ? colors.bubblePlayer : colors.bubbleSystem,
    bubble.player ? colors.bubblePlayerBorder : colors.bubbleSystemBorder,
    radius.bubble
  );
  ctx.fillStyle = bubble.player ? colors.textPrimary : colors.textSecondary;
  ctx.font = BUBBLE_FONT;
  ctx.textAlign = "left";
  let y = bubble.y + pad;
  lines.forEach((line, index) => {
    ctx.fillText(line, bubble.x + pad, y + lineH * 0.85);
    y += lineH;
    if (gapAfter.includes(index)) y += lineH * PARAGRAPH_GAP_RATIO;
  });
  ctx.restore();
  return height;
}

function drawSendIconButton(ctx: CanvasCtx, rect: UIRect, disabled = false): void {
  if (disabled) {
    drawRoundedRect(ctx, rect, colors.chipDisabled, colors.panelBorder, radius.input);
    ctx.globalAlpha = 0.6;
    drawSendIcon(ctx, rect);
    ctx.globalAlpha = 1;
    return;
  }
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  gradient.addColorStop(0, colors.accent);
  gradient.addColorStop(1, colors.sendBtnGradientEnd);
  drawRoundedRect(ctx, rect, gradient, undefined, radius.input);
  drawSendIcon(ctx, rect);
}

/** 发送图标：纸飞机形状，居中绘制在 rect 内 */
function drawSendIcon(ctx: CanvasCtx, rect: UIRect): void {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const size = Math.min(rect.width, rect.height) * 0.36;
  ctx.save();
  ctx.fillStyle = colors.bgMid;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.9, cy - size * 0.2);
  ctx.lineTo(cx + size * 0.6, cy);
  ctx.lineTo(cx - size * 0.9, cy + size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.6, cy);
  ctx.lineTo(cx - size * 0.3, cy - size * 0.5);
  ctx.lineTo(cx - size * 0.3, cy + size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
