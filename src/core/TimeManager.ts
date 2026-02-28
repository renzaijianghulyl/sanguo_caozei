/**
 * 核心引擎 2.0 物理时钟：以 totalDays 为单一信源，起点 184 年，每步 +7 天，支持汉代纪年输出。
 */

import type { Season } from "../types/sanguo";

export const START_YEAR = 184;

/** 每年按 365 天计，用于 totalDays <-> 年/月 换算（不考虑闰年） */
const DAYS_PER_YEAR = 365;
const DAYS_PER_MONTH = 30;

/**
 * 东汉末年主要年号：公历年份 -> [年号, 该年号下第几年]
 * 184 中平元年 … 189 中平六年，190 初平元年 … 193 初平四年，194 兴平元年，195 兴平二年，196 建安元年 … 220 建安二十五年
 */
const ERA_BY_YEAR: Array<{ startYear: number; name: string }> = [
  { startYear: 184, name: "中平" },
  { startYear: 190, name: "初平" },
  { startYear: 194, name: "兴平" },
  { startYear: 196, name: "建安" },
  { startYear: 220, name: "延康" },
  { startYear: 221, name: "黄初" },
  { startYear: 222, name: "章武" },
  { startYear: 229, name: "黄龙" }
];

/**
 * 将 totalDays（从 0 起，0 = 184年1月1日）换算为公历 year / month / day。
 */
export function totalDaysToCalendar(totalDays: number): { year: number; month: number; day: number } {
  const d = Math.max(0, Math.floor(totalDays));
  const year = START_YEAR + Math.floor(d / DAYS_PER_YEAR);
  const dayInYear = d % DAYS_PER_YEAR;
  const month = 1 + Math.min(11, Math.floor(dayInYear / DAYS_PER_MONTH));
  const day = 1 + (dayInYear % DAYS_PER_MONTH);
  return { year, month, day: Math.min(28, day) };
}

/**
 * 将当前 world 的 year/month/day 换算为 totalDays（从 0 起）。
 */
export function calendarToTotalDays(year: number, month: number, day: number): number {
  const years = year - START_YEAR;
  const months = years * 12 + (month - 1);
  const days = months * DAYS_PER_MONTH + Math.min(day - 1, DAYS_PER_MONTH - 1);
  return Math.max(0, days);
}

/**
 * 单次步进：totalDays 增加 7 天。
 */
export function stepTotalDays(totalDays: number): number {
  return totalDays + 7;
}

/**
 * 根据公历年份得到该年号及在年号内的第几年。
 */
function getEraAndYearInEra(year: number): { eraName: string; yearInEra: number } {
  let i = ERA_BY_YEAR.length - 1;
  while (i >= 0 && year < ERA_BY_YEAR[i].startYear) i--;
  const e = i >= 0 ? ERA_BY_YEAR[i] : ERA_BY_YEAR[0];
  const yearInEra = year - e.startYear + 1;
  return { eraName: e.name, yearInEra: Math.max(1, yearInEra) };
}

const ZH_NUM = "元一二三四五六七八九十";
function toChineseYearNum(n: number): string {
  if (n <= 0) return "元";
  if (n === 1) return "元";
  if (n <= 10) return ZH_NUM[n];
  if (n < 20) return "十" + (n === 10 ? "" : ZH_NUM[n - 10]);
  if (n < 100)
    return ZH_NUM[Math.floor(n / 10)] + "十" + (n % 10 === 0 ? "" : ZH_NUM[n % 10]);
  return String(n);
}

/**
 * 将 totalDays 转为汉代纪年文案，如「初平元年」「建安五年三月」。
 *
 * @param totalDays - 从 0 起累计天数
 * @param includeMonth - 是否附带月份，如「建安五年三月」
 */
export function getChineseYear(totalDays: number, includeMonth = false): string {
  const { year, month } = totalDaysToCalendar(totalDays);
  const { eraName, yearInEra } = getEraAndYearInEra(year);
  const yStr = eraName + toChineseYearNum(yearInEra) + "年";
  if (includeMonth) return yStr + month + "月";
  return yStr;
}

/**
 * 根据月份返回季节。
 */
export function getSeasonFromMonth(month: number): Season {
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}
