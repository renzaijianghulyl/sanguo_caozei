import { registerEntity } from "@core/contentRegistry";
import { getAge, canServe } from "@core/relationshipRules";
import { getDefaultNPCState, getNPCsForYear } from "./npcs";
import { getAllRegions, getRegionName } from "./regions";
import type { NPCRecord } from "./types";
import { npcs184 } from "./npcs";
import { adaptNpcsFromRaw } from "../DataAdapter";
import type { NPC } from "../../types/sanguo";

export { getEventsInRange, TIME_YEAR_MIN, TIME_YEAR_MAX } from "./timeline";
export type { TimelineEvent } from "./timeline";
export { getRegionById, getRegionName, getAllRegions, regions184 } from "./regions";
export {
  getDefaultNPCState,
  getNPCById,
  getNPCsForYear,
  getDeceasedNPCsInRange,
  npcs184
} from "./npcs";
export type { RegionRecord, NPCRecord, TimelineEventRecord } from "./types";

/**
 * 核心引擎 2.0：按当前年份产出引擎标准 NPC 列表（id 为 string，含 is_alive/current_age）。
 * 供 WorldStateManager 与需要生死/岁数逻辑的模块使用。
 */
export function getEngineNpcs(year: number): NPC[] {
  return adaptNpcsFromRaw(getNPCsForYear(year), year);
}

/**
 * 使用三国结构化数据库初始化游戏：注册 NPC 到 contentRegistry（幻觉防御），
 * 并返回该年份的默认 NPC 列表与区域摘要。
 */
export function bootstrapSanguoDb(year: number): {
  defaultNpcs: ReturnType<typeof getDefaultNPCState>;
  regionSummary: Record<string, { name: string; ownerId: number; loyalty: number }>;
} {
  npcs184.forEach((npc: NPCRecord) => {
    registerEntity("npc", String(npc.id));
  });
  registerEntity("npc", "caocao");
  registerEntity("npc", "liubei");

  const regions = getAllRegions(year);
  const regionSummary: Record<string, { name: string; ownerId: number; loyalty: number }> = {};
  regions.forEach((r) => {
    regionSummary[String(r.id)] = { name: r.name, ownerId: r.owner_faction_id, loyalty: r.loyalty };
  });

  return {
    defaultNpcs: getDefaultNPCState(year),
    regionSummary
  };
}

const PURCHASING_POWER_INSTRUCTION =
  "【货币购买力】交易叙事中支付金额与所得物资价值量级须大致相当；禁止「五金」买下「五十金」价值物资，须按时间、战乱与地域体现合理折价或溢价。";

export function getLogicDbContext(year: number) {
  const regions = getAllRegions(year);
  const npcs = getNPCsForYear(year);
  return {
    purchasing_power_instruction: PURCHASING_POWER_INSTRUCTION,
    regions: regions.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      landscape_description: r.landscape_description,
      landmarks: r.landmarks,
      ownerId: r.owner_faction_id,
      loyalty: r.loyalty
    })),
    npcs: npcs.map((n) => {
      const age = getAge(n.birth_year, year);
      return {
        id: n.id,
        name: n.name,
        str: n.str,
        int: n.int,
        currentRegion: getRegionName(n.current_region_id),
        personality_traits: n.personality_traits,
        speech_style: n.speech_style,
        birth_year: n.birth_year,
        death_year: n.death_year,
        age,
        can_serve: canServe(age),
        father_id: n.father_id ?? null,
        owner_faction_id: n.owner_faction_id
      };
    })
  };
}
