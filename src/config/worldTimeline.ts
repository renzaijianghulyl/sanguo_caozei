/**
 * 三国历史大事表，来自三国结构化数据库（outputs_三国结构化数据库_184-280年_完整版）。
 * 供逻辑层在时间跳跃时自动标记已发生事件。
 */

export {
  getEventsInRange,
  getEventsInRangeWithDetails,
  getRandomRumorHints,
  getUpcomingRumors,
  TIME_YEAR_MIN,
  TIME_YEAR_MAX,
  type TimelineEvent,
  type TimelineEventWithDetails
} from "../data/sanguoDb/timeline";
