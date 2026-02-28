/**
 * 核心引擎 2.0 标准数据契约：时间/生死/环境物理规则与语义记忆层所用接口。
 * 与 state.ts / sanguoDb 的存档结构可共存，引擎层统一使用本文件类型。
 */

/** 季节标签，供 WorldStateManager 与 event_context 使用 */
export type Season = "春" | "夏" | "秋" | "冬";

/** 环境天气标签（如春雨/夏暑/秋燥/冬雪），按月份滚动生成 */
export type WeatherTag =
  | "春雨"
  | "夏暑"
  | "秋燥"
  | "冬雪"
  | "晴"
  | "阴"
  | "风"
  | "雨"
  | "雪";

/**
 * 引擎标准 NPC：仅含时间/生死相关字段。
 * is_alive、current_age 由 WorldStateManager 每轮更新。
 */
export interface NPC {
  id: string;
  birth_year: number;
  death_year: number;
  /** 是否在世，由 WorldStateManager 根据 currentYear > death_year 维护 */
  is_alive: boolean;
  /** 当前岁数（虚岁），由 WorldStateManager 根据 currentYear - birth_year 维护 */
  current_age: number;
}

/**
 * 引擎标准世界状态：以 totalDays 为单一信源，派生年/月/季节/天气。
 * 与 state.ts 的 WorldState 可共存，存档可扩展 totalDays/season/weather。
 */
export interface EngineWorldState {
  /** 从 START_YEAR 起累计天数，每步 +7 */
  totalDays: number;
  year: number;
  month: number;
  season: Season;
  /** 环境标签，由 WorldStateManager 按月份生成 */
  weather: WeatherTag;
}
