/**
 * 世界感知状态栏（WorldStatusBar）：展示时钟、当前环境（区域+天气）、导演模块感官短语。
 * 数据由 renderer 从 currentSaveData + DirectorModule.getSensoryForWeather 计算后传入。
 */
import type { UIRect } from "@ui/layout";
import { colors, radius } from "@ui/theme";
import { drawRoundedRect, wrapText } from "@ui/primitives";

export type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 天气标签 -> 展示用 emoji，与 DirectorModule.SENSORY_BY_WEATHER 对应 */
export const WEATHER_EMOJI: Record<string, string> = {
  春雨: "🌧",
  夏暑: "☀️",
  秋燥: "🍂",
  冬雪: "❄️",
  晴: "☀️",
  阴: "☁️",
  风: "💨",
  雨: "🌧",
  雪: "❄️"
};

export interface WorldStatusBarData {
  /** 时钟文案，如 "190年 春 (初平元年)" */
  clockText: string;
  /** 当前区域显示名，如 "陈留" */
  regionName: string;
  /** 天气标签，如 "大雪"、"冬雪" */
  weatherLabel: string;
  /** 感官短语一条（来自 DirectorModule 感官词库），如 "炉火噼啪"、"碎雪声" */
  sensoryPhrase: string;
  /** 动态氛围值（紧张度 0～1），高时使用暗红边框/文字 */
  tension?: number;
}

/**
 * 绘制世界感知状态栏：左=时钟，中=环境（区域 | 天气 emoji），右=感官短语。
 * 当 tension 高（≥0.6）时使用暗红边框与次要文字色，强化紧张氛围。
 */
export function drawWorldStatusBar(
  ctx: CanvasCtx,
  rect: UIRect,
  data: WorldStatusBarData
): void {
  const { clockText, regionName, weatherLabel, sensoryPhrase, tension = 0 } = data;
  const emoji = WEATHER_EMOJI[weatherLabel] ?? "·";
  const envText = regionName && weatherLabel ? `${regionName} | ${weatherLabel} ${emoji}` : regionName || weatherLabel || "—";

  const isTense = tension >= 0.6;
  const borderColor = isTense ? "rgba(127, 29, 29, 0.6)" : colors.dialogueBorder;
  const fillColor = isTense ? "rgba(30, 20, 20, 0.95)" : colors.dialogueBg;
  drawRoundedRect(ctx, rect, fillColor, borderColor, radius.small);

  const pad = 10;
  const lineH = 14;
  const y = rect.y + rect.height / 2 - lineH / 2;
  const maxW = rect.width - pad * 2;
  ctx.font = "11px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  const clockColor = isTense ? "rgba(220, 150, 150, 0.95)" : colors.textMuted;
  const envColor = isTense ? "rgba(230, 180, 180, 0.95)" : colors.stats;
  const sensoryColor = isTense ? "rgba(200, 160, 160, 0.9)" : colors.textMuted;

  const clockW = ctx.measureText(clockText).width;
  const envW = ctx.measureText(envText).width;
  const sensoryW = ctx.measureText(sensoryPhrase).width;
  const gap = 12;

  let x = rect.x + pad;
  ctx.fillStyle = clockColor;
  ctx.fillText(clockText, x, y + 11);
  x += clockW + gap;

  ctx.fillStyle = envColor;
  ctx.fillText(envText, x, y + 11);
  x += envW + gap;

  const sensoryMax = maxW - (x - rect.x - pad);
  if (sensoryMax > 20) {
    const showSensory =
      ctx.measureText(sensoryPhrase).width <= sensoryMax
        ? sensoryPhrase
        : sensoryPhrase.slice(0, Math.max(0, Math.floor(sensoryMax / 7))) + "…";
    ctx.fillStyle = sensoryColor;
    ctx.fillText(showSensory, x, y + 11);
  }
}

/**
 * 根据当前时间与感官短语列表，选出一条用于本帧展示（轮换索引，实现“随机滚动”感）。
 * 使用 totalDays 或 Date.now() 的简单哈希，避免每帧换一条过于晃眼。
 */
export function pickSensoryPhraseForDisplay(
  phrases: string[],
  seed?: number
): string {
  if (!phrases.length) return "";
  const idx = Math.abs((seed ?? Date.now() / 8000) | 0) % phrases.length;
  return phrases[idx];
}
