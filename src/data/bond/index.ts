/**
 * 羁绊系统数据：initialBonds、affinityTiers、milestoneTemplates、emotionalBriefTemplates。
 * 数据来自《羁绊系统_数据规范与编入约定》，编入方在此读取并对外提供查询/注入接口。
 */
import type { BondRelationType } from "@core/state";

import initialBondsJson from "./initialBonds.json";
import affinityTiersJson from "./affinityTiers.json";
import milestoneTemplatesJson from "./milestoneTemplates.json";
import emotionalBriefTemplatesJson from "./emotionalBriefTemplates.json";

/** initialBonds.json 中单个 NPC 的初始羁绊 */
export interface InitialBondEntry {
  affinity?: number;
  player_relation?: "" | "acquaintance" | "sworn_brother" | "spouse";
  milestones?: string[];
  /** 会面门槛：玩家恶名 ≥ 此值时拒绝会面，触发闭门谢客或官兵围剿 */
  encounter_threshold?: number;
}

export interface InitialBondsData {
  version?: string;
  comment?: string;
  byNpcId: Record<string, InitialBondEntry>;
}

export interface AffinityTier {
  min: number;
  max: number;
  label: string;
  narrativeHint?: string;
}

export interface AffinityTiersData {
  version?: string;
  tiers: AffinityTier[];
}

export interface MilestoneTemplate {
  id: string;
  text: string;
}

export interface MilestoneTemplatesData {
  version?: string;
  templates: MilestoneTemplate[];
}

export interface EmotionalBriefTemplate {
  id: string;
  pattern: string;
}

export interface EmotionalBriefTemplatesData {
  version?: string;
  templates: EmotionalBriefTemplate[];
  eventHintDefault?: string;
}

const initialBonds = initialBondsJson as InitialBondsData;
const affinityTiers = affinityTiersJson as AffinityTiersData;
const milestoneTemplates = milestoneTemplatesJson as MilestoneTemplatesData;
const emotionalBriefTemplates = emotionalBriefTemplatesJson as EmotionalBriefTemplatesData;

/** 获取某 NPC 的初始羁绊覆盖（若存在） */
export function getInitialBondsOverrides(): Record<string, InitialBondEntry> {
  return initialBonds.byNpcId ?? {};
}

/** 获取某 NPC 的会面门槛（恶名 ≥ 此值时拒绝会面）；无则返回 undefined 表示不设门槛 */
export function getEncounterThreshold(npcId: string): number | undefined {
  const entry = (initialBonds.byNpcId ?? {})[String(npcId)];
  return entry?.encounter_threshold;
}

/** 根据亲密度数值获取等级标签与叙事提示 */
export function getAffinityTier(affinity: number): { label: string; narrativeHint: string } {
  const tiers = affinityTiers.tiers ?? [];
  const value = Math.max(0, Math.min(100, affinity));
  for (const t of tiers) {
    if (value >= t.min && value <= t.max) {
      return {
        label: t.label ?? "未知",
        narrativeHint: t.narrativeHint ?? ""
      };
    }
  }
  return { label: "未知", narrativeHint: "" };
}

/** 根据 id 获取里程碑文案模板 */
export function getMilestoneTemplate(id: string): string | undefined {
  const t = (milestoneTemplates.templates ?? []).find((x) => x.id === id);
  return t?.text;
}

/** 情感简报：根据 id 获取 pattern，以及默认 eventHint 前缀 */
export function getEmotionalBriefTemplate(id: string): { pattern: string } | undefined {
  const t = (emotionalBriefTemplates.templates ?? []).find((x) => x.id === id);
  return t ? { pattern: t.pattern } : undefined;
}

/** 情感简报无事件列表时的默认 eventHint */
export function getEmotionalBriefEventHintDefault(): string {
  return emotionalBriefTemplates.eventHintDefault ?? "期间历经天下大事，";
}

/** 将数据包 player_relation 映射为 BondRelationType */
export function playerRelationToBondRelation(
  r: "" | "acquaintance" | "sworn_brother" | "spouse"
): BondRelationType {
  if (r === "sworn_brother") return "sworn_brother";
  if (r === "spouse") return "spouse";
  if (r === "acquaintance") return "acquaintance";
  return "";
}
