/**
 * UI 主题：统一 colors、fonts、radius、组件尺寸
 * renderer、splash、characterCreation 均从此导入
 */

/** 主色板 */
export const colors = {
  bgStart: "#0a0f1a",
  bgMid: "#0f172a",
  bgEnd: "#1e293b",
  bgEndAlt: "#1a2332",
  panel: "rgba(20, 30, 48, 0.95)",
  panelBorder: "rgba(148, 163, 184, 0.12)",
  dialogueBg: "rgba(12, 18, 32, 0.9)",
  dialogueBorder: "rgba(148, 163, 184, 0.08)",
  bubbleSystem: "rgba(255, 255, 255, 0.05)",
  bubbleSystemBorder: "rgba(255, 255, 255, 0.06)",
  bubblePlayer: "rgba(56, 189, 248, 0.18)",
  bubblePlayerBorder: "rgba(56, 189, 248, 0.55)",
  textPrimary: "#f8fafc",
  textSecondary: "#b8c5d6",
  textMuted: "#64748b",
  /** 状态栏中行动力、健康度、金钱、粮草等数值信息，与正文区分 */
  stats: "#b8a88a",
  accent: "#38bdf8",
  accentSoft: "rgba(56, 189, 248, 0.2)",
  accentChip: "rgba(56, 189, 248, 0.12)",
  accentChipBorder: "rgba(56, 189, 248, 0.35)",
  success: "#4ade80",
  warn: "#fb7185",
  inputBg: "rgba(15, 23, 42, 0.9)",
  chipDisabled: "rgba(30, 41, 59, 0.8)",
  sendBtnGradientEnd: "#2563eb",
  titleGlow: "rgba(56, 189, 248, 0.15)",
  guideCardBg: "rgba(15, 23, 42, 0.6)",
  guideCardBorder: "rgba(148, 163, 184, 0.15)"
} as const;

/** 字号与字族 */
export const fonts = {
  family: "'PingFang SC', 'SimHei', sans-serif",
  title: "bold 36px",
  subtitle: "16px",
  body: "15px",
  bodySmall: "13px",
  caption: "12px",
  hint: "11px",
  tiny: "10px"
} as const;

/** 圆角 */
export const radius = {
  panel: 16,
  bubble: 12,
  button: 10,
  input: 12,
  chip: 10,
  card: 14,
  small: 10
} as const;

/** 组件尺寸（与 layout / hit 检测一致） */
export const sizes = {
  restartBtnWidth: 88,
  restartBtnHeight: 36,
  restartBtnPad: 10,
  attrHelpIconSize: 22,
  sendBtnWidth: 48,
  actionChipGap: 8,
  bubblePadding: 16,
  bubbleLineHeight: 24
} as const;
