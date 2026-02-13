import type { GameSaveData, PlayerAttributes } from "@core/state";
import type { UILayout, UIRect } from "@ui/layout";

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 对话区离屏缓存：内容变化时重绘，滚动时仅 drawImage，显著减轻卡顿 */
interface DialogueCache {
  canvas: HTMLCanvasElement | OffscreenCanvas | null;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  cacheKey: string;
  totalHeight: number;
}
const dialogueCache: DialogueCache = {
  canvas: null,
  ctx: null,
  cacheKey: "",
  totalHeight: 0
};

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

const PLACEHOLDERS = ["前往洛阳", "打听消息", "结识豪杰"];

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
  isSaveLoadPanelVisible: boolean;
  keyboardActive: boolean;
  dialogueScrollOffset?: number;
  /** 输入框占位文案索引，用于轮换 */
  placeholderIndex?: number;
}

const colors = {
  bgStart: "#0f172a",
  bgEnd: "#1e293b",
  panel: "rgba(30, 41, 59, 0.92)",
  panelBorder: "rgba(148, 163, 184, 0.2)",
  dialogueBg: "rgba(15, 23, 42, 0.85)",
  bubbleSystem: "rgba(255,255,255,0.06)",
  bubblePlayer: "rgba(56, 189, 248, 0.12)",
  bubblePlayerBorder: "rgba(56, 189, 248, 0.35)",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accent: "#38bdf8",
  success: "#4ade80",
  warn: "#fb7185"
};

export function renderScreen(state: RenderState): void {
  const { ctx, screenWidth, screenHeight } = state;
  drawBackground(ctx, screenWidth, screenHeight);
  drawAttributePanel(state);
  drawDialogueArea(state);
  drawInputArea(state);
  drawSaveLoadPanel(state);
}

function drawBackground(ctx: CanvasCtx, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.bgStart);
  gradient.addColorStop(1, colors.bgEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawAttributePanel({ ctx, layout, playerAttributes, currentSaveData }: RenderState) {
  const area = layout.attributePanel;
  const pad = 14;
  drawRoundedRect(ctx, area, colors.panel, colors.panelBorder);

  ctx.fillStyle = colors.accent;
  ctx.font = "bold 14px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("玩家属性", area.x + pad, area.y + 16);

  const labels = ["武力", "智力", "魅力", "运气", "传奇", "气势"];
  const values = [
    playerAttributes.strength,
    playerAttributes.intelligence,
    playerAttributes.charm,
    playerAttributes.luck,
    playerAttributes.legend,
    Math.max(0, Math.round(playerAttributes.legend / 10))
  ];
  const colWidth = (area.width - pad * 2) / 6;
  ctx.font = "13px 'PingFang SC', sans-serif";
  labels.forEach((label, i) => {
    const cx = area.x + pad + colWidth * i + colWidth / 2;
    const baseY = area.y + 36;
    ctx.fillStyle = colors.textMuted;
    ctx.textAlign = "center";
    ctx.fillText(label, cx, baseY - 2);
    ctx.fillStyle = colors.textPrimary;
    ctx.fillText(String(values[i]), cx, baseY + 14);
  });

  const region = currentSaveData?.player?.location?.region ?? "";
  const scene = currentSaveData?.player?.location?.scene ?? "";
  const regionName = (REGION_NAMES[region] ?? region) || "—";
  const sceneName = (SCENE_NAMES[scene] ?? scene) || "—";
  const locationText = `${regionName} · ${sceneName}`;
  ctx.fillStyle = colors.textMuted;
  ctx.font = "11px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(locationText, area.x + pad, area.y + area.height - 8);

  const statusLabel = currentSaveData ? "已存档" : "新游戏";
  ctx.fillStyle = currentSaveData ? colors.success : colors.warn;
  ctx.textAlign = "right";
  ctx.fillText(`${statusLabel} · 点击存档`, area.x + area.width - pad, area.y + area.height - 8);
}

function measureBubble(ctx: CanvasCtx, text: string, maxWidth: number): number {
  const padding = 12;
  const lineHeight = 22;
  ctx.save();
  ctx.font = "14px 'PingFang SC', sans-serif";
  const lines = wrapText(ctx, text, maxWidth - padding * 2);
  ctx.restore();
  return lines.length * lineHeight + padding * 2;
}

function drawDialogueArea(state: RenderState) {
  const { ctx, layout, dialogueHistory, dialogueScrollOffset = 0 } = state;
  const area = layout.dialogueArea;
  const padding = 14;
  const bubbleGap = 8;
  const maxWidth = area.width - padding * 2;
  const bubbles = dialogueHistory;
  const areaContentHeight = area.height - padding * 2;

  const heights: number[] = [];
  bubbles.forEach((line) => {
    heights.push(measureBubble(ctx, line, maxWidth));
  });
  const totalHeight = heights.reduce((a, h) => a + h + bubbleGap, -bubbleGap);
  const maxScroll = Math.max(0, totalHeight - areaContentHeight);
  const scroll = Math.min(dialogueScrollOffset, maxScroll);

  const cacheKey = `${bubbles.join("\x01")}|${area.width}x${area.height}`;
  const needRedraw =
    dialogueCache.cacheKey !== cacheKey ||
    !dialogueCache.canvas ||
    dialogueCache.totalHeight !== totalHeight;

  if (needRedraw && totalHeight > 0) {
    const off = createOffscreenCanvas(area.width, totalHeight, ctx);
    if (off) {
      const offCtx = off.getContext("2d");
      if (offCtx) {
        let cursorY = 0;
        bubbles.forEach((line) => {
          const isPlayer = line.startsWith("你说：");
          const bubbleHeight = drawBubble(offCtx, {
            x: padding,
            y: cursorY,
            width: maxWidth,
            text: line,
            player: isPlayer
          });
          cursorY += bubbleHeight + bubbleGap;
        });
        dialogueCache.canvas = off;
        dialogueCache.ctx = offCtx;
        dialogueCache.cacheKey = cacheKey;
        dialogueCache.totalHeight = totalHeight;
      }
    } else {
      dialogueCache.cacheKey = "";
      dialogueCache.canvas = null;
      dialogueCache.ctx = null;
      dialogueCache.totalHeight = 0;
    }
  }

  drawRoundedRect(ctx, area, colors.dialogueBg, "rgba(148,163,184,0.12)");

  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.width, area.height);
  ctx.clip();

  if (dialogueCache.canvas && dialogueCache.ctx) {
    const srcY = Math.max(0, totalHeight - areaContentHeight - scroll);
    const srcH = Math.min(areaContentHeight, totalHeight - srcY);
    const destY = area.y + padding;
    ctx.drawImage(
      dialogueCache.canvas,
      0,
      srcY,
      area.width,
      srcH,
      area.x,
      destY,
      area.width,
      srcH
    );
  } else {
    const baseTranslate = area.height - totalHeight - padding * 2;
    ctx.translate(0, baseTranslate + scroll);
    let cursorY = area.y + padding;
    bubbles.forEach((line) => {
      const isPlayer = line.startsWith("你说：");
      const bubbleHeight = drawBubble(ctx, {
        x: area.x + padding,
        y: cursorY,
        width: maxWidth,
        text: line,
        player: isPlayer
      });
      cursorY += bubbleHeight + bubbleGap;
    });
  }

  ctx.restore();

  if (maxScroll > 0 && scroll < maxScroll - 2) {
    ctx.fillStyle = colors.accent;
    ctx.font = "12px 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("↑ 上滑查看历史对话", area.x + area.width / 2, area.y + area.height - 8);
  }
}

function drawInputArea({ ctx, layout, currentInput, keyboardActive, placeholderIndex }: RenderState) {
  const area = layout.inputArea;
  const pad = 12;
  const btnWidth = 64;
  const btnGap = 10;
  drawRoundedRect(ctx, area, colors.panel, colors.panelBorder);

  const inputRect: UIRect = {
    x: area.x + pad,
    y: area.y + pad,
    width: area.width - pad * 2 - btnWidth - btnGap,
    height: area.height - pad * 2
  };
  drawRoundedRect(ctx, inputRect, "rgba(15,23,42,0.9)", "rgba(148,163,184,0.2)", 10);

  const idx = (placeholderIndex ?? 0) % PLACEHOLDERS.length;
  const placeholder = currentInput ? "" : keyboardActive ? "输入中..." : PLACEHOLDERS[idx];
  ctx.fillStyle = currentInput ? colors.textPrimary : colors.textMuted;
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  const displayText = currentInput || placeholder;
  const textY = inputRect.y + inputRect.height / 2 + 5;
  ctx.fillText(displayText || " ", inputRect.x + 12, textY);

  const buttonRect: UIRect = {
    x: area.x + area.width - pad - btnWidth,
    y: area.y + pad,
    width: btnWidth,
    height: area.height - pad * 2
  };
  drawButton(ctx, buttonRect, "发送");
}

function drawSaveLoadPanel({ ctx, layout, currentSaveData }: RenderState) {
  if (!layout.saveLoadPanel) {
    return;
  }
  const area = layout.saveLoadPanel;
  const pad = 10;
  const btnGap = 8;
  const btnW = (area.width - pad * 2 - btnGap) / 2;
  const btnH = area.height - pad * 2;
  drawRoundedRect(ctx, area, colors.panel, colors.panelBorder);

  const buttons = [
    { label: "保存", x: area.x + pad },
    { label: "关闭", x: area.x + pad + btnW + btnGap }
  ];
  buttons.forEach(({ label, x }) => {
    drawRoundedRect(
      ctx,
      { x, y: area.y + pad, width: btnW, height: btnH },
      "rgba(15,23,42,0.9)",
      "rgba(148,163,184,0.2)",
      10
    );
    ctx.fillStyle = colors.textPrimary;
    ctx.font = "bold 13px 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + btnW / 2, area.y + pad + btnH / 2 + 4);
  });

  if (currentSaveData) {
    ctx.fillStyle = colors.textMuted;
    ctx.font = "11px 'PingFang SC', sans-serif";
    ctx.textAlign = "left";
    const infoY = area.y + area.height - 6;
    ctx.fillText(`${currentSaveData.meta.saveName} · ${new Date(currentSaveData.meta.lastSaved).toLocaleDateString()}`, area.x + pad, infoY);
  }
}

function drawBubble(
  ctx: CanvasCtx,
  bubble: { x: number; y: number; width: number; text: string; player: boolean }
): number {
  const padding = 12;
  const lineHeight = 22;
  const maxWidth = bubble.width - padding * 2;
  const lines = wrapText(ctx, bubble.text, maxWidth);
  const height = lines.length * lineHeight + padding * 2;

  ctx.save();
  drawRoundedRect(
    ctx,
    { x: bubble.x, y: bubble.y, width: bubble.width, height },
    bubble.player ? colors.bubblePlayer : colors.bubbleSystem,
    bubble.player ? colors.bubblePlayerBorder : "rgba(255,255,255,0.08)",
    10
  );
  ctx.fillStyle = bubble.player ? colors.textPrimary : colors.textSecondary;
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  lines.forEach((line, index) => {
    ctx.fillText(line, bubble.x + padding, bubble.y + padding + lineHeight * (index + 0.82));
  });
  ctx.restore();
  return height;
}

function wrapText(ctx: CanvasCtx, text: string, maxWidth: number): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  chars.forEach((char) => {
    const testLine = current + char;
    if (ctx.measureText(testLine).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = testLine;
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasCtx,
  rect: UIRect,
  fill: string | CanvasGradient,
  stroke?: string,
  radius = 18
): void {
  const { x, y, width, height } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawButton(ctx: CanvasCtx, rect: UIRect, label: string): void {
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  gradient.addColorStop(0, "#38bdf8");
  gradient.addColorStop(1, "#3b82f6");
  drawRoundedRect(ctx, rect, gradient, undefined, 10);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 14px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 4);
}
