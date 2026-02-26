/**
 * 指令与叙事策略相关阈值与常量，集中配置便于调参与单测。
 * 新规则优先在此增加常量，避免在 snapshot / preAdjudicator 中写死魔法数字。
 */

/** 对话轮数超过此值则注入「建议摘要」提示，用于上下文压缩 */
export const DIALOGUE_ROUNDS_THRESHOLD = 10;

/** 文案去重：最近 N 条 system 叙事参与关键词重合度检测 */
export const DIVERSITY_LOOKBACK_LINES = 5;
/** 文案去重：平均关键词重合度超过此值则强制切换叙事流派 */
export const DIVERSITY_OVERLAP_THRESHOLD = 0.7;
/** 文案去重：至少需要多少条叙事才做重合度计算 */
export const DIVERSITY_MIN_LINES = 3;

/** 逻辑冲突计数达到此值后，切换为「嘲讽/无视/精神错乱」叙事语气 */
export const LOGIC_CONFLICT_HIGH_THRESHOLD = 3;

/** 重伤/断粮/中毒时，战斗与移动类意图的成功率修正（-0.5 = 降 50%） */
export const DEBUFF_SUCCESS_RATE_MODIFIER = -0.5;

/** 志向对齐：每 N 轮注入一次「是否朝志向前进」的 NPC 提醒 */
export const ASPIRATION_ALIGNMENT_ROUND_INTERVAL = 10;

/** 近期大事记条数，供 event_context.past_milestones */
export const PAST_MILESTONES_COUNT = 3;

/** event_context 指令条数上限（可选，用于防止无界膨胀；0 表示不限制） */
export const MAX_EVENT_CONTEXT_INSTRUCTION_KEYS = 0;

// ---------- 叙事多样性引擎 ----------
/** 关键词去重：最近 N 轮系统叙事参与堆栈 */
export const NARRATIVE_DIVERSITY_LOOKBACK_ROUNDS = 10;
/** 负向约束：禁止重复使用堆栈中词汇的轮数 */
export const NARRATIVE_NEGATIVE_CONSTRAINT_ROUNDS = 3;
/** 堆栈中保留的高频词数量（用于生成严禁词表） */
export const NARRATIVE_KEYWORDS_STACK_TOP_N = 15;
/** 视角切换：连续 N 轮第三人称后强制切换 */
export const NARRATIVE_PERSPECTIVE_SWITCH_AFTER_ROUNDS = 3;

// ---------- 硬核生理阻力 ----------
/** 健康度低于此值且为高耗能动作时强制判定失败 */
export const PHYSIOLOGY_HEALTH_FAIL_THRESHOLD = 20;
/** 饥饿度高于此值且为高耗能动作时强制判定失败（饥饿度 0=饱腹 100=断粮） */
export const PHYSIOLOGY_HUNGER_FAIL_THRESHOLD = 80;
/** 满体力时的健康基值（用于与 status 折算） */
export const PHYSIOLOGY_STAMINA_BASE = 100;

// ---------- 中长期记忆联觉唤醒 ----------
/** 对话轮数超过此值才注入 memory_resonance（联觉唤醒） */
export const MEMORY_RESONANCE_MIN_ROUNDS = 50;

// ---------- 游戏结束条件 ----------
/** 世界年份超过「开局年+60」则判定游戏结束（时代更迭） */
export const GAME_OVER_WORLD_YEARS_FROM_START = 60;
/** 世界开局基准年，用于计算 60 年上限 */
export const GAME_OVER_WORLD_START_YEAR = 184;
/** 世界年份达到此值则判定「三国归晋」游戏结束 */
export const GAME_OVER_WORLD_YEAR_JIN = 280;
