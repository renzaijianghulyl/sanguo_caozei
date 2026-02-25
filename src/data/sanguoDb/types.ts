/**
 * 三国结构化数据库类型定义，与 outputs_三国结构化数据库 的 JSON 结构一致。
 */

export interface RegionRecord {
  id: number;
  name: string;
  type: string;
  /** 区域地貌描述，用于旅行叙事（如「官道两旁麦田起伏」「关隘险要，山道崎岖」） */
  landscape_description?: string;
  /** 区域地标名列表，玩家身处或到达该区域时供环境描写使用（如「洛阳城门」「铜雀台」） */
  landmarks?: string[];
  adjacent_regions: string[];
  commerce: number;
  farming: number;
  culture: number;
  defense: number;
  money: number;
  food: number;
  population: number;
  troop_count: number;
  owner_faction_id: number;
  loyalty: number;
}

export interface NPCRecord {
  id: number;
  name: string;
  birth_year: number;
  death_year: number;
  appear_year: number;
  str: number;
  int: number;
  pol: number;
  lea: number;
  personality_traits?: string[];
  speech_style?: string;
  father_id: number | null;
  spouse_id: number | null;
  close_friends?: number[];
  rivals?: number[];
  current_region_id: number;
  owner_faction_id: number;
}

export interface TimelineEventRecord {
  event_id: number;
  year: number;
  month: number;
  event_name: string;
  summary?: string;
  trigger_condition?: string;
  hard_effects?: unknown;
  narrative_hooks?: string[];
}
