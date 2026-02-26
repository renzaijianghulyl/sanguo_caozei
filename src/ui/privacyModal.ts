/**
 * 隐私声明弹窗：Loading 结束后首次展示，同意后持久化不再弹出。
 */
import type { UIRect } from "@ui/layout";
import { colors, radius, fonts } from "@ui/theme";
import { drawRoundedRect, wrapText } from "@ui/primitives";

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 弹窗底层静态背景（与 splash 风格一致，无动画） */
export function drawPrivacyBackground(ctx: CanvasCtx, screenWidth: number, screenHeight: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
  gradient.addColorStop(0, colors.bgStart);
  gradient.addColorStop(0.4, colors.bgMid);
  gradient.addColorStop(0.7, colors.bgEndAlt);
  gradient.addColorStop(1, colors.bgStart);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, screenWidth, screenHeight);
}

/** 弹窗正文段落（与产品文案一致） */
const PRIVACY_PARAGRAPHS = [
  "本游戏收集的数据主要用于提升玩家的交互体验：",
  "行为日志：我们通过记录玩家的非敏感游戏操作（如：战斗选择、对话分支），来调优 AI 的叙事质量，防止文案重复并确保逻辑自洽。",
  "故障监测：当游戏发生逻辑冲突或报错时，我们会收集异常上下文，以便快速修复 Bug。",
  "游戏平衡：收集玩家的生存状态（如气血、饥饿值）与死亡频次，以动态调整游戏难度。",
  "我们承诺：所有采集数据仅用于游戏内部逻辑优化，不涉及任何真实身份、地理位置或联系方式等个人敏感信息。"
];

const TITLE = "隐私和数据声明";
const BTN_TEXT = "同意并开始";
const CLOSE_BTN_TEXT = "关闭";
const BTN_HEIGHT = 44;
const BTN_MIN_WIDTH = 160;
const PANEL_PAD = 20;
const LINE_HEIGHT = 16;
const TITLE_LINE_HEIGHT = 20;

/**
 * 绘制隐私声明弹窗：遮罩 + 面板 + 标题 + 正文 + 「同意并开始」按钮
 */
export function drawPrivacyModal(
  ctx: CanvasCtx,
  screenWidth: number,
  screenHeight: number
): void {
  const panelMargin = Math.max(24, Math.round(screenWidth * 0.08));
  const panelWidth = screenWidth - panelMargin * 2;
  const maxTextWidth = panelWidth - PANEL_PAD * 2;

  ctx.save();
  ctx.font = `13px ${fonts.family}`;
  let contentH = PANEL_PAD + TITLE_LINE_HEIGHT + 12;
  const wrapped: string[][] = [];
  for (const para of PRIVACY_PARAGRAPHS) {
    const lines = wrapText(ctx, para, maxTextWidth);
    wrapped.push(lines);
    contentH += lines.length * LINE_HEIGHT + 8;
  }
  contentH += LINE_HEIGHT + PANEL_PAD + BTN_HEIGHT + PANEL_PAD;
  const panelHeight = Math.min(contentH, screenHeight - 60);
  const panelX = panelMargin;
  const panelY = (screenHeight - panelHeight) / 2;
  const panel: UIRect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, screenWidth, screenHeight);
  drawRoundedRect(ctx, panel, colors.panel, colors.panelBorder, radius.panel);

  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, panelY, panelWidth, panelHeight);
  ctx.clip();

  let y = panelY + PANEL_PAD;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = `bold 16px ${fonts.family}`;
  ctx.textAlign = "left";
  ctx.fillText(TITLE, panelX + PANEL_PAD, y + 14);
  y += TITLE_LINE_HEIGHT + 12;

  ctx.font = `13px ${fonts.family}`;
  ctx.fillStyle = colors.textSecondary;
  for (const lines of wrapped) {
    for (const line of lines) {
      ctx.fillText(line, panelX + PANEL_PAD, y + 12);
      y += LINE_HEIGHT;
    }
    y += 8;
  }

  const btnY = panelY + panelHeight - PANEL_PAD - BTN_HEIGHT;
  const btnWidth = Math.max(BTN_MIN_WIDTH, panelWidth - PANEL_PAD * 2);
  const btnX = panelX + (panelWidth - btnWidth) / 2;
  const btnRect: UIRect = { x: btnX, y: btnY, width: btnWidth, height: BTN_HEIGHT };
  drawRoundedRect(ctx, btnRect, colors.accent, colors.accentChipBorder, radius.button);
  ctx.fillStyle = colors.textPrimary;
  ctx.font = `15px ${fonts.family}`;
  ctx.textAlign = "center";
  ctx.fillText(BTN_TEXT, btnX + btnWidth / 2, btnY + BTN_HEIGHT / 2 + 5);

  ctx.restore();
  ctx.restore();
}

/**
 * 仅查看用隐私弹窗：遮罩 + 面板 + 标题 + 正文 + 「关闭」按钮（从首页链接打开）
 */
export function drawPrivacyViewModal(
  ctx: CanvasCtx,
  screenWidth: number,
  screenHeight: number
): void {
  const panelMargin = Math.max(24, Math.round(screenWidth * 0.08));
  const panelWidth = screenWidth - panelMargin * 2;
  const maxTextWidth = panelWidth - PANEL_PAD * 2;

  ctx.save();
  ctx.font = `13px ${fonts.family}`;
  let contentH = PANEL_PAD + TITLE_LINE_HEIGHT + 12;
  const wrapped: string[][] = [];
  for (const para of PRIVACY_PARAGRAPHS) {
    const lines = wrapText(ctx, para, maxTextWidth);
    wrapped.push(lines);
    contentH += lines.length * LINE_HEIGHT + 8;
  }
  contentH += LINE_HEIGHT + PANEL_PAD + BTN_HEIGHT + PANEL_PAD;
  const panelHeight = Math.min(contentH, screenHeight - 60);
  const panelX = panelMargin;
  const panelY = (screenHeight - panelHeight) / 2;
  const panel: UIRect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, screenWidth, screenHeight);
  drawRoundedRect(ctx, panel, colors.panel, colors.panelBorder, radius.panel);

  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, panelY, panelWidth, panelHeight);
  ctx.clip();

  let y = panelY + PANEL_PAD;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = `bold 16px ${fonts.family}`;
  ctx.textAlign = "left";
  ctx.fillText(TITLE, panelX + PANEL_PAD, y + 14);
  y += TITLE_LINE_HEIGHT + 12;

  ctx.font = `13px ${fonts.family}`;
  ctx.fillStyle = colors.textSecondary;
  for (const lines of wrapped) {
    for (const line of lines) {
      ctx.fillText(line, panelX + PANEL_PAD, y + 12);
      y += LINE_HEIGHT;
    }
    y += 8;
  }

  const btnY = panelY + panelHeight - PANEL_PAD - BTN_HEIGHT;
  const btnWidth = Math.max(BTN_MIN_WIDTH, panelWidth - PANEL_PAD * 2);
  const btnX = panelX + (panelWidth - btnWidth) / 2;
  const btnRect: UIRect = { x: btnX, y: btnY, width: btnWidth, height: BTN_HEIGHT };
  drawRoundedRect(ctx, btnRect, colors.accent, colors.accentChipBorder, radius.button);
  ctx.fillStyle = colors.textPrimary;
  ctx.font = `15px ${fonts.family}`;
  ctx.textAlign = "center";
  ctx.fillText(CLOSE_BTN_TEXT, btnX + btnWidth / 2, btnY + BTN_HEIGHT / 2 + 5);

  ctx.restore();
  ctx.restore();
}

/**
 * 「查看用隐私弹窗」的「关闭」按钮矩形，供 gameApp 触摸检测
 */
export function getPrivacyViewModalCloseButtonRect(screenWidth: number, screenHeight: number): UIRect {
  const panelMargin = Math.max(24, Math.round(screenWidth * 0.08));
  const panelWidth = screenWidth - panelMargin * 2;
  const panelHeight = Math.min(420, screenHeight - 60);
  const panelY = (screenHeight - panelHeight) / 2;
  const btnWidth = Math.max(BTN_MIN_WIDTH, panelWidth - PANEL_PAD * 2);
  const btnX = (screenWidth - btnWidth) / 2;
  const btnY = panelY + panelHeight - PANEL_PAD - BTN_HEIGHT;
  return { x: btnX, y: btnY, width: btnWidth, height: BTN_HEIGHT };
}
