/**
 * 人际关系管理：基于 NPCRecord 初始化 NPC 间关系，以及亲密度（Bond.affinity）的动态变迁。
 */
import type { BondRelationType, NPCState, WorldTime } from "@core/state";
import type { NPCRecord } from "../data/sanguoDb/types";

const AFFINITY_FAMILY = 85;
const AFFINITY_SPOUSE = 90;
const AFFINITY_CLOSE_FRIEND = 70;
const AFFINITY_RIVAL = 25;

/** 创建默认 Bond，用于初次建立羁绊 */
export function createDefaultBond(worldTime: WorldTime): NPCState["bond"] {
  return {
    affinity: 0,
    relation_type: "",
    memory_shards: [],
    last_seen_world_time: { ...worldTime },
    last_interaction_year: worldTime.year
  };
}

/** 将旧版 Bond（含 milestones）规范为新版（relation_type, memory_shards, last_interaction_year） */
export function normalizeBond(bond: NPCState["bond"], worldTime: WorldTime): void {
  if (!bond) return;
  const legacy = bond as import("@core/state").BondLegacy & typeof bond;
  if (Array.isArray(legacy.milestones) && !Array.isArray(bond.memory_shards)) {
    (bond as { memory_shards: string[] }).memory_shards = [...legacy.milestones];
  }
  if (bond.relation_type === undefined) (bond as { relation_type: import("@core/state").BondRelationType }).relation_type = "";
  if (bond.last_interaction_year === undefined) {
    (bond as { last_interaction_year: number }).last_interaction_year =
      bond.last_seen_world_time?.year ?? worldTime.year;
  }
}

/** 确保 NPC 具有 bond 对象；若不存在则用 worldTime 创建默认 Bond；若为旧版则规范化并同步 player_favor */
export function ensureBond(npc: NPCState, worldTime: WorldTime): void {
  if (!npc.bond) {
    npc.bond = createDefaultBond(worldTime);
    return;
  }
  normalizeBond(npc.bond, worldTime);
  syncBondToLegacyFavor(npc);
}

/**
 * 基于 NPCRecord 的血缘/好友/敌对字段，初始化 NPCState.relations。
 * 不修改 bond，仅设置与其他 NPC 的关系数值。
 */
export function initializeRelationsFromRecord(
  npcState: NPCState,
  record: NPCRecord,
  _allNpcs: NPCState[]
): void {
  const relations: Record<string, number> = { ...npcState.relations };

  if (record.father_id != null && record.father_id > 0) {
    relations[String(record.father_id)] = AFFINITY_FAMILY;
  }
  if (record.spouse_id != null && record.spouse_id > 0) {
    relations[String(record.spouse_id)] = AFFINITY_SPOUSE;
  }
  if (record.close_friends?.length) {
    for (const id of record.close_friends) {
      relations[String(id)] = AFFINITY_CLOSE_FRIEND;
    }
  }
  if (record.rivals?.length) {
    for (const id of record.rivals) {
      relations[String(id)] = AFFINITY_RIVAL;
    }
  }

  if (Object.keys(relations).length > 0) {
    npcState.relations = relations;
  }
}

/** 记忆碎片最大条数 */
const MAX_MEMORY_SHARDS = 30;

/**
 * 更新与玩家的亲密度，并可追加一条记忆碎片。
 * 若 NPC 尚无 bond，会先以 worldTime 创建默认 Bond。
 */
export function updateAffinity(
  npc: NPCState,
  delta: number,
  worldTime: WorldTime,
  memoryShard?: string
): void {
  ensureBond(npc, worldTime);
  if (!npc.bond) return;
  npc.bond.affinity = Math.max(0, Math.min(100, npc.bond.affinity + delta));
  npc.bond.last_seen_world_time = { ...worldTime };
  npc.bond.last_interaction_year = worldTime.year;
  if (memoryShard?.trim()) {
    const shards = npc.bond.memory_shards ?? [];
    npc.bond.memory_shards = [...shards, memoryShard.trim()].slice(-MAX_MEMORY_SHARDS);
  }
  syncBondToLegacyFavor(npc);
}

/** 将 bond.affinity / relation_type 同步到 NPCState 的 player_favor / player_relation（兼容与 LLM 入参） */
export function syncBondToLegacyFavor(npc: NPCState): void {
  if (!npc.bond) return;
  npc.player_favor = Math.round(npc.bond.affinity);
  npc.player_relation = bondRelationToPlayerRelation(npc.bond.relation_type);
}

/** BondRelationType 映射为 PlayerRelationType（仅部分可映射） */
export function bondRelationToPlayerRelation(r: BondRelationType): NPCState["player_relation"] {
  if (r === "sworn_brother") return "sworn_brother";
  if (r === "spouse") return "spouse";
  if (r === "acquaintance" || r === "lord_vassal" || r === "admiration") return "acquaintance";
  return "";
}

/**
 * 仅更新上次见面时间（例如裁决中与该 NPC 发生互动时调用）。
 */
export function touchLastSeen(npc: NPCState, worldTime: WorldTime): void {
  ensureBond(npc, worldTime);
  if (npc.bond) {
    npc.bond.last_seen_world_time = { ...worldTime };
    npc.bond.last_interaction_year = worldTime.year;
    syncBondToLegacyFavor(npc);
  }
}
