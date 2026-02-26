/**
 * 菜单与弹窗：生平回顾等
 */
import type { UILayout, UIRect } from "@ui/layout";
import type { HistoryLogEntry } from "@core/state";
import { colors, radius } from "@ui/theme";
import { drawRoundedRect, wrapText } from "@ui/primitives";

const TIME_BANNER_HEIGHT = 28;
const HISTORY_BTN_WIDTH = 52;

/** 状态栏第 0 行高度（仅「系统」按钮，左上角） */
export const STATUS_ROW0_HEIGHT = 36;
/** 状态栏第 1 行高度（时间+地点+行动力/健康度/金钱/粮草：单行或两行，胶囊下全宽） */
export const STATUS_ROW1_HEIGHT = 48;
const STATUS_MENU_BTN_WIDTH = 48;
const STATUS_MENU_BTN_HEIGHT = 32;
const STATUS_MENU_POPUP_ITEM_H = 40;
const STATUS_MENU_POPUP_PAD = 8;
const STATUS_MENU_LEFT_PAD = 10;

/** 状态栏「系统」按钮矩形（页面左上角）；有胶囊信息时与胶囊等高且垂直中线对齐 */
export function getStatusMenuButtonRect(layout: UILayout): UIRect {
  const area = layout.statusPanel;
  const centerY = layout.capsuleCenterY;
  const capH = layout.capsuleHeight;
  if (typeof centerY === "number" && typeof capH === "number" && capH > 0) {
    return {
      x: area.x + STATUS_MENU_LEFT_PAD,
      y: centerY - capH / 2,
      width: STATUS_MENU_BTN_WIDTH,
      height: capH
    };
  }
  return {
    x: area.x + STATUS_MENU_LEFT_PAD,
    y: area.y + (STATUS_ROW0_HEIGHT - STATUS_MENU_BTN_HEIGHT) / 2,
    width: STATUS_MENU_BTN_WIDTH,
    height: STATUS_MENU_BTN_HEIGHT
  };
}

/** 菜单弹层内两项的矩形，供 gameApp 点击检测；仅在 statusMenuVisible 时有效 */
export function getStatusMenuPopupRects(layout: UILayout): { history: UIRect; restart: UIRect } {
  const menuRect = getStatusMenuButtonRect(layout);
  const popupW = 120;
  const popupX = menuRect.x;
  const popupY = menuRect.y + menuRect.height + 4;
  const itemW = popupW - STATUS_MENU_POPUP_PAD * 2;
  return {
    history: {
      x: popupX + STATUS_MENU_POPUP_PAD,
      y: popupY + STATUS_MENU_POPUP_PAD,
      width: itemW,
      height: STATUS_MENU_POPUP_ITEM_H
    },
    restart: {
      x: popupX + STATUS_MENU_POPUP_PAD,
      y: popupY + STATUS_MENU_POPUP_PAD + STATUS_MENU_POPUP_ITEM_H,
      width: itemW,
      height: STATUS_MENU_POPUP_ITEM_H
    }
  };
}

/** 绘制状态栏「系统」按钮，由 renderer 在状态栏第一行左上角调用 */
export function drawStatusMenuButton(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: UILayout
): void {
  const rect = getStatusMenuButtonRect(layout);
  drawRoundedRect(ctx, rect, "#1e3a4f", "rgba(56, 189, 248, 0.45)", 6);
  ctx.fillStyle = colors.accent;
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("系统", rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
}

/** 绘制状态栏菜单弹层（生平 / 重新开始），由 renderer 在 statusMenuVisible 时调用 */
export function drawStatusMenuPopup(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: UILayout
): void {
  const menuRect = getStatusMenuButtonRect(layout);
  const popupW = 120;
  const popupH = STATUS_MENU_POPUP_PAD * 2 + STATUS_MENU_POPUP_ITEM_H * 2;
  const popupX = menuRect.x;
  const popupY = menuRect.y + menuRect.height + 4;
  const panel: UIRect = { x: popupX, y: popupY, width: popupW, height: popupH };
  drawRoundedRect(ctx, panel, colors.panel, colors.panelBorder, radius.panel);
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("生平", panel.x + panel.width / 2, panel.y + STATUS_MENU_POPUP_PAD + STATUS_MENU_POPUP_ITEM_H / 2);
  ctx.fillText("重新开始", panel.x + panel.width / 2, panel.y + STATUS_MENU_POPUP_PAD + STATUS_MENU_POPUP_ITEM_H + STATUS_MENU_POPUP_ITEM_H / 2);
}

/** TimeBanner 右侧「生平回顾」按钮的矩形（旧布局保留，现由菜单替代） */
export function getHistoryButtonRect(layout: UILayout): UIRect {
  const area = layout.statusPanel;
  const bannerY = Math.max(0, area.y - TIME_BANNER_HEIGHT - 6);
  return {
    x: area.x + layout.contentWidthTop - layout.safeMargin - HISTORY_BTN_WIDTH,
    y: bannerY,
    width: HISTORY_BTN_WIDTH,
    height: TIME_BANNER_HEIGHT
  };
}

/** 在 TimeBanner 右侧绘制「生平」按钮（旧布局保留，新布局用 drawStatusMenuButton） */
export function drawHistoryButton(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: UILayout
): void {
  const rect = getHistoryButtonRect(layout);
  drawRoundedRect(ctx, rect, "rgba(56, 189, 248, 0.12)", "rgba(56, 189, 248, 0.3)", 6);
  ctx.fillStyle = colors.accent;
  ctx.font = "12px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("生平", rect.x + rect.width / 2, rect.y + rect.height / 2 + 4);
}

const MODAL_PAD = 20;
const LINE_H = 18;
const MAX_MODAL_HEIGHT_RATIO = 0.6;

/** 生平回顾弹窗：遮罩 + 列表 + 点击任意处关闭 */
export function drawHistoryModal(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  screenWidth: number,
  screenHeight: number,
  logs: HistoryLogEntry[]
): void {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, screenWidth, screenHeight);

  const panelMargin = Math.max(24, Math.round(screenWidth * 0.08));
  const panelWidth = screenWidth - panelMargin * 2;
  const maxTextWidth = panelWidth - MODAL_PAD * 2;

  ctx.font = "13px 'PingFang SC', sans-serif";
  let contentH = MODAL_PAD + LINE_H + 12;
  const wrapped: string[][] = [];
  const entries = [...logs].reverse();
  for (const entry of entries) {
    const line = `${entry.year}年${entry.month ?? ""}月：${entry.text}`;
    const lines = wrapText(ctx, line, maxTextWidth);
    wrapped.push(lines);
    contentH += lines.length * LINE_H + 6;
  }
  contentH += LINE_H + MODAL_PAD + 20;
  const panelHeight = Math.min(contentH, screenHeight * MAX_MODAL_HEIGHT_RATIO);
  const panelX = panelMargin;
  const panelY = (screenHeight - panelHeight) / 2;
  const panel: UIRect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };

  drawRoundedRect(ctx, panel, colors.panel, colors.panelBorder, radius.panel);

  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, panelY, panelWidth, panelHeight);
  ctx.clip();

  let y = panelY + MODAL_PAD;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "bold 16px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("生平回顾", panelX + MODAL_PAD, y + 14);
  y += LINE_H + 12;

  ctx.font = "12px 'PingFang SC', sans-serif";
  ctx.fillStyle = colors.textSecondary;
  for (const lines of wrapped) {
    for (const line of lines) {
      ctx.fillText(line, panelX + MODAL_PAD, y + 12);
      y += LINE_H;
    }
    y += 6;
  }
  ctx.fillStyle = colors.textMuted;
  ctx.font = "11px 'PingFang SC', sans-serif";
  ctx.fillText("点击任意处关闭", panelX + MODAL_PAD, y + 12);
  ctx.restore();
  ctx.restore();
}

/** 弹窗全屏遮罩矩形，点击即关闭 */
export function getHistoryModalCloseRect(): UIRect {
  return { x: 0, y: 0, width: 9999, height: 9999 };
}
