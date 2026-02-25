/**
 * 立志阶段：将玩家输入的愿望修正为三国语境并解析为结构化目标。
 * 防止「开挖掘机」等出戏愿望，映射为时代合理表述（如研制机关器械）。
 */
import type { Aspiration, PrimaryGoalType } from "@core/state";

/** 出戏词汇 -> 三国语境下的合理替代（用于 sanitize） */
const OUT_OF_UNIVERSE_MAP: [RegExp | string, string][] = [
  ["挖掘机", "能崩山碎石的机关器械"],
  ["开挖掘机", "研制机关器械、兴修水利"],
  ["飞机|高铁|手机|电脑|互联网", "奇巧机关与传信之术"],
  ["当网红|直播", "名动一方、说书传名"],
  ["炒股|期货", "经商囤积、低买高卖"]
];

/** 关键词 -> primary_goal */
const GOAL_KEYWORDS: { pattern: RegExp; goal: PrimaryGoalType }[] = [
  { pattern: /富甲天下|经商|商人|赚钱|财富|货殖|商贾/, goal: "wealth" },
  { pattern: /一统|霸业|逐鹿|争霸|平定天下|王霸/, goal: "unify" },
  { pattern: /割据|守一方|安居|保境|偏安/, goal: "fortress" },
  { pattern: /名士|著书|留名|贤才|文名|隐士/, goal: "scholar" }
];

/** 关键词 -> career_path 标签 */
const CAREER_KEYWORDS: { pattern: RegExp; path: string }[] = [
  { pattern: /经商|商人|倒卖|商队/, path: "MERCHANT" },
  { pattern: /从军|将军|领兵|征战/, path: "WARLORD" },
  { pattern: /入仕|为官|出仕|幕僚/, path: "OFFICIAL" },
  { pattern: /隐居|耕读|田园/, path: "HERMIT" }
];

/** 地名 -> target_location */
const LOCATION_KEYWORDS: { pattern: RegExp; location: string }[] = [
  { pattern: /洛阳/, location: "LUOYANG" },
  { pattern: /许昌|许都/, location: "XUCHANG" },
  { pattern: /长安/, location: "CHANGAN" },
  { pattern: /邺城/, location: "YE" },
  { pattern: /成都|益州/, location: "CHENGDU" },
  { pattern: /建业|江东|吴/, location: "JIANYE" }
];

/**
 * 将玩家输入的愿望修正为三国语境，防止出戏表述。
 */
export function sanitizeAspirationInput(raw: string): string {
  let text = raw.trim().slice(0, 200);
  for (const [key, replacement] of OUT_OF_UNIVERSE_MAP) {
    const re = typeof key === "string" ? new RegExp(key, "gi") : key;
    text = text.replace(re, replacement);
  }
  return text.trim() || "在这乱世中寻一条活路，再图后计。";
}

/**
 * 从愿望文本解析出 primary_goal、career_path、target_location。
 */
export function parseAspirationIntent(text: string): {
  primary_goal: PrimaryGoalType;
  career_path?: string;
  target_location?: string;
} {
  let primary_goal: PrimaryGoalType = "other";
  let career_path: string | undefined;
  let target_location: string | undefined;

  for (const { pattern, goal } of GOAL_KEYWORDS) {
    if (pattern.test(text)) {
      primary_goal = goal;
      break;
    }
  }
  for (const { pattern, path } of CAREER_KEYWORDS) {
    if (pattern.test(text)) {
      career_path = path;
      break;
    }
  }
  for (const { pattern, location } of LOCATION_KEYWORDS) {
    if (pattern.test(text)) {
      target_location = location;
      break;
    }
  }

  return { primary_goal, career_path, target_location };
}

/**
 * 根据解析结果生成一句 destiny_goal 文案，供持久化与注入 Prompt。
 */
export function buildDestinyGoal(
  sanitizedText: string,
  parsed: { primary_goal: PrimaryGoalType; career_path?: string; target_location?: string }
): string {
  const { primary_goal, career_path, target_location } = parsed;
  if (sanitizedText.length >= 10 && sanitizedText.length <= 80) {
    return sanitizedText;
  }
  const parts: string[] = [];
  if (primary_goal === "wealth") parts.push("在乱世中富甲天下、以财势左右时局");
  else if (primary_goal === "unify") parts.push("逐鹿天下、一统四海");
  else if (primary_goal === "fortress") parts.push("割据一方、保境安民");
  else if (primary_goal === "scholar") parts.push("结交贤才、著书立说、留名青史");
  else parts.push("在乱世中立足、再图心中所愿");

  if (career_path === "MERCHANT") parts.push("以商贾之道");
  if (target_location === "LUOYANG") parts.push("终有一日立足洛阳");
  else if (target_location === "XUCHANG") parts.push("或投许都一展所长");

  return parts.length > 0 ? parts.join("，") + "。" : sanitizedText;
}

/**
 * 一站式：修正 + 解析 + 生成 Aspiration 对象。
 */
export function resolveAspiration(rawInput: string): Aspiration {
  const sanitized = sanitizeAspirationInput(rawInput);
  const parsed = parseAspirationIntent(sanitized);
  const destiny_goal = buildDestinyGoal(sanitized, parsed);
  return {
    destiny_goal,
    primary_goal: parsed.primary_goal,
    career_path: parsed.career_path,
    target_location: parsed.target_location
  };
}
