import type { GameSaveData, PlayerAttributes } from "@core/state";
import type { UILayout } from "@ui/layout";

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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
}

export function renderScreen(state: RenderState): void {
  const { ctx, screenWidth, screenHeight } = state;
  ctx.clearRect(0, 0, screenWidth, screenHeight);
  drawAttributePanel(state);
  drawDialogueArea(state);
  drawInputArea(state);
  if (state.isSaveLoadPanelVisible) {
    drawSaveLoadPanel(state);
  }
}

function drawAttributePanel({ ctx, layout, playerAttributes, currentSaveData }: RenderState) {
  const area = layout.attributePanel;
  ctx.fillStyle = "#2C3E50";
  ctx.fillRect(area.x, area.y, area.width, area.height);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("玩家属性", area.width / 2, area.y + 25);

  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  const attrLines = [
    `武力: ${playerAttributes.strength}`,
    `智力: ${playerAttributes.intelligence}`,
    `魅力: ${playerAttributes.charm}`,
    `运气: ${playerAttributes.luck}`,
    `传奇度: ${playerAttributes.legend}`
  ];

  const startY = area.y + 50;
  attrLines.forEach((line, index) => {
    ctx.fillStyle = "#ECF0F1";
    ctx.fillText(line, 20, startY + index * 20);
  });

  const statusLabel = currentSaveData ? "已存档" : "新游戏";
  ctx.fillStyle = currentSaveData ? "#27AE60" : "#E74C3C";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`状态: ${statusLabel}`, area.width - 20, area.y + 25);

  ctx.fillStyle = "#3498DB";
  ctx.fillRect(area.width - 50, area.y + 10, 40, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("存档", area.width - 30, area.y + 25);
}

function drawDialogueArea({ ctx, layout, dialogueHistory }: RenderState) {
  const area = layout.dialogueArea;
  ctx.fillStyle = "#34495E";
  ctx.fillRect(area.x, area.y, area.width, area.height);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "left";

  const margin = 20;
  let cursorY = area.y + margin;
  const maxWidth = area.width - margin * 2;

  dialogueHistory.forEach((line) => {
    cursorY = drawWrappedText(ctx, line, margin, cursorY, maxWidth);
    cursorY += 12;
    if (cursorY > area.y + area.height - margin) {
      ctx.fillStyle = "#E74C3C";
      ctx.fillText("（更多内容...）", margin, area.y + area.height - margin);
      return;
    }
  });
}

function drawInputArea({ ctx, layout, currentInput, currentSaveData, keyboardActive }: RenderState) {
  const area = layout.inputArea;
  ctx.fillStyle = "#2C3E50";
  ctx.fillRect(area.x, area.y, area.width, area.height);

  const inputY = area.y + 20;
  ctx.fillStyle = "#ECF0F1";
  ctx.fillRect(20, inputY, area.width - 100, 40);
  ctx.fillStyle = "#2C3E50";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "left";
  const placeholder = keyboardActive ? "输入中..." : "点击此处输入你的意图...";
  ctx.fillText(currentInput || placeholder, 25, inputY + 25);

  ctx.fillStyle = "#27AE60";
  ctx.fillRect(area.width - 70, inputY, 60, 40);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("发送", area.width - 40, inputY + 25);

  if (currentSaveData) {
    ctx.fillStyle = "#27AE60";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("自动保存已启用", 20, area.y + 10);
  }
}

function drawSaveLoadPanel({ ctx, layout, currentSaveData }: RenderState) {
  const area = layout.saveLoadPanel;
  ctx.fillStyle = "rgba(44, 62, 80, 0.95)";
  ctx.fillRect(area.x, area.y, area.width, area.height);
  ctx.strokeStyle = "#3498DB";
  ctx.lineWidth = 2;
  ctx.strokeRect(area.x, area.y, area.width, area.height);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("存档管理", area.width / 2, area.y + 25);

  ctx.fillStyle = "#27AE60";
  ctx.fillRect(0.1 * area.width, area.y + 35, 0.35 * area.width, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("保存游戏", 0.275 * area.width, area.y + 50);

  ctx.fillStyle = "#3498DB";
  ctx.fillRect(0.55 * area.width, area.y + 35, 0.35 * area.width, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("关闭面板", 0.725 * area.width, area.y + 50);

  if (currentSaveData) {
    const meta = currentSaveData.meta;
    ctx.fillStyle = "#ECF0F1";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    const infoLines = [
      `存档: ${meta.saveName}`,
      `玩家: ${meta.playerId.substring(0, 8)}...`,
      `时间: ${new Date(meta.lastSaved).toLocaleString()}`
    ];
    infoLines.forEach((line, index) => {
      ctx.fillText(line, 20, area.y + 80 + 15 * index);
    });
  } else {
    ctx.fillStyle = "#E74C3C";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("无存档数据，请先保存游戏", 20, area.y + 80);
  }
}

function drawWrappedText(
  ctx: CanvasCtx,
  text: string,
  x: number,
  startY: number,
  maxWidth: number
): number {
  const words = Array.from(text);
  let line = "";
  let cursorY = startY;

  words.forEach((char) => {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, cursorY);
      line = char;
      cursorY += 24;
    } else {
      line = testLine;
    }
  });

  if (line) {
    ctx.fillText(line, x, cursorY);
    cursorY += 24;
  }

  return cursorY;
}
