/**
 * 核心引擎 2.0 世界状态管理：每轮根据当前年份更新 NPC 岁数与生死，按月份生成天气标签。
 */

import type { EngineWorldState, NPC, WeatherTag } from "../types/sanguo";
import { getSeasonFromMonth } from "./TimeManager";

/**
 * 根据月份生成天气标签（春雨/夏暑/秋燥/冬雪），供 Prompt 硬约束使用。
 */
export function getWeatherForMonth(month: number): WeatherTag {
  const season = getSeasonFromMonth(month);
  const map: Record<string, WeatherTag> = {
    春: "春雨",
    夏: "夏暑",
    秋: "秋燥",
    冬: "冬雪"
  };
  return map[season] ?? "晴";
}

/**
 * 根据当前年份更新 NPC 的 current_age 与 is_alive，返回新数组（不修改入参）。
 */
export function updateNpcsForYear(npcs: NPC[], currentYear: number): NPC[] {
  return npcs.map((n) => {
    const current_age = Math.max(0, currentYear - n.birth_year);
    const is_alive = currentYear <= n.death_year;
    return { ...n, current_age, is_alive };
  });
}

/**
 * 每轮更新：用 world 的 year 重算 NPC 岁数与生死，用 month 填充 weather；返回新的 world 与 npcs。
 */
export function update(
  world: EngineWorldState,
  npcs: NPC[]
): { world: EngineWorldState; npcs: NPC[] } {
  const weather = getWeatherForMonth(world.month);
  const newWorld: EngineWorldState = { ...world, weather };
  const newNpcs = updateNpcsForYear(npcs, world.year);
  return { world: newWorld, npcs: newNpcs };
}
