/**
 * 核心引擎 2.0 数据适配层：将原始 NPCRecord 映射为引擎标准 NPC。
 * 缺失 birth_year 默认 160，缺失 death_year 默认 230；ID 统一为 string。
 */

import type { NPC } from "../types/sanguo";
import type { NPCRecord } from "./sanguoDb/types";

const DEFAULT_BIRTH_YEAR = 160;
const DEFAULT_DEATH_YEAR = 230;

/**
 * 将原始 NPC 记录列表映射为引擎标准 NPC 数组。
 * is_alive、current_age 按 currentYear 计算；后续由 WorldStateManager 每轮更新。
 *
 * @param raw - 原始 NPCRecord 列表（如 npcs184）
 * @param currentYear - 当前世界年份，用于计算是否在世与岁数
 */
export function adaptNpcsFromRaw(raw: NPCRecord[], currentYear: number): NPC[] {
  return raw.map((r) => {
    const birth_year =
      r.birth_year != null && Number.isFinite(r.birth_year) ? r.birth_year : DEFAULT_BIRTH_YEAR;
    const death_year =
      r.death_year != null && Number.isFinite(r.death_year) ? r.death_year : DEFAULT_DEATH_YEAR;
    const current_age = Math.max(0, currentYear - birth_year);
    const is_alive = currentYear <= death_year;
    return {
      id: String(r.id),
      birth_year,
      death_year,
      is_alive,
      current_age
    };
  });
}
