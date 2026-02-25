import type { NPCRecord } from "./types";
import type { NPCState } from "@core/state";
import { initializeRelationsFromRecord } from "@core/RelationManager";
import { getRegionName } from "./regions";

import npcs184Json from "./raw/npcs_184.json";

const npcs184 = npcs184Json as NPCRecord[];

export function npcRecordToState(npc: NPCRecord): NPCState {
  return {
    id: String(npc.id),
    name: npc.name,
    birth_year: npc.birth_year,
    death_year: npc.death_year,
    stance: "neutral",
    trust: 30,
    player_favor: 0,
    player_relation: "",
    location: getRegionName(npc.current_region_id)
  };
}

export function getNPCsForYear(year: number): NPCRecord[] {
  if (year >= 184 && year < 190) return npcs184;
  return npcs184;
}

export function getDefaultNPCState(year: number): NPCState[] {
  const records = getNPCsForYear(year);
  const npcs = records.map(npcRecordToState);
  npcs.forEach((npc, i) => {
    initializeRelationsFromRecord(npc, records[i], npcs);
  });
  return npcs;
}

export function getNPCById(id: number): NPCRecord | undefined {
  return npcs184.find((n) => n.id === id);
}

/** 获取在 [fromYear, toYear] 期间逝世的武将名单（供 historical_summary 注入） */
export function getDeceasedNPCsInRange(fromYear: number, toYear: number): string[] {
  return npcs184
    .filter((n) => n.death_year >= fromYear && n.death_year <= toYear)
    .map((n) => n.name)
    .filter(Boolean);
}

export { npcs184 };
