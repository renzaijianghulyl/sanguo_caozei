import type { TimelineEventRecord } from "./types";

import t184 from "./raw/184_189_timeline.json";
import t190 from "./raw/190_192_timeline.json";
import t193 from "./raw/193_196_timeline.json";
import t197 from "./raw/197_207_timeline.json";
import t208 from "./raw/208_210_timeline.json";
import t219 from "./raw/219_222_timeline.json";
import t222 from "./raw/222_229_timeline.json";
import t229 from "./raw/229_234_timeline.json";
import t249 from "./raw/249_263_timeline.json";
import t263 from "./raw/263_265_timeline.json";
import t265 from "./raw/265_280_timeline.json";
import t280 from "./raw/280_final_timeline.json";

const allEvents = [
  ...(t184 as TimelineEventRecord[]),
  ...(t190 as TimelineEventRecord[]),
  ...(t193 as TimelineEventRecord[]),
  ...(t197 as TimelineEventRecord[]),
  ...(t208 as TimelineEventRecord[]),
  ...(t219 as TimelineEventRecord[]),
  ...(t222 as TimelineEventRecord[]),
  ...(t229 as TimelineEventRecord[]),
  ...(t249 as TimelineEventRecord[]),
  ...(t263 as TimelineEventRecord[]),
  ...(t265 as TimelineEventRecord[]),
  ...(t280 as TimelineEventRecord[])
];

allEvents.sort((a, b) => a.year - b.year || a.month - b.month);

export interface TimelineEvent {
  year: number;
  label: string;
}

/** 带详情的时序事件，供 LLM 叙事参考 */
export interface TimelineEventWithDetails {
  year: number;
  label: string;
  summary?: string;
  narrative_hooks?: string[];
}

export const TIME_YEAR_MIN = 168;
export const TIME_YEAR_MAX = 280;

/**
 * 获取在 [fromYear, toYear] 区间内发生的所有时间线事件（含端点）。
 */
export function getEventsInRange(fromYear: number, toYear: number): TimelineEvent[] {
  return allEvents
    .filter((e) => e.year >= fromYear && e.year <= toYear)
    .map((e) => ({ year: e.year, label: e.event_name }));
}

/**
 * 获取区间内事件，包含 summary、narrative_hooks 供 LLM 叙事体现。
 */
export function getEventsInRangeWithDetails(
  fromYear: number,
  toYear: number
): TimelineEventWithDetails[] {
  return allEvents
    .filter((e) => e.year >= fromYear && e.year <= toYear)
    .map((e) => ({
      year: e.year,
      label: e.event_name,
      summary: e.summary,
      narrative_hooks: e.narrative_hooks
    }));
}

/**
 * 随机抽取 1～2 条「民间传闻」，供 Level3 叙事注入，增加世界真实感。
 * 排除已在 world_changes 中的主线事件，优先使用 narrative_hooks 中偏传闻风格的描述。
 */
export function getRandomRumorHints(
  fromYear: number,
  toYear: number,
  excludeLabels: string[],
  count = 2
): string[] {
  const candidates = allEvents
    .filter((e) => e.year >= fromYear && e.year <= toYear && !excludeLabels.includes(e.event_name))
    .map((e) => e as TimelineEventRecord & { event_name: string });
  if (candidates.length === 0) return [];
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  return picked.map((e) => {
    const hooks = e.narrative_hooks;
    const hook = hooks?.length ? hooks[Math.floor(Math.random() * hooks.length)] : undefined;
    if (hook && hook.length < 80) return `听说${hook.replace(/^[，。、]/, "")}`;
    return `听说${e.event_name}。`;
  });
}

/**
 * 根据当前年份与邻近时间线事件，随机生成 1～2 条民间传闻。
 * 用于 logical_results.folk_rumors，让 NPC 在对话中无意间提及即将或近年发生的史实。
 */
export function getUpcomingRumors(currentYear: number, count = 2): string[] {
  const toYear = Math.min(TIME_YEAR_MAX, currentYear + 2);
  const candidates = allEvents.filter(
    (e) => e.year >= currentYear && e.year <= toYear
  ) as TimelineEventRecord[];
  if (candidates.length === 0) return [];
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  return picked.map((e) => {
    const hooks = e.narrative_hooks;
    const hook = hooks?.length ? hooks[Math.floor(Math.random() * hooks.length)] : undefined;
    if (hook && hook.length < 80) return `听说${hook.replace(/^[，。、]/, "")}`;
    return `听说${e.event_name}。`;
  });
}
