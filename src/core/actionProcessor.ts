/**
 * 逻辑层步进器：任何玩家输入必须先过「时间解析器」，
 * 根据动作消耗（如行军2月、闭关n年）强制更新 world_state.time。
 */
import type { AdjudicationRequest } from "@services/network/adjudication";
import { applyHardConstraints } from "./preAdjudicator";
import { parseTimeCost } from "./timeParser";

export { parseTimeCost } from "./timeParser";

/**
 * 处理玩家动作：时间解析器先行，强制更新 world_state.time，再执行其余逻辑约束。
 */
export function processPlayerAction(payload: AdjudicationRequest): AdjudicationRequest {
  return applyHardConstraints(payload);
}
