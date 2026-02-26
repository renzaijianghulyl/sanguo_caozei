/**
 * 游戏启动页：古风渐变背景 + 主副标题 + 开始游戏按钮与隐私勾选
 */
import type { UIRect } from "@ui/layout";
import { colors, fonts, radius } from "@ui/theme";
import { drawRoundedRect, wrapText } from "@ui/primitives";
import { SPLASH_GUIDE_LINES } from "@config/index";

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 底部「开始游戏」+ 勾选区域占用的垂直高度（按钮+间距+勾选行+留白） */
const START_SECTION_HEIGHT = 94;
const START_BTN_HEIGHT = 44;
const START_BTN_GAP = 16;
const CHECKBOX_SIZE = 22;
const CHECKBOX_ROW_HEIGHT = 30;
const PRIVACY_LINK_PAD = 4;
const PRIVACY_LINK_TEXT = "隐私和数据声明";
const START_BTN_TEXT = "开始游戏";

/** 首页展示的隐私摘要（与 privacyModal 一致，仅展示用） */
const PRIVACY_TITLE = "隐私和数据声明";
const PRIVACY_SUMMARY =
  "我们收集非敏感游戏行为数据用于优化叙事与故障修复，不涉及真实身份、位置或联系方式。点击下方按钮即表示同意。";
const PRIVACY_BTN_TEXT = "同意并开始";
const PRIVACY_BTN_HEIGHT_LEGACY = 44;
const PRIVACY_PANEL_PAD = 16;
const PRIVACY_LINE_HEIGHT = 14;

export interface SplashLayout {
  screenWidth: number;
  screenHeight: number;
  safeMargin: number;
  safeAreaBottom: number;
  titleArea: UIRect;
  subtitleArea: UIRect;
  guideArea: UIRect;
  tapHintArea: UIRect;
  /** 开始游戏按钮 */
  startButtonRect: UIRect;
  /** 勾选框矩形 */
  checkboxRect: UIRect;
  /** 「隐私和数据声明」文字链接矩形 */
  privacyLinkRect: UIRect;
}

export function createSplashLayout(
  screenWidth: number,
  screenHeight: number,
  safeAreaTop = 0,
  safeAreaBottom = 0
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

  const guideY = subtitleArea.y + subtitleArea.height + 10;
  const availableForGuide = screenHeight - guideY - START_SECTION_HEIGHT - safeAreaBottom;
  const guideArea: UIRect = {
    x: safeMargin,
    y: guideY,
    width: screenWidth - safeMargin * 2,
    height: Math.max(280, Math.min(460, Math.round(availableForGuide)))
  };

  const tapHintArea: UIRect = {
    x: 0,
    y: 0,
    width: screenWidth,
    height: screenHeight
  };

  const btnWidth = Math.max(200, Math.min(320, screenWidth - 80));
  const baseY = screenHeight - safeAreaBottom - 24;
  const startButtonRect: UIRect = {
    x: (screenWidth - btnWidth) / 2,
    y: baseY - START_BTN_HEIGHT - START_BTN_GAP - CHECKBOX_ROW_HEIGHT,
    width: btnWidth,
    height: START_BTN_HEIGHT
  };
  const checkboxRowY = baseY - CHECKBOX_ROW_HEIGHT;
  const checkboxRect: UIRect = {
    x: (screenWidth - btnWidth) / 2,
    y: checkboxRowY + (CHECKBOX_ROW_HEIGHT - CHECKBOX_SIZE) / 2,
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE
  };
  const privacyLinkRect: UIRect = {
    x: (screenWidth - btnWidth) / 2 + CHECKBOX_SIZE + PRIVACY_LINK_PAD,
    y: checkboxRowY,
    width: btnWidth - CHECKBOX_SIZE - PRIVACY_LINK_PAD * 2,
    height: CHECKBOX_ROW_HEIGHT
  };

  return {
    screenWidth,
    screenHeight,
    safeMargin,
    safeAreaBottom,
    titleArea,
    subtitleArea,
    guideArea,
    tapHintArea,
    startButtonRect,
    checkboxRect,
    privacyLinkRect
  };
}

export function renderSplash(ctx: CanvasCtx, layout: SplashLayout, checkboxChecked = false): void {
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

  const guideLines = SPLASH_GUIDE_LINES;
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
  const lineHeight = 15;
  const paragraphGap = 14;
  const sectionTitleGap = 8;
  let y = g.y + pad + 2;
  guideLines.forEach((line) => {
    if (line === "") {
      y += paragraphGap;
      return;
    }
    if (line.startsWith("【") && line.endsWith("】")) {
      if (y > g.y + pad + 2) y += sectionTitleGap;
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

  renderSplashStartSection(ctx, layout, checkboxChecked);
}

/** 绘制「开始游戏」按钮与勾选区域（checkbox + 隐私链接文案）。checkboxChecked 由外部传入以便点击切换。 */
export function renderSplashStartSection(
  ctx: CanvasCtx,
  layout: SplashLayout,
  checkboxChecked: boolean
): void {
  const { startButtonRect, checkboxRect, privacyLinkRect } = layout;

  drawRoundedRect(
    ctx,
    startButtonRect,
    colors.accent,
    colors.accentChipBorder,
    radius.button
  );
  ctx.fillStyle = colors.textPrimary;
  ctx.font = `15px ${fonts.family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    START_BTN_TEXT,
    startButtonRect.x + startButtonRect.width / 2,
    startButtonRect.y + startButtonRect.height / 2 + 2
  );

  drawRoundedRect(
    ctx,
    checkboxRect,
    checkboxChecked ? colors.accent : colors.guideCardBg,
    checkboxChecked ? colors.accent : colors.guideCardBorder,
    radius.small
  );
  if (checkboxChecked) {
    ctx.strokeStyle = colors.textPrimary;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const cx = checkboxRect.x + checkboxRect.width / 2;
    const cy = checkboxRect.y + checkboxRect.height / 2;
    const s = 5;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.8);
    ctx.lineTo(cx + s, cy - s * 0.6);
    ctx.stroke();
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.accent;
  ctx.font = `13px ${fonts.family}`;
  const linkY = privacyLinkRect.y + privacyLinkRect.height / 2;
  ctx.fillText(
    PRIVACY_LINK_TEXT,
    privacyLinkRect.x,
    linkY
  );
  const linkW = ctx.measureText(PRIVACY_LINK_TEXT).width;
  ctx.strokeStyle = colors.accent;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(privacyLinkRect.x, linkY + 7);
  ctx.lineTo(privacyLinkRect.x + linkW, linkY + 7);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
}

/** 当首页展示隐私区块时，「同意并开始」按钮的矩形（供 gameApp 触摸检测） */
export function getSplashPrivacyAgreeButtonRect(
  screenWidth: number,
  screenHeight: number,
  safeAreaBottom: number
): UIRect {
  const btnWidth = Math.max(160, screenWidth - 80);
  const btnY = screenHeight - safeAreaBottom - PRIVACY_BTN_HEIGHT_LEGACY - PRIVACY_PANEL_PAD - 20;
  return {
    x: (screenWidth - btnWidth) / 2,
    y: btnY,
    width: btnWidth,
    height: PRIVACY_BTN_HEIGHT_LEGACY
  };
}

/**
 * 在首页底部绘制隐私说明区块 + 「同意并开始」按钮（与主内容同屏，加载即见）。
 */
export function renderSplashPrivacySection(
  ctx: CanvasCtx,
  layout: SplashLayout
): void {
  const { screenWidth, screenHeight, safeMargin, safeAreaBottom } = layout;
  const panelWidth = screenWidth - safeMargin * 2;
  const maxTextW = panelWidth - PRIVACY_PANEL_PAD * 2;
  const panelY = screenHeight - safeAreaBottom - 20 - PRIVACY_BTN_HEIGHT_LEGACY - PRIVACY_PANEL_PAD - 60;
  const panelH = 60 + PRIVACY_BTN_HEIGHT_LEGACY + PRIVACY_PANEL_PAD;
  const panel: UIRect = { x: safeMargin, y: panelY, width: panelWidth, height: panelH };
  drawRoundedRect(ctx, panel, colors.panel, colors.panelBorder, radius.panel);
  ctx.save();
  ctx.beginPath();
  ctx.rect(panel.x, panel.y, panel.width, panel.height);
  ctx.clip();
  let y = panel.y + PRIVACY_PANEL_PAD;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = `bold 14px ${fonts.family}`;
  ctx.textAlign = "left";
  ctx.fillText(PRIVACY_TITLE, panel.x + PRIVACY_PANEL_PAD, y + 12);
  y += 20;
  ctx.font = `12px ${fonts.family}`;
  ctx.fillStyle = colors.textSecondary;
  const lines = wrapText(ctx, PRIVACY_SUMMARY, maxTextW);
  lines.slice(0, 2).forEach((line) => {
    ctx.fillText(line, panel.x + PRIVACY_PANEL_PAD, y + 10);
    y += PRIVACY_LINE_HEIGHT;
  });
  const btnRect = getSplashPrivacyAgreeButtonRect(screenWidth, screenHeight, safeAreaBottom);
  drawRoundedRect(ctx, btnRect, colors.accent, colors.accentChipBorder, radius.button);
  ctx.fillStyle = colors.textPrimary;
  ctx.font = `15px ${fonts.family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(PRIVACY_BTN_TEXT, btnRect.x + btnRect.width / 2, btnRect.y + btnRect.height / 2 + 2);
  ctx.restore();
}
