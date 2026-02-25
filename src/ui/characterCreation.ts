/**
 * 角色创建页面：姓名、性别、初始属性分配
 */
import type { UIRect } from "@ui/layout";
import type { PlayerAttributes } from "@core/state";
import { ATTR_BASE, ATTR_BONUS_POINTS } from "@config/index";
import { colors, radius } from "@ui/theme";
import { drawRoundedRect } from "@ui/primitives";

type CanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CharacterCreationForm {
  name: string;
  gender: "male" | "female";
  /** 四维各分配的点数（武力、智力、魅力、运气），和为 ATTR_BONUS_POINTS */
  attrBonus: PlayerAttributes;
}

/** 默认角色名：三国时期常见的复姓 + 单名，便于开局直接开玩 */
export const DEFAULT_CREATION_FORM: CharacterCreationForm = {
  name: "夏侯平",
  gender: "male",
  attrBonus: { strength: 0, intelligence: 0, charm: 0, luck: 0 }
};

const ATTR_KEYS: (keyof PlayerAttributes)[] = ["strength", "intelligence", "charm", "luck"];
const ATTR_LABELS: Record<keyof PlayerAttributes, string> = {
  strength: "武力",
  intelligence: "智力",
  charm: "魅力",
  luck: "运气"
};

export interface CharacterCreationLayout {
  screenWidth: number;
  screenHeight: number;
  safeMargin: number;
  titleArea: UIRect;
  nameArea: UIRect;
  genderArea: UIRect;
  attrArea: UIRect;
  startButton: UIRect;
  /** 每行属性项 */
  attrRows: Array<{
    label: UIRect;
    value: UIRect;
    minusBtn: UIRect;
    plusBtn: UIRect;
    helpIcon: UIRect;
  }>;
}

/** 属性说明文案，点击 ? 时展示 */
export const ATTR_EXPLANATIONS: Record<keyof PlayerAttributes, string> = {
  strength: "武力：影响战斗、单挑、征伐等行为的成功概率，武力越高越容易战胜强敌。",
  intelligence: "智力：影响谋略、游说、调查等行为的成功率，智力越高越能运筹帷幄。",
  charm: "魅力：影响结盟、招募、说服等社交行为，魅力高者更易获得他人信任。",
  luck: "运气：影响随机事件的走向与机遇，运气好者常能逢凶化吉。"
};

/** 卡片内边距统一，保证各区块左右对齐 */
const CARD_PAD = 14;
/** 区块之间的垂直间距（标题/姓名/性别/属性/按钮之间） */
const SECTION_GAP = 22;

export function createCharacterCreationLayout(
  screenWidth: number,
  screenHeight: number,
  safeAreaTop = 0
): CharacterCreationLayout {
  const safeMargin = Math.max(16, Math.min(24, Math.round(screenWidth * 0.04)));
  const contentWidth = screenWidth - safeMargin * 2;
  const topInset = Math.max(0, safeAreaTop);

  const titleArea: UIRect = {
    x: safeMargin,
    y: safeMargin + topInset,
    width: contentWidth,
    height: 52
  };

  const nameArea: UIRect = {
    x: safeMargin,
    y: titleArea.y + titleArea.height + SECTION_GAP,
    width: contentWidth,
    height: 50
  };

  const genderArea: UIRect = {
    x: safeMargin,
    y: nameArea.y + nameArea.height + SECTION_GAP,
    width: contentWidth,
    height: 50
  };

  const pointsLabelHeight = 28;
  const pointsToRowsGap = 14;
  const attrRowHeight = 44;
  const attrGap = 14;
  const attrAreaHeight = pointsLabelHeight + pointsToRowsGap + attrRowHeight * 4 + attrGap * 3;
  const attrArea: UIRect = {
    x: safeMargin,
    y: genderArea.y + genderArea.height + SECTION_GAP,
    width: contentWidth,
    height: attrAreaHeight
  };

  const btnHeight = 52;
  const startButtonBottomMargin = 48;
  const startButton: UIRect = {
    x: safeMargin,
    y: screenHeight - safeMargin - btnHeight - startButtonBottomMargin,
    width: contentWidth,
    height: btnHeight
  };

  const attrRowsStartY = attrArea.y + pointsLabelHeight + pointsToRowsGap;
  const btnSize = 36;
  const valueZoneW = 54;
  const gapPlusMinus = 16;
  const gapValueMinus = 12;
  const rightBlockW = CARD_PAD + btnSize + gapPlusMinus + btnSize + gapValueMinus + valueZoneW;
  const valueZoneX = attrArea.x + contentWidth - rightBlockW;

  const attrRows: CharacterCreationLayout["attrRows"] = ATTR_KEYS.map((_, i) => {
    const rowY = attrRowsStartY + i * (attrRowHeight + attrGap);
    const labelW = 50;
    const helpSize = 18;
    const minusX = attrArea.x + contentWidth - CARD_PAD - btnSize - gapPlusMinus - btnSize - gapValueMinus - valueZoneW;
    const plusX = attrArea.x + contentWidth - CARD_PAD - btnSize;
    return {
      label: { x: attrArea.x + CARD_PAD, y: rowY, width: labelW, height: attrRowHeight },
      value: { x: valueZoneX, y: rowY, width: valueZoneW, height: attrRowHeight },
      minusBtn: {
        x: minusX + valueZoneW + gapValueMinus,
        y: rowY + (attrRowHeight - btnSize) / 2,
        width: btnSize,
        height: btnSize
      },
      plusBtn: {
        x: plusX,
        y: rowY + (attrRowHeight - btnSize) / 2,
        width: btnSize,
        height: btnSize
      },
      helpIcon: {
        x: attrArea.x + CARD_PAD + labelW + 4,
        y: rowY + (attrRowHeight - helpSize) / 2,
        width: helpSize,
        height: helpSize
      }
    };
  });

  return {
    screenWidth,
    screenHeight,
    safeMargin,
    titleArea,
    nameArea,
    genderArea,
    attrArea,
    startButton,
    attrRows
  };
}


function drawHelpIcon(ctx: CanvasCtx, rect: UIRect): void {
  ctx.save();
  ctx.strokeStyle = colors.textMuted;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = colors.textMuted;
  ctx.font = "bold 11px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
  ctx.restore();
}

export function renderCharacterCreation(
  ctx: CanvasCtx,
  layout: CharacterCreationLayout,
  form: CharacterCreationForm
): void {
  const { screenWidth, screenHeight } = layout;

  const gradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
  gradient.addColorStop(0, colors.bgStart);
  gradient.addColorStop(0.5, "#0f172a");
  gradient.addColorStop(1, colors.bgEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, screenWidth, screenHeight);

  ctx.fillStyle = colors.textPrimary;
  ctx.font = "bold 20px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("创建角色", layout.titleArea.x + layout.titleArea.width / 2, layout.titleArea.y + 24);

  ctx.fillStyle = colors.textMuted;
  ctx.font = "12px 'PingFang SC', sans-serif";
  ctx.fillText(
    "输入姓名并分配属性点数",
    layout.titleArea.x + layout.titleArea.width / 2,
    layout.titleArea.y + 44
  );

  drawRoundedRect(ctx, layout.nameArea, colors.panel, colors.panelBorder, radius.card);
  ctx.fillStyle = form.name ? colors.textPrimary : colors.textMuted;
  ctx.font = "15px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(form.name || "请输入角色姓名", layout.nameArea.x + CARD_PAD + 2, layout.nameArea.y + layout.nameArea.height / 2);

  drawRoundedRect(ctx, layout.genderArea, colors.panel, colors.panelBorder, radius.card);
  const genderGap = 14;
  const genderVerticalPad = 10;
  const maleW = (layout.genderArea.width - CARD_PAD * 2 - genderGap) / 2;
  const maleBtn = {
    x: layout.genderArea.x + CARD_PAD,
    y: layout.genderArea.y + genderVerticalPad,
    width: maleW,
    height: layout.genderArea.height - genderVerticalPad * 2
  };
  const femaleBtn = {
    x: layout.genderArea.x + CARD_PAD + maleW + genderGap,
    y: layout.genderArea.y + genderVerticalPad,
    width: maleW,
    height: layout.genderArea.height - genderVerticalPad * 2
  };
  drawRoundedRect(
    ctx,
    maleBtn,
    form.gender === "male" ? colors.accentSoft : colors.inputBg,
    form.gender === "male" ? colors.accent : colors.panelBorder,
    radius.button
  );
  drawRoundedRect(
    ctx,
    femaleBtn,
    form.gender === "female" ? colors.accentSoft : colors.inputBg,
    form.gender === "female" ? colors.accent : colors.panelBorder,
    radius.button
  );
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "14px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("男", maleBtn.x + maleBtn.width / 2, maleBtn.y + maleBtn.height / 2);
  ctx.fillText("女", femaleBtn.x + femaleBtn.width / 2, femaleBtn.y + femaleBtn.height / 2);

  const totalBonus = ATTR_KEYS.reduce((s, k) => s + (form.attrBonus[k] ?? 0), 0);
  const remaining = ATTR_BONUS_POINTS - totalBonus;

  drawRoundedRect(ctx, layout.attrArea, colors.panel, colors.panelBorder, radius.card);
  ctx.fillStyle = remaining === 0 ? colors.success : colors.textSecondary;
  ctx.font = "13px 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `可分配点数：${remaining} / ${ATTR_BONUS_POINTS}`,
    layout.attrArea.x + CARD_PAD,
    layout.attrArea.y + 16
  );

  const rowCenterY = (row: { label: UIRect }) => row.label.y + row.label.height / 2;

  ATTR_KEYS.forEach((key, i) => {
    const row = layout.attrRows[i];
    const bonus = form.attrBonus[key] ?? 0;
    const total = ATTR_BASE + bonus;
    const centerY = rowCenterY(row);

    ctx.fillStyle = colors.textPrimary;
    ctx.font = "14px 'PingFang SC', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(ATTR_LABELS[key], row.label.x, centerY);

    drawHelpIcon(ctx, row.helpIcon);

    ctx.textAlign = "right";
    ctx.fillStyle = colors.accent;
    ctx.font = "bold 15px 'PingFang SC', sans-serif";
    ctx.fillText(String(total), row.value.x + row.value.width - 6, centerY);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.textPrimary;
    drawRoundedRect(ctx, row.minusBtn, colors.inputBg, colors.panelBorder, radius.button);
    drawRoundedRect(ctx, row.plusBtn, colors.inputBg, colors.panelBorder, radius.button);
    ctx.font = "bold 18px 'PingFang SC', sans-serif";
    ctx.fillText("-", row.minusBtn.x + row.minusBtn.width / 2, row.minusBtn.y + row.minusBtn.height / 2);
    ctx.fillText("+", row.plusBtn.x + row.plusBtn.width / 2, row.plusBtn.y + row.plusBtn.height / 2);
  });

  const canStart =
    form.name.trim().length > 0 && remaining === 0;
  if (canStart) {
    const btnGradient = ctx.createLinearGradient(
      layout.startButton.x,
      layout.startButton.y,
      layout.startButton.x + layout.startButton.width,
      layout.startButton.y + layout.startButton.height
    );
    btnGradient.addColorStop(0, colors.accent);
    btnGradient.addColorStop(1, colors.sendBtnGradientEnd);
    drawRoundedRect(ctx, layout.startButton, btnGradient, undefined, radius.card);
  } else {
    drawRoundedRect(
      ctx,
      layout.startButton,
      "rgba(30, 41, 59, 0.95)",
      "rgba(71, 85, 105, 0.5)",
      radius.card
    );
  }
  ctx.fillStyle = canStart ? colors.bgMid : colors.textMuted;
  ctx.font = "bold 17px 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    canStart ? "开始游戏" : "请完成角色创建",
    layout.startButton.x + layout.startButton.width / 2,
    layout.startButton.y + layout.startButton.height / 2
  );
}

export function getCreationTouchTargets(layout: CharacterCreationLayout) {
  const genderGap = 14;
  const genderVerticalPad = 10;
  const maleW = (layout.genderArea.width - CARD_PAD * 2 - genderGap) / 2;
  const maleBtn = {
    x: layout.genderArea.x + CARD_PAD,
    y: layout.genderArea.y + genderVerticalPad,
    width: maleW,
    height: layout.genderArea.height - genderVerticalPad * 2
  };
  const femaleBtn = {
    x: layout.genderArea.x + CARD_PAD + maleW + genderGap,
    y: layout.genderArea.y + genderVerticalPad,
    width: maleW,
    height: layout.genderArea.height - genderVerticalPad * 2
  };
  return {
    nameArea: layout.nameArea,
    maleButton: maleBtn,
    femaleButton: femaleBtn,
    attrRows: layout.attrRows.map((row, i) => ({
      minus: row.minusBtn,
      plus: row.plusBtn,
      helpIcon: row.helpIcon,
      key: ATTR_KEYS[i]
    })),
    startButton: layout.startButton
  };
}
