/**
 * 大事记系统：自动捕获年份跨越、时间线事件、旅行轨迹、羁绊里程碑，写入存档并供 LLM past_milestones。
 */
import type { GameSaveData, HistoryLogEntry, WorldState } from "@core/state";
import { REGION_DISPLAY_NAMES } from "@config/index";
import milestoneTemplates from "../data/bond/milestoneTemplates.json";

const MAX_HISTORY_LOGS = 200;

/** 年号简表（年份 -> 年号名与元年偏移），用于大事记展示 */
const ERA_MAP: Array<{ start: number; name: string }> = [
  { start: 184, name: "中平" },
  { start: 190, name: "初平" },
  { start: 194, name: "兴平" },
  { start: 196, name: "建安" },
  { start: 220, name: "延康" },
  { start: 221, name: "黄初" },
  { start: 227, name: "太和" },
  { start: 240, name: "正始" },
  { start: 254, name: "正元" },
  { start: 256, name: "甘露" },
  { start: 264, name: "景元" },
  { start: 266, name: "泰始" },
  { start: 280, name: "太康" }
];

/** 年号（如「中平元年」），供状态栏等拼接 年号+公元+季节+月份 */
export function getEraLabel(year: number): string {
  let era = ERA_MAP[0];
  for (const e of ERA_MAP) {
    if (year >= e.start) era = e;
  }
  const offset = year - era.start + 1;
  const yearLabel = offset === 1 ? "元年" : `${offset}年`;
  return `${era.name}${yearLabel}`;
}

const MONTH_NAMES = [
  "正月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "冬月", "腊月"
];

/** 月份显示名（如「二月」） */
export function getMonthNameForDisplay(month: number): string {
  const m = month >= 1 && month <= 12 ? month - 1 : 0;
  return MONTH_NAMES[m];
}

export function getEraLabelForDisplay(year: number, month: number): string {
  const era = getEraLabel(year);
  const m = month >= 1 && month <= 12 ? month - 1 : 0;
  return `【${era}】· ${MONTH_NAMES[m]}`;
}

function ensureHistoryLogs(saveData: GameSaveData): HistoryLogEntry[] {
  if (!saveData.history_logs) saveData.history_logs = [];
  return saveData.history_logs;
}

export function pushHistoryLog(
  saveData: GameSaveData,
  entry: Omit<HistoryLogEntry, "year" | "month"> & { year: number; month?: number }
): void {
  const logs = ensureHistoryLogs(saveData);
  logs.push({
    type: entry.type,
    text: entry.text,
    year: entry.year,
    month: entry.month
  });
  if (logs.length > MAX_HISTORY_LOGS) saveData.history_logs = logs.slice(-MAX_HISTORY_LOGS);
}

export function getRecentHistoryLogs(saveData: GameSaveData | null, n: number): HistoryLogEntry[] {
  if (!saveData?.history_logs?.length) return [];
  return saveData.history_logs.slice(-n);
}

/** 将大事记格式化为玩家生平文案（按年/月排序，供游戏结束界面展示） */
export function formatLifeSummary(saveData: GameSaveData | null): string {
  if (!saveData?.history_logs?.length) return "";
  const logs = [...saveData.history_logs].sort(
    (a, b) => (a.year - b.year) || ((a.month ?? 1) - (b.month ?? 1))
  );
  const lines = logs.map((e) => {
    const era = getEraLabel(e.year);
    const monthStr = e.month != null ? `· ${getMonthNameForDisplay(e.month)}` : "";
    return `${era}${monthStr}　${e.text}`;
  });
  return lines.join("\n");
}

/** 关键记忆标签：玩家改变非史实 NPC 命运等时写入，供 50 轮后联觉唤醒 */
export function getCrucialMemoryTags(saveData: GameSaveData | null): string[] {
  if (!saveData?.history_logs?.length) return [];
  return saveData.history_logs
    .filter((e) => e.type === "crucial_memory" && e.tag)
    .map((e) => e.tag!);
}

export interface PrevSnapshot {
  world?: WorldState | null;
  playerRegion?: string;
}

/**
 * 在裁决应用状态后调用：根据前后状态与 logical_results 自动写入大事记。
 */
export function captureFromStateChange(
  saveData: GameSaveData,
  prev: PrevSnapshot,
  options: {
    worldChanges?: string[];
    effects?: string[];
  } = {}
): void {
  const world = saveData.world;
  const time = world?.time;
  const year = time?.year ?? 184;
  const month = time?.month ?? 1;
  const player = saveData.player;
  const region = player?.location?.region ?? "";
  const regionName = REGION_DISPLAY_NAMES[region] || region || "未知";

  if (prev.world?.time?.year != null && year > prev.world.time.year) {
    pushHistoryLog(saveData, {
      type: "year_change",
      text: `岁月流转，进入${getEraLabel(year)}`,
      year,
      month
    });
  }

  const worldChanges = options.worldChanges ?? [];
  for (const label of worldChanges) {
    pushHistoryLog(saveData, {
      type: "timeline_event",
      text: label,
      year,
      month
    });
  }

  if (prev.playerRegion != null && region && prev.playerRegion !== region) {
    pushHistoryLog(saveData, {
      type: "travel",
      text: `抵达${regionName}`,
      year,
      month
    });
  }

  for (const effect of options.effects ?? []) {
    const crucialMatch = effect.match(/^crucial_memory:(.+)$/);
    if (crucialMatch) {
      const tag = crucialMatch[1].trim();
      if (tag) {
        pushHistoryLog(saveData, {
          type: "crucial_memory",
          text: `关键记忆：${tag}`,
          year,
          month,
          tag
        });
      }
      continue;
    }
  }

  const templates = (milestoneTemplates as { templates?: Array<{ id: string; text: string }> }).templates ?? [];
  for (const effect of options.effects ?? []) {
    const relationMatch = effect.match(/^npc_(\d+)_relation=(.+)$/);
    if (!relationMatch) continue;
    const [, idStr, value] = relationMatch;
    const relation = value.trim().toLowerCase();
    const npc = saveData.npcs?.find((n) => n.id === idStr);
    const npcName = npc?.name ?? `武将${idStr}`;
    const t = templates.find((x) => x.id === relation);
    const text = t ? t.text.replace(/与你|你/g, `与${npcName}`).replace(/你/g, npcName) : `${npcName}：${relation}`;
    pushHistoryLog(saveData, {
      type: "bond_milestone",
      text: `${npcName} · ${text}`,
      year,
      month
    });
  }
}
