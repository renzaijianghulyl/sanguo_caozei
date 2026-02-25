/**
 * 裁决 effects 解析与应用：纯逻辑抽离到 core，便于单测与复用。
 * 玩家属性增减通过 computePlayerStateDelta 产出增量，由调用方写回存档；
 * NPC 好感/关系直接变更传入的 saveData.npcs（就地修改），并委托 RelationManager 更新 Bond（last_seen）。
 */
import type { GameSaveData, NPCState, PlayerState } from "@core/state";
import type { BondRelationType, PlayerRelationType } from "@core/state";
import { touchLastSeen, ensureBond, syncBondToLegacyFavor } from "@core/RelationManager";
import { getAge, canMarry, canSwornBrother } from "@core/relationshipRules";
import { pushHistoryLog } from "@core/historyLog";
import { getNPCById } from "../data/sanguoDb";

const NPC_RELATION_VALUES: PlayerRelationType[] = ["acquaintance", "sworn_brother", "spouse"];
const MAX_MEMORY_SHARDS = 30;

/** PlayerRelationType -> BondRelationType */
function toBondRelation(r: PlayerRelationType): BondRelationType {
  if (r === "sworn_brother") return "sworn_brother";
  if (r === "spouse") return "spouse";
  if (r === "acquaintance") return "acquaintance";
  return "";
}

export interface PlayerStateDelta {
  attrs: Partial<PlayerState["attrs"]>;
  legend: number;
  reputation: number;
  fame: number;
  infamy: number;
  resources: Partial<PlayerState["resources"]>;
}

const ATTR_KEYS = ["strength", "intelligence", "charm", "luck"] as const;
const RESOURCE_KEYS = ["gold", "food", "soldiers"] as const;

/**
 * 解析 effects 中的玩家属性/资源/传奇/声望增量，返回可叠加的 delta。
 * 不依赖 runtime，纯函数。
 */
export function computePlayerStateDelta(changes: string[]): PlayerStateDelta {
  const attrs: Partial<PlayerState["attrs"]> = {};
  const resources: Partial<PlayerState["resources"]> = {};
  let legend = 0;
  let reputation = 0;
  let fame = 0;
  let infamy = 0;

  for (const change of changes) {
    const match = change.match(/^([a-zA-Z_]+)([+-]\d+)$/);
    if (!match) continue;
    const [, key, raw] = match;
    const value = Number(raw);
    if (Number.isNaN(value)) continue;
    if (ATTR_KEYS.includes(key as (typeof ATTR_KEYS)[number])) {
      attrs[key as keyof PlayerState["attrs"]] =
        (attrs[key as keyof PlayerState["attrs"]] ?? 0) + value;
    } else if (key === "legend") {
      legend += value;
    } else if (key === "reputation") {
      reputation += value;
    } else if (key === "fame") {
      fame += value;
    } else if (key === "infamy") {
      infamy += value;
    } else if (RESOURCE_KEYS.includes(key as (typeof RESOURCE_KEYS)[number])) {
      resources[key as keyof PlayerState["resources"]] =
        (resources[key as keyof PlayerState["resources"]] ?? 0) + value;
    }
  }

  return { attrs, legend, reputation, fame, infamy, resources };
}

const MAX_HOSTILE_FACTIONS = 10;

/**
 * 从 effects 中解析 hostile_faction=X，将势力 id 加入玩家黑名单并持久化。
 */
export function applyHostileFactionFromEffects(
  saveData: GameSaveData,
  effects: string[]
): void {
  if (!saveData?.player || !effects?.length) return;
  const list = saveData.player.hostile_factions ?? [];
  const set = new Set(list);
  for (const e of effects) {
    const m = e.match(/^hostile_faction=(.+)$/);
    if (!m) continue;
    const id = String(m[1]).trim().slice(0, 32);
    if (!id || set.has(id)) continue;
    set.add(id);
    list.push(id);
  }
  if (list.length > MAX_HOSTILE_FACTIONS) {
    saveData.player.hostile_factions = list.slice(-MAX_HOSTILE_FACTIONS);
  } else {
    saveData.player.hostile_factions = list;
  }
}

/**
 * 解析并应用与武将好感度、关系相关的 effects，就地修改 saveData.npcs。
 * 义结金兰、结婚会校验双方均满 15 岁，不满足则忽略。
 */
export function applyNpcRelationEffects(
  saveData: GameSaveData,
  effects: string[],
  year: number
): void {
  if (!saveData.npcs?.length) return;
  const playerBirth = saveData.player?.birth_year ?? 169;
  const playerAge = getAge(playerBirth, year);

  const worldTime = {
    year,
    month: saveData.world?.time?.month ?? 1
  };

  for (const effect of effects) {
    const favorMatch = effect.match(/^npc_(\d+)_favor([+-]\d+)$/);
    if (favorMatch) {
      const [, idStr, deltaStr] = favorMatch;
      const npc = saveData.npcs.find((n) => n.id === idStr);
      if (!npc) continue;
      const delta = Number(deltaStr);
      if (Number.isNaN(delta)) continue;
      ensureBond(npc, worldTime);
      if (npc.bond) {
        npc.bond.affinity = Math.max(0, Math.min(100, (npc.bond.affinity ?? 0) + delta));
        touchLastSeen(npc, worldTime);
        syncBondToLegacyFavor(npc);
      }
      continue;
    }

    const relationMatch = effect.match(/^npc_(\d+)_relation=(.+)$/);
    if (relationMatch) {
      const [, idStr, value] = relationMatch;
      const relation = value.trim().toLowerCase() as PlayerRelationType;
      if (!NPC_RELATION_VALUES.includes(relation)) continue;
      const npc = saveData.npcs.find((n) => n.id === idStr);
      if (!npc) continue;
      const npcBirth = npc.birth_year ?? getNPCById(Number(idStr))?.birth_year;
      const npcAge = npcBirth != null ? getAge(npcBirth, year) : 99;
      if (relation === "sworn_brother" && !canSwornBrother(playerAge, npcAge)) continue;
      if (relation === "spouse" && !canMarry(playerAge, npcAge)) continue;
      ensureBond(npc, worldTime);
      if (npc.bond) {
        npc.bond.relation_type = toBondRelation(relation);
        touchLastSeen(npc, worldTime);
        syncBondToLegacyFavor(npc);
      }
      continue;
    }

    const memoryMatch = effect.match(/^npc_(\d+)_memory=(.+)$/);
    if (memoryMatch) {
      const [, idStr, text] = memoryMatch;
      const npc = saveData.npcs.find((n) => n.id === idStr);
      if (!npc) continue;
      const shard = text.trim().slice(0, 200);
      if (!shard) continue;
      ensureBond(npc, worldTime);
      if (npc.bond) {
        const shards = npc.bond.memory_shards ?? [];
        npc.bond.memory_shards = [...shards, shard].slice(-MAX_MEMORY_SHARDS);
        touchLastSeen(npc, worldTime);
      }
    }
  }
}

/** 长期动作（闭关/远行）每月基准耗粮数，避免「时间悬浮」 */
const FOOD_CONSUMPTION_PER_MONTH = 2;
/** 长期动作每月基准耗金（口粮采买、盘缠等） */
const GOLD_CONSUMPTION_PER_MONTH = 1;
/** 羁绊亲和≥该值时，长时间分别后可触发「故人旧札」事件 */
const BOND_AFFINITY_FOR_LETTER = 60;

/**
 * 长期动作副作用：当 time_passed_months ≥ 1 时，扣除生存资源（粮、金），
 * 且当跨度 ≥ 12 月且存在高羁绊 NPC 时，写入「得故人旧札」大事记并设置下一回合叙事钩子。
 * 应在裁决结果应用完 world_state 后调用（此时存档已为新时间）。
 */
export function applyTimeLapseSideEffects(
  saveData: GameSaveData,
  timePassedMonths: number
): void {
  if (!saveData?.player || timePassedMonths < 1) return;
  const player = saveData.player;
  const res = player.resources ?? { gold: 0, food: 0, soldiers: 0 };
  const foodDeduct = Math.min(res.food ?? 0, timePassedMonths * FOOD_CONSUMPTION_PER_MONTH);
  const goldDeduct = Math.min(res.gold ?? 0, timePassedMonths * GOLD_CONSUMPTION_PER_MONTH);
  player.resources = {
    ...res,
    food: Math.max(0, (res.food ?? 0) - foodDeduct),
    gold: Math.max(0, (res.gold ?? 0) - goldDeduct)
  };

  if (timePassedMonths >= 12 && saveData.npcs?.length) {
    const highBond = saveData.npcs.find(
      (n) => (n.bond?.affinity ?? n.player_favor ?? 0) >= BOND_AFFINITY_FOR_LETTER
    );
    if (highBond) {
      const name = highBond.name ?? getNPCById(Number(highBond.id))?.name ?? "故人";
      const year = saveData.world?.time?.year ?? 184;
      const month = saveData.world?.time?.month ?? 1;
      pushHistoryLog(saveData, {
        type: "bond_milestone",
        text: `出关/远行后得故人旧札（${name}）`,
        year,
        month
      });
      if (!saveData.tempData) saveData.tempData = {};
      (saveData.tempData as Record<string, unknown>).delayed_letter_hint = name;
    }
  }
}

const MAX_ACTIVE_GOALS = 5;

/**
 * 当裁决返回重要剧情转折（suggested_goals）时，合并入玩家当前目标列表，供叙事与建议动作引导。
 * 新目标插入队首，去重后保留最多 MAX_ACTIVE_GOALS 条。
 */
export function applyActiveGoalsUpdate(
  saveData: GameSaveData,
  suggestedGoals: string[]
): void {
  if (!suggestedGoals?.length || !saveData.player) return;
  const current = saveData.player.active_goals ?? [];
  const seen = new Set<string>(current.map((g) => g.trim()).filter(Boolean));
  const added: string[] = [];
  for (const g of suggestedGoals) {
    const t = g.trim().slice(0, 80);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    added.push(t);
  }
  if (added.length === 0) return;
  saveData.player.active_goals = [...added, ...current].slice(0, MAX_ACTIVE_GOALS);
}
