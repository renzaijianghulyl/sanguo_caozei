/**
 * 导演模块（DirectorModule）：将物理数据转化为沉浸式叙事约束。
 * 提供：导演意图（DirectorIntent）、感官词库（SENSORY_BY_WEATHER）、世界传闻上下文形态。
 * 纯逻辑、不依赖 AI；与 eventContextPipeline 配合注入 Prompt。
 */
import type { WorldState } from "@core/state";

/** 基于 WorldState 极端情况生成的导演指示，注入 System 或 event_context */
export interface DirectorIntent {
  /** 注入 System 的导演指示段落 */
  instruction: string;
  /** 触发原因（便于日志与调试） */
  reason?:
    | "recent_war"
    | "disaster"
    | "famine"
    | "heavy_snow"
    | "turmoil"
    | "governor_surrender";
}

/** WorldManager 战报注入 event_context 时的形态（客观句或文学化传闻） */
export interface WorldReportsContext {
  reports: string[];
  literary?: boolean;
}

/** 天气标签 -> 感官短语列表，强制 AI 在场景描述中至少引用其一 */
export const SENSORY_BY_WEATHER: Record<string, string[]> = {
  春雨: ["春雨淅沥", "泥土气息", "新绿萌发"],
  夏暑: ["蝉鸣聒耳", "树影匝地", "汗透衣背"],
  秋燥: ["落叶簌簌", "天高云淡", "燥风拂面"],
  冬雪: ["炉火噼啪", "碎雪声", "呵气成霜", "檐角冰棱"],
  晴: ["日光灼灼", "微风习习"],
  阴: ["云层低垂", "光线晦暗"],
  风: ["风声过耳", "衣袂猎猎"],
  雨: ["雨打屋檐", "泥泞难行"],
  雪: ["大雪纷飞", "炉火、碎雪声"]
};

/**
 * 组合情境 -> 感官短语：天气 + 情境（如战后）时追加的感官，与 SENSORY_BY_WEATHER 合并使用。
 * key 格式："天气|情境"，如 "冬雪|战后"、"雪|战后"。
 */
export const SENSORY_COMBO: Record<string, string[]> = {
  "冬雪|战后": ["血迹在雪中发黑", "冷风吹过残破的旗帜", "硝烟与雪气混杂"],
  "雪|战后": ["血迹在雪中发黑", "冷风吹过残破的旗帜"],
  "春雨|战后": ["泥泞中夹杂铁锈气", "断戟半埋新草"],
  "夏暑|战后": ["尸气与暑气蒸腾", "鸦鸣与蝉鸣交织"],
  "秋燥|战后": ["枯叶与残旗同卷", "风过废墟扬起尘土"]
};

/**
 * 根据天气标签返回感官短语列表；未知标签返回空数组。
 * 若传入 context（如 "战后"），会追加 SENSORY_COMBO 中「天气|context」对应的组合短语。
 */
export function getSensoryForWeather(weather: string, context?: string): string[] {
  if (!weather || typeof weather !== "string") return [];
  const key = weather.trim();
  const base = SENSORY_BY_WEATHER[key] ?? [];
  if (!context || typeof context !== "string") return base;
  const comboKey = `${key}|${context.trim()}`;
  const combo = SENSORY_COMBO[comboKey];
  if (combo?.length) return [...base, ...combo];
  return base;
}

/** 判定「近期战事」：flags 或 history_flags 中含战事相关关键词 */
function hasRecentWarHint(worldState: WorldState): boolean {
  const flags = [...(worldState.flags ?? []), ...(worldState.history_flags ?? [])];
  const warKeywords = ["战", "征", "攻", "占", "兵", "乱", "伐"];
  return flags.some((f) => warKeywords.some((k) => f.includes(k)));
}

/** 判定「大灾/饥荒」：flags 含灾、饥、荒等 */
function hasDisasterHint(worldState: WorldState): boolean {
  const flags = worldState.flags ?? [];
  return flags.some((f) => /灾|饥|荒|旱|涝/.test(f));
}

/** 判定「寒冬/大雪」：当前为冬月且 flags 含雪或寒 */
function hasHeavySnowHint(worldState: WorldState): boolean {
  const month = worldState.time?.month ?? 1;
  const isWinter = month >= 11 || month <= 2;
  const flags = worldState.flags ?? [];
  const snowOrCold = flags.some((f) => /雪|寒|冻/.test(f));
  return isWinter && (snowOrCold || month === 12 || month === 1);
}

/** 判定「动荡」：regionStatus 中多处为 turmoil 或 flags 含乱 */
function hasTurmoilHint(worldState: WorldState): boolean {
  const status = worldState.regionStatus ?? {};
  const turmoilCount = Object.values(status).filter((v) => v === "turmoil").length;
  const flags = worldState.flags ?? [];
  return turmoilCount >= 2 || flags.some((f) => f.includes("乱") || f.includes("turmoil"));
}

/**
 * 根据 worldState 判定是否处于「极端情境」，返回导演指示；否则返回 null。
 * 优先级：近期战事 > 大灾/饥荒 > 寒冬大雪 > 动荡。
 */
export function buildDirectorIntent(worldState: WorldState): DirectorIntent | null {
  if (!worldState) return null;

  if (hasRecentWarHint(worldState)) {
    return {
      instruction:
        "【导演指示】当前由于连年征战，百姓困苦，请在 NPC 对话与场景描写中体现这种压抑、疲惫与人心惶惶的气氛，避免轻快的调侃。",
      reason: "recent_war"
    };
  }

  if (hasDisasterHint(worldState)) {
    return {
      instruction:
        "【导演指示】当前正值大灾之年，叙事须体现民生凋敝、粮价飞涨与人心惶惶，NPC 可提及逃荒、施粥或官府赈济等。",
      reason: "disaster"
    };
  }

  if (hasHeavySnowHint(worldState)) {
    return {
      instruction:
        "【导演指示】当前天寒地冻，叙事中须自然融入炉火、碎雪声、呵气成霜等感官细节，营造冬日氛围。",
      reason: "heavy_snow"
    };
  }

  if (hasTurmoilHint(worldState)) {
    return {
      instruction:
        "【导演指示】当前多地动荡，叙事中可体现路人议论、流民或城防紧张，NPC 态度偏谨慎。",
      reason: "turmoil"
    };
  }

  return null;
}

/**
 * 动态氛围值（紧张度 0～1）：根据近期战报数量与战事相关 flags 计算，供 event_context.atmosphere_tension 与导演指示使用。
 * 详见 docs/世界管理器与导演系统-增强方案.md
 */
export function computeTension(
  worldState: WorldState,
  recentReportsCount: number = 0
): number {
  const flags = [...(worldState.flags ?? []), ...(worldState.history_flags ?? [])];
  const warFlagCount = flags.filter((f) =>
    ["战", "征", "攻", "占", "兵", "乱", "伐"].some((k) => f.includes(k))
  ).length;
  const fromReports = Math.min(1, recentReportsCount / 5) * 0.4;
  const fromFlags = Math.min(1, warFlagCount * 0.2) * 0.3;
  return Math.min(1, Math.max(0, fromReports + fromFlags + 0.1));
}
