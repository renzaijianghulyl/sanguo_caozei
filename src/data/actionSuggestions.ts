/**
 * 行动引导槽：按场景/地点提取符合当前环境的可选动作建议。
 * 仅提示动作，避免人物/关系类表述；每场景 2 条。
 */

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

/** 体力不足时的替代动作（低耗能） */
const LOW_STAMINA_ACTIONS: [string, string] = ["休息恢复", "小憩片刻"];

/** 体力阈值，低于此值展示低耗能动作 */
const STAMINA_THRESHOLD = 25;

/**
 * 根据玩家当前 region、scene、stamina 提取 2 个可选动作。
 * 体力不足时展示休息类低耗能动作。
 */
export function getSuggestedActions(
  region: string,
  scene: string,
  stamina?: number
): [string, string] {
  if (stamina != null && stamina < STAMINA_THRESHOLD) {
    return LOW_STAMINA_ACTIONS;
  }
  const regionOverrides = REGION_ACTIONS[region];
  if (regionOverrides?.[scene]) {
    return regionOverrides[scene];
  }
  return SCENE_ACTIONS[scene] ?? DEFAULT_ACTIONS;
}
