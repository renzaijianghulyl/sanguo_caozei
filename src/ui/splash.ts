/**
 * 游戏启动页：古风渐变背景 + 主副标题 + 点击开始呼吸提示
 */
import type { UIRect } from "@ui/layout";
import { colors, fonts, radius } from "@ui/theme";
import { drawRoundedRect, wrapText } from "@ui/primitives";

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface SplashLayout {
  screenWidth: number;
  screenHeight: number;
  safeMargin: number;
  /** 标题区域 */
  titleArea: UIRect;
  /** 副标题区域 */
  subtitleArea: UIRect;
  /** 玩法指南区域 */
  guideArea: UIRect;
  /** 点击开始提示区域（全屏可点） */
  tapHintArea: UIRect;
}

export function createSplashLayout(
  screenWidth: number,
  screenHeight: number,
  safeAreaTop = 0
): SplashLayout {
  const safeMargin = Math.max(16, Math.min(24, Math.round(screenWidth * 0.04)));
  const topInset = Math.max(0, safeAreaTop);

  const titleArea: UIRect = {
    x: safeMargin,
    y: topInset + screenHeight * 0.2,
    width: screenWidth - safeMargin * 2,
    height: 56
  };

  const subtitleArea: UIRect = {
    x: safeMargin,
    y: titleArea.y + titleArea.height + 10,
    width: screenWidth - safeMargin * 2,
    height: 36
  };

  const guideArea: UIRect = {
    x: safeMargin,
    y: subtitleArea.y + subtitleArea.height + 10,
    width: screenWidth - safeMargin * 2,
    height: Math.min(460, Math.round(screenHeight * 0.62))
  };

  const tapHintArea: UIRect = {
    x: 0,
    y: 0,
    width: screenWidth,
    height: screenHeight
  };

  return {
    screenWidth,
    screenHeight,
    safeMargin,
    titleArea,
    subtitleArea,
    guideArea,
    tapHintArea
  };
}

export function renderSplash(ctx: CanvasCtx, layout: SplashLayout): void {
  const { screenWidth, screenHeight } = layout;

  const gradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
  gradient.addColorStop(0, colors.bgStart);
  gradient.addColorStop(0.4, colors.bgMid);
  gradient.addColorStop(0.7, colors.bgEndAlt);
  gradient.addColorStop(1, colors.bgStart);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, screenWidth, screenHeight);

  ctx.textAlign = "center";
  const centerX = screenWidth / 2;

  const titleY = layout.titleArea.y + layout.titleArea.height / 2;
  ctx.font = "bold 36px 'PingFang SC', 'SimHei', sans-serif";

  ctx.shadowColor = colors.titleGlow;
  ctx.shadowBlur = 24;
  ctx.fillStyle = colors.textPrimary;
  ctx.fillText("弈笔草莽", centerX, titleY + 12);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  ctx.fillStyle = colors.textSecondary;
  ctx.font = "16px 'PingFang SC', 'SimHei', sans-serif";
  ctx.fillText("浪花淘尽英雄", centerX, layout.subtitleArea.y + 28);

  const guideLines = [
    "【意图即指令】",
    "这不再是传统的菜单游戏。你可以直接输入任何意图——",
    "无论是「仗剑寻访名士」「与曹操煮酒论英雄」，",
    "还是「闭关潜修十载」。你的文字即是敕令，",
    "系统将为你实时落笔成章。",
    "",
    "【时空自演化】",
    "岁月不居，乱世无常。当你闭关或远征，世界并不会静止。",
    "名将会在岁月中老去，城池会在战火中易主。",
    "历史的巨轮将带着真实的逻辑，随你的每一个抉择而动。",
    "",
    "【结局由你定】",
    "在这里，因果逻辑重于数值加减。",
    "请珍视每一次邂逅，慎重每一份决策。",
    "在这个由你重构的三国，结局没有标准答案，唯有你亲手书写的真理。"
  ];
  const g = layout.guideArea;
  const pad = 18;
  const textMaxWidth = Math.max(0, g.width - pad * 2);
  ctx.save();
  drawRoundedRect(ctx, g, colors.guideCardBg, colors.guideCardBorder, radius.bubble);
  ctx.beginPath();
  ctx.rect(g.x, g.y, g.width, g.height);
  ctx.clip();
  ctx.textAlign = "left";
  ctx.fillStyle = colors.textSecondary;
  ctx.font = `12px ${fonts.family}`;
  const lineHeight = 14;
  const paragraphGap = 12;
  let y = g.y + pad + 2;
  guideLines.forEach((line) => {
    if (line === "") {
      y += paragraphGap;
      return;
    }
    if (line.startsWith("【") && line.endsWith("】")) {
      if (y > g.y + pad + 2) y += 4;
      ctx.fillStyle = colors.accent;
      ctx.font = `bold 13px ${fonts.family}`;
      const headingLines = wrapText(ctx, line, textMaxWidth);
      headingLines.forEach((l) => {
        ctx.fillText(l, g.x + pad, y);
        y += lineHeight;
      });
      y += 2;
      ctx.fillStyle = colors.textSecondary;
      ctx.font = `12px ${fonts.family}`;
      return;
    }
    const wrapped = wrapText(ctx, line, textMaxWidth);
    wrapped.forEach((l) => {
      ctx.fillText(l, g.x + pad, y);
      y += lineHeight;
    });
  });
  ctx.restore();
  ctx.textAlign = "center";

  const hintY = layout.guideArea.y + layout.guideArea.height + 20;
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 900);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = colors.textMuted;
  ctx.font = `13px ${fonts.family}`;
  ctx.fillText("点击屏幕开始游戏", centerX, hintY);
  ctx.globalAlpha = 1;

  ctx.fillStyle = colors.accent;
  ctx.globalAlpha = pulse * 0.8;
  ctx.fillText("▼", centerX, hintY + 22);
  ctx.globalAlpha = 1;
}
