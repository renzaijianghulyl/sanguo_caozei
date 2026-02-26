/**
 * 玩家动作处理入口：在调用 processPlayerAction 前注入行为追踪钩子，
 * 记录玩家输入的指令类型（战斗/社交/移动）及对应轮次，供微信自定义事件统计。
 */
import type { AdjudicationRequest } from "@services/network/adjudication";
import type { GameSaveData } from "@core/state";
import { processPlayerAction } from "./actionProcessor";
import {
  getIntentCategory,
  getDialogueRound,
  reportPlayerAction
} from "@services/analytics/wechatEvents";

/**
 * 处理玩家动作：先上报行为统计（意图类型 + 轮次），再执行逻辑约束。
 */
export function handlePlayerAction(
  payload: AdjudicationRequest,
  saveData: GameSaveData | null
): AdjudicationRequest {
  const round =
    (payload.event_context?.dialogue_rounds as number) ?? getDialogueRound(saveData);
  reportPlayerAction(getIntentCategory(payload.player_intent), round);
  return processPlayerAction(payload);
}

export { processPlayerAction } from "./actionProcessor";
