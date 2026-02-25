/**
 * BondSystem：关系逻辑解耦。负责基于 NPCRecord 的初始关系导入，以及随 WorldState.time 的亲密度衰减。
 * 与 RelationManager 配合：RelationManager 提供 ensureBond、touchLastSeen 等单 NPC 操作；BondSystem 提供批量衰减与导入。
 */
import type { GameSaveData, NPCState, WorldState } from "@core/state";
import type { WorldTime } from "@core/state";
import type { NPCRecord } from "../data/sanguoDb/types";
import { ensureBond, syncBondToLegacyFavor } from "./RelationManager";
import { getNPCsForYear } from "../data/sanguoDb/npcs";
import { npcRecordToState } from "../data/sanguoDb/npcs";
import { initializeRelationsFromRecord } from "./RelationManager";
import {
  getInitialBondsOverrides,
  playerRelationToBondRelation,
  getEmotionalBriefTemplate,
  getEmotionalBriefEventHintDefault
} from "../data/bond";

/** 每月未见面时亲密度下降量（线性衰减） */
const DECAY_PER_MONTH = 0.5;

/** 从世界时间计算「月数」用于衰减计算 */
function toMonths(t: WorldTime): number {
  return (t.year ?? 0) * 12 + (t.month ?? 1);
}

/**
 * 基于 NPCRecord 列表与当前世界时间，生成带 Bond 的 NPCState 列表（初始关系导入）。
 * 用于新档或需要重置 NPC 关系时。
 */
const MAX_INITIAL_MEMORY_SHARDS = 30;

export function importFromRecords(
  records: NPCRecord[],
  worldTime: WorldTime
): NPCState[] {
  const npcs = records.map((r) => npcRecordToState(r));
  const initialOverrides = getInitialBondsOverrides();
  npcs.forEach((npc, i) => {
    initializeRelationsFromRecord(npc, records[i], npcs);
    ensureBond(npc, worldTime);
    const over = initialOverrides[npc.id];
    if (over && npc.bond) {
      if (typeof over.affinity === "number") {
        npc.bond.affinity = Math.max(0, Math.min(100, over.affinity));
      }
      if (over.player_relation != null && over.player_relation !== "") {
        npc.bond.relation_type = playerRelationToBondRelation(over.player_relation);
      }
      if (Array.isArray(over.milestones) && over.milestones.length > 0) {
        npc.bond.memory_shards = over.milestones.slice(0, MAX_INITIAL_MEMORY_SHARDS);
      }
      syncBondToLegacyFavor(npc);
    }
  });
  return npcs;
}

/**
 * 按当前世界时间对 saveData.npcs 应用亲密度衰减（就地修改）。
 * 仅当 NPC 存在 bond 时衰减；衰减后将 bond.affinity 同步到 player_favor。
 */
export function applyDecay(saveData: GameSaveData): void {
  const now = saveData.world?.time;
  if (!now) return;
  const nowMonths = toMonths(now);

  for (const npc of saveData.npcs ?? []) {
    ensureBond(npc, now);
    const bond = npc.bond;
    if (!bond) continue;

    const last = bond.last_seen_world_time;
    const lastMonths = toMonths(last);
    const monthsSince = Math.max(0, nowMonths - lastMonths);
    const decayAmount = Math.min(monthsSince * DECAY_PER_MONTH, bond.affinity);
    bond.affinity = Math.max(0, bond.affinity - decayAmount);
    syncBondToLegacyFavor(npc);
  }
}

/**
 * 获取某年的默认 NPC 列表（带 Bond 与 NPC 间关系），供新档使用。
 */
export function getDefaultNPCStateWithBonds(year: number): NPCState[] {
  const records = getNPCsForYear(year);
  const worldTime: WorldTime = { year, month: 1 };
  return importFromRecords(records, worldTime);
}

/** 供 config 使用的别名 */
export const initBondEngine = getDefaultNPCStateWithBonds;

/**
 * 羁绊情感简报：根据 NPC 状态与时间跨度生成重逢等情境的简报，供 preAdjudicator 注入 event_context。
 * 暂返回空数组，完整实现可对接 @data/bond 的 getEmotionalBriefTemplate 等。
 */
export function getEmotionalBrief(
  _npcState: NPCState,
  _fromYear: number,
  _toYear: number,
  _eventsWithDetails: unknown[]
): string[] {
  return [];
}
