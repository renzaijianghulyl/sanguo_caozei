/**
 * UI 基础绘图原语：圆角矩形、文字换行
 * 供 renderer、splash、characterCreation 复用
 */
import type { UIRect } from "@ui/layout";

export type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 绘制圆角矩形，支持 fill 与可选 stroke */
export function drawRoundedRect(
  ctx: CanvasCtx,
  rect: UIRect,
  fill: string | CanvasGradient,
  stroke?: string,
  radius = 12
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
  ctx.fillStyle = fill as string;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/** 文字换行 */
export function wrapText(ctx: CanvasCtx, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  for (const char of chars) {
    const testLine = current + char;
    const w = ctx.measureText(testLine).width;
    if (w > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = testLine;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** 小说化分版：识别 \\n\\n 为段落，返回行数组及段落间隔位置（段落后 1.5 倍行距） */
export function wrapTextWithParagraphs(
  ctx: CanvasCtx,
  text: string,
  maxWidth: number
): { lines: string[]; paragraphGapAfterIndex: number[] } {
  if (maxWidth <= 0) return { lines: [text], paragraphGapAfterIndex: [] };
  const paragraphs = text.split(/\n\n+/);
  const lines: string[] = [];
  const paragraphGapAfterIndex: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const seg = paragraphs[i].trim();
    if (seg) {
      const segLines = wrapText(ctx, seg, maxWidth);
      segLines.forEach((l) => lines.push(l));
      if (i < paragraphs.length - 1) paragraphGapAfterIndex.push(lines.length - 1);
    }
  }
  return { lines, paragraphGapAfterIndex };
}
