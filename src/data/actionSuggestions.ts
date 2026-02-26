/**
 * 行动引导槽：按场景/地点提取符合当前环境的可选动作建议。
 * 开局阶段（对话轮次较少时）可基于玩家创建的愿望（志向）给出更有引导性的首步建议。
 * 仅提示动作，避免人物/关系类表述；每场景 2 条。
 */
import type { GameSaveData } from "@core/state";
import type { PrimaryGoalType } from "@core/state";

/** 对话轮次：统计「你：」「你说：」条数，用于判断是否处于开局阶段 */
function getDialogueRounds(dialogueHistory: string[]): number {
  if (!dialogueHistory?.length) return 0;
  return dialogueHistory.filter(
    (line) => line.startsWith("你：") || line.startsWith("你说：")
  ).length;
}

/** 开局阶段阈值：玩家发送的意图条数不超过此时，使用志向引导的首步建议 */
const INITIAL_ROUNDS_THRESHOLD = 2;

/**
 * 基于志向的首步建议（开局在颍川村等村庄时）：让第一步就朝愿望靠拢，提升深度游玩意愿。
 * unify=霸业, wealth=商道, fortress=割据, scholar=名士, other=未识别时稍通用但仍带引导。
 */
const INITIAL_ACTIONS_BY_GOAL: Record<PrimaryGoalType | "other", [string, string]> = {
  unify: [
    "打听天下大势与豪杰动向",
    "前往颍川郡城寻找机遇"
  ],
  wealth: [
    "打听附近哪里缺粮缺货",
    "前往县城看看行情"
  ],
  fortress: [
    "打听本地民情与匪患",
    "结交乡里壮丁"
  ],
  scholar: [
    "打听附近可有书院或名士",
    "在村中寻书借阅"
  ],
  other: [
    "打听眼前局势",
    "问问乡里有何活计可做"
  ]
};

/** 场景与 2 个推荐动作（纯动作，不涉及具体人物关系） */
const SCENE_ACTIONS: Record<string, [string, string]> = {
  inn: ["打探情报", "豪饮一番"],
  village: ["打听消息", "帮忙农活"],
  city: ["逛集市", "拜访官府"],
  camp: ["操练士兵", "巡视营地"],
  temple: ["参拜祈福", "打听天象"]
};

/** 部分地区可覆盖场景默认动作 */
const REGION_ACTIONS: Record<string, Record<string, [string, string]>> = {
  luoyang: {
    city: ["打探朝局", "入城闲逛"],
    inn: ["打探京城消息", "豪饮一番"]
  },
  jingzhou: {
    city: ["打听荆襄局势", "逛集市"]
  },
  zhuoxian: {
    village: ["打听黄巾消息", "帮忙农活"]
  }
};

/** 默认动作（未知场景时使用） */
const DEFAULT_ACTIONS: [string, string] = ["前往洛阳", "打听消息"];

/** 行动力不足时的替代动作（低耗能） */
const LOW_STAMINA_ACTIONS: [string, string] = ["休息恢复", "小憩片刻"];

/** 行动力阈值，低于此值展示低耗能动作 */
const STAMINA_THRESHOLD = 25;

export interface GetSuggestedActionsOptions {
  /** 当前存档；传入且在开局阶段（对话轮次≤INITIAL_ROUNDS_THRESHOLD）时，按玩家志向返回首步建议 */
  saveData?: GameSaveData | null;
}

/**
 * 根据玩家当前 region、scene、stamina（行动力）提取 2 个可选动作。
 * 若传入 saveData 且处于开局阶段（玩家发送的意图≤2 条），则按愿望志向返回更有引导性的首步建议。
 * 行动力不足时展示休息类低耗能动作。
 */
export function getSuggestedActions(
  region: string,
  scene: string,
  stamina?: number,
  opts?: GetSuggestedActionsOptions
): [string, string] {
  if (stamina != null && stamina < STAMINA_THRESHOLD) {
    return LOW_STAMINA_ACTIONS;
  }
  const saveData = opts?.saveData;
  if (saveData?.dialogueHistory && saveData?.player) {
    const rounds = getDialogueRounds(saveData.dialogueHistory);
    if (rounds <= INITIAL_ROUNDS_THRESHOLD) {
      const goal: PrimaryGoalType | "other" =
        saveData.player.aspiration?.primary_goal ??
        (saveData.player as { ambition?: PrimaryGoalType }).ambition ??
        "other";
      const initial = INITIAL_ACTIONS_BY_GOAL[goal];
      if (initial) return initial;
    }
  }
  const regionOverrides = REGION_ACTIONS[region];
  if (regionOverrides?.[scene]) {
    return regionOverrides[scene];
  }
  return SCENE_ACTIONS[scene] ?? DEFAULT_ACTIONS;
}
