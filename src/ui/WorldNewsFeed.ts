/**
 * 天下传闻（战报流）：可折叠区域，展示 WorldManager 产出的最新战报（tempData.recentWorldReports）。
 * 视觉：宣纸/木纹底色，与普通对话气泡区分。
 */
import type { UIRect } from "@ui/layout";
import { radius } from "@ui/theme";
import { drawRoundedRect, wrapText } from "@ui/primitives";

export type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 宣纸/斑驳木纹感底色 */
const NEWS_FEED_BG = "rgba(232, 220, 200, 0.92)";
const NEWS_FEED_BORDER = "rgba(160, 140, 110, 0.4)";
const NEWS_FEED_HEADER = "rgba(120, 100, 80, 0.85)";
const NEWS_FEED_TEXT = "#5c4a3a";

const HEADER_HEIGHT = 28;
const LINE_HEIGHT = 16;
const PAD = 10;
const MAX_LINES = 3;

export interface WorldNewsFeedState {
  /** 最新战报（客观或文学化），最多展示 3 条 */
  reports: string[];
  /** 是否展开列表 */
  expanded: boolean;
}

/**
 * 绘制天下传闻区域：标题行「天下传闻 ▼/▲」，展开时显示最多 3 条战报。
 */
export function drawWorldNewsFeed(
  ctx: CanvasCtx,
  rect: UIRect,
  state: WorldNewsFeedState
): void {
  const { reports, expanded } = state;
  drawRoundedRect(ctx, rect, NEWS_FEED_BG, NEWS_FEED_BORDER, radius.small);

  ctx.save();
  ctx.font = "12px 'PingFang SC', sans-serif";
  ctx.fillStyle = NEWS_FEED_HEADER;
  ctx.textAlign = "left";
  const arrow = expanded ? " ▲" : " ▼";
  const headerText = `天下传闻${reports.length > 0 ? `（${reports.length}）` : ""}${arrow}`;
  ctx.fillText(headerText, rect.x + PAD, rect.y + HEADER_HEIGHT - 8);

  if (expanded && reports.length > 0) {
    const listY = rect.y + HEADER_HEIGHT + 4;
    const maxW = rect.width - PAD * 2;
    const toShow = reports.slice(-MAX_LINES);
    toShow.forEach((text, i) => {
      const y = listY + i * (LINE_HEIGHT + 2);
      if (y + LINE_HEIGHT > rect.y + rect.height - PAD) return;
      const lines = wrapText(ctx, text, maxW);
      ctx.fillStyle = NEWS_FEED_TEXT;
      ctx.fillText(lines[0] ?? text.slice(0, 20) + (text.length > 20 ? "…" : ""), rect.x + PAD, y + 12);
    });
  }
  ctx.restore();
}

/** 点击整块天下传闻区域用于折叠/展开时，返回标题行矩形（用于 hit 检测） */
export function getWorldNewsFeedHeaderRect(rect: UIRect): UIRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: HEADER_HEIGHT
  };
}
