import type { RegionRecord } from "./types";

import regions184Json from "./raw/regions_184.json";

const regions184 = regions184Json as RegionRecord[];

const regionById = new Map<number, RegionRecord>();
regions184.forEach((r) => regionById.set(r.id, r));

export function getRegionById(id: number): RegionRecord | undefined {
  return regionById.get(id);
}

export function getRegionName(id: number): string {
  const r = regionById.get(id);
  return r?.name ?? String(id);
}

/** 按名称查找区域（如「洛阳」「虎牢关」），用于意图解析与旅行逻辑 */
export function getRegionByName(name: string): RegionRecord | undefined {
  return regions184.find((r) => r.name === name);
}

export function getAllRegions(year: number): RegionRecord[] {
  if (year >= 184 && year < 190) return regions184;
  return regions184;
}

export { regions184 };
