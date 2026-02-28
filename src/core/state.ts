export interface PlayerAttributes {
  strength: number;
  intelligence: number;
  charm: number;
  luck: number;
}

export interface PlayerResources {
  gold: number;
  food: number;
  soldiers: number;
}

export interface PlayerLocation {
  region: string;
  scene: string;
}

/** 志向：影响首段叙事与长期叙事倾向（符合/违背时的内心戏） */
export type AmbitionType = "unify" | "wealth" | "fortress" | "scholar";

/** 立志阶段解析出的目标类型（与 AmbitionType 可对应） */
export type PrimaryGoalType = "unify" | "wealth" | "fortress" | "scholar" | "other";

/** 立志：开局「阁下此番入世，所求为何？」后提炼的愿望，驱动主线软性引导与每 10 轮对齐评估 */
export interface Aspiration {
  /** 经修正后的愿望一句话（持久化进 System/event_context），供 AI 每轮叙事与 suggested_actions 向此靠拢 */
  destiny_goal: string;
  /** 主目标类型，便于逻辑层判断对齐 */
  primary_goal?: PrimaryGoalType;
  /** 路径/身份倾向，如 MERCHANT、WARLORD、HERMIT */
  career_path?: string;
  /** 目标地点倾向，如 LUOYANG、XUCHANG */
  target_location?: string;
}

/** 玩家与武将的关系类型：普通相识、义结金兰、结婚等（与 Bond.relation_type 同步展示用） */
export type PlayerRelationType = "" | "acquaintance" | "sworn_brother" | "spouse";

/** 羁绊关系类型：君臣/兄弟/倾慕/夫妻/相识等，供叙事与权限判定 */
export type BondRelationType =
  | ""
  | "acquaintance"
  | "lord_vassal"
  | "sworn_brother"
  | "admiration"
  | "spouse";

/** 世界时间（年/月），用于 Bond.last_seen_world_time 等 */
export interface WorldTime {
  year: number;
  month: number;
}

/** 季节字面（春/夏/秋/冬） */
export type SeasonKind = "春" | "夏" | "秋" | "冬";

/** 根据世界时间获取季节，供叙事与感官描写使用 */
export function getSeason(time: Pick<WorldTime, "month">): SeasonKind {
  const m = time.month;
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}

/** 根据世界时间返回简短环境感官描述（如盛夏蝉鸣、深秋落叶），供 event_context 注入 */
export function getSeasonSensoryDescription(time: Pick<WorldTime, "month">): string {
  const m = time.month;
  if (m >= 3 && m <= 5)
    return "春日和煦，草木萌发，偶有落英。";
  if (m >= 6 && m <= 8)
    return "盛夏炎炎，蝉鸣聒耳，树影匝地。";
  if (m >= 9 && m <= 11)
    return "深秋气肃，落叶萧萧，天高云淡。";
  return "冬日苦寒，北风刺骨，呵气成霜。";
}

/** 玩家与 NPC 的羁绊：亲密度、关系类型、记忆碎片、上次互动时间 */
export interface Bond {
  /** 亲密度数值 0～100，可随互动与时间变迁 */
  affinity: number;
  /** 关系类型：君臣/兄弟/倾慕/夫妻/相识等 */
  relation_type: BondRelationType;
  /** 记忆碎片数组（由叙事关键点自动写入），保留最近若干条 */
  memory_shards: string[];
  /** 上次见面时的世界时间（用于衰减计算） */
  last_seen_world_time: WorldTime;
  /** 上次互动年份，便于查询与叙事 */
  last_interaction_year: number;
}

/** 兼容旧存档：milestones 视为 memory_shards 的别名 */
export interface BondLegacy {
  affinity?: number;
  milestones?: string[];
  last_seen_world_time?: WorldTime;
  relation_type?: BondRelationType;
  memory_shards?: string[];
  last_interaction_year?: number;
}

/** 年龄门槛：未满此岁不可出仕、义结金兰、结婚 */
export const MIN_AGE_SERVE = 15;
export const MIN_AGE_SWORN = 15;
export const MIN_AGE_MARRIAGE = 15;

export interface PlayerState {
  id: string;
  name?: string;
  gender?: "male" | "female";
  /** 出生年份，用于与 world.time.year 计算年龄；未满 15 岁不可义结金兰/结婚 */
  birth_year?: number;
  attrs: PlayerAttributes;
  legend: number;
  tags: string[];
  reputation: number;
  resources: PlayerResources;
  location: PlayerLocation;
  /** 行动力，用于决策与行动消耗；不足时动作判定为「勉强完成」或「体力不支倒地」。与健康度解耦 */
  stamina?: number;
  /** 健康度 0～100，表示生理阻力；重伤/中毒/断粮/殒命会降低；≤0 时游戏终止 */
  health?: number;
  /** 志向：统一三国 / 富甲天下，写入 SYSTEM_PROMPT 永久标签，驱动首段独白与内心戏 */
  ambition?: AmbitionType;
  /** 当前身份称号，根据志向与行为动态赋予，如「乱世奸雄」「货通天下」 */
  active_titles?: string[];
  /** 当前进行中的目标/任务（如「攻下西华」「寻访荀彧」），供叙事与建议动作引导，最多保留若干条 */
  active_goals?: string[];
  /** 名望（正值），善行或功业积累 */
  fame?: number;
  /** 恶名（正值表示程度），纵火、劫掠、行刺等恶行积累，影响叙事风格与 NPC 态度 */
  infamy?: number;
  /** 阵营黑名单（势力 id 或名称），玩家对该势力做过破坏动作后加入，该势力 NPC 对玩家敌意 */
  hostile_factions?: string[];
  /** 立志阶段设定的愿望（destiny_goal），驱动主线软性引导与 NPC 提醒 */
  aspiration?: Aspiration;
  /** 自定身份标签（与 origin 记忆一致，如「华佗弟子」），立志时写入，对话区玩家名下方永久展示 */
  origin_label?: string;
  /** 与 WorldState 时间/地点严重冲突的指令累计次数，用于触发「嘲讽/无视」叙事 */
  logic_conflict_count?: number;
  /** 负面状态标签：wounded=重伤、poisoned=中毒；断粮由 resources.food<=0 判定；影响战斗/移动成功率与叙事 */
  status_flags?: string[];
}

export interface WorldState {
  era: string;
  flags: string[];
  /** 历史偏移标记：玩家改变重大史实后永久记录，如「郭嘉未死」「董卓已刺」 */
  history_flags?: string[];
  time: {
    year: number;
    month: number;
    day: number;
  };
  /** 核心引擎 2.0：从 184 年 1 月 1 日起累计天数，与 time 同步，供汉代纪年与步进 +7 使用 */
  totalDays?: number;
  regionStatus?: Record<string, string>;
  regions?: Record<
    string,
    {
      stability?: number;
      unrest?: number;
      /** 当前天气标签，由 WorldManager 按季节模板每轮刷新 */
      weather?: string;
    }
  >;
}

export interface NPCState {
  id: string;
  name?: string;
  /** 出生/卒年，用于计算年龄：未满 15 岁仅为娃娃不可出仕，满 15 才可义结金兰/结婚 */
  birth_year?: number;
  death_year?: number;
  /** 是否在世，由 WorldManager 根据 world.time.year 与 death_year 每轮同步 */
  is_alive?: boolean;
  /** 当前岁数（虚岁），由 WorldManager 根据 world.time.year 与 birth_year 每轮同步 */
  current_age?: number;
  stance: string;
  trust: number;
  location?: string;
  /** 玩家对该武将的好感度 0～100，影响结义/结婚等 */
  player_favor?: number;
  /** 玩家与该武将的关系类型：空、相识、义结金兰、结婚 */
  player_relation?: PlayerRelationType;
  /** 武将与其它武将的好感/关系：npc_id -> 好感度，用于义结金兰、结婚等 */
  relations?: Record<string, number>;
  /** 与玩家的羁绊：亲密度、关键记忆、上次见面时间（有互动或关注时存在） */
  bond?: Bond;
  /** 对当前所属势力的忠诚度 0～100，用于守将献城/死战叙事分支（增强方案） */
  loyalty?: number;
  /** 野心 0～100，影响自立/投靠倾向（增强方案） */
  ambition?: number;
}

export interface EventLogEntry {
  eventId: string;
  playerId: string;
  triggeredAt: string;
  recordedAt: string;
}

export interface GameProgress {
  totalTurns: number;
  lastEventId: string;
  lastEventTime: string;
}

/** 大事记单条：用于生平回顾与 LLM past_milestones；crucial_memory 用于联觉唤醒 */
export interface HistoryLogEntry {
  /** 类型：year_change | timeline_event | travel | bond_milestone | crucial_memory */
  type: "year_change" | "timeline_event" | "travel" | "bond_milestone" | "crucial_memory";
  /** 展示文案，如 "建安五年 · 抵达洛阳" */
  text: string;
  /** 发生时的世界年份 */
  year: number;
  /** 发生时的世界月份，可选 */
  month?: number;
  /** 关键记忆标签，仅 type 为 crucial_memory 时使用，供联觉唤醒匹配（如 "阿石" "帛书"） */
  tag?: string;
}

export interface GameSaveMeta {
  version: string;
  createdAt: string;
  lastSaved: string;
  lastAutoSave?: string;
  playerId: string;
  saveName: string;
  saveSlot: number;
}

export interface GameSaveData {
  meta: GameSaveMeta;
  player: PlayerState & { name?: string };
  world: WorldState;
  npcs: NPCState[];
  eventLog: EventLogEntry[];
  dialogueHistory: string[];
  progress: GameProgress;
  /** 大事记列表，供生平回顾与 LLM past_milestones */
  history_logs?: HistoryLogEntry[];
  tempData?: Record<string, unknown>;
}
