/**
 * 时间解析器：从玩家意图解析动作消耗的月数。
 * 供 actionProcessor 与 preAdjudicator 使用。
 * 移动类意图可结合区域类型计算耗时（大都市/一般/关隘），否则按显式文案或默认 1 月。
 * 当玩家动作涉及地点切换时，snapshot 会在 event_context 中注入 travel_minimal_hours（如 2）
 * 并要求 LLM 描写旅途的视觉变化，保证动作连贯性。
 */

/** 区域类型到移动耗时的月数：从 fromType 到 toType 的行程月数（不足 1 月按 1 月计） */
const TRAVEL_MONTHS_BY_TYPE: Record<string, Record<string, number>> = {
  大都市: { 大都市: 1, 一般: 1, 关隘: 1 },
  一般: { 大都市: 1, 一般: 1, 关隘: 1 },
  关隘: { 大都市: 1, 一般: 1, 关隘: 1 }
};

/** 根据起止区域类型计算移动逻辑耗时（月数）。未知类型按「一般」处理。 */
export function computeTravelMonths(fromRegionType: string, toRegionType: string): number {
  const from =
    fromRegionType && fromRegionType in TRAVEL_MONTHS_BY_TYPE ? fromRegionType : "一般";
  const to = toRegionType && toRegionType in TRAVEL_MONTHS_BY_TYPE ? toRegionType : "一般";
  return TRAVEL_MONTHS_BY_TYPE[from]?.[to] ?? 1;
}

const NUM_ZH: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 廿: 20, 三十: 30, 四十: 40, 五十: 50, 百: 100
};

function parseMonthsFromText(text: string): number {
  const t = text.replace(/\s/g, "");
  const m1 = t.match(/(\d+)\s*月/);
  if (m1) return Math.min(24, Math.max(1, parseInt(m1[1], 10)));

  const m2 = t.match(/([一二两三四五六七八九十廿]+)\s*[个月]?/);
  if (m2) {
    const s = m2[1];
    if (s === "半") return 6;
    const n = NUM_ZH[s] ?? 0;
    return n > 0 ? Math.min(24, n) : 0;
  }
  return 0;
}

function parseYearsFromText(text: string): number {
  const t = text.replace(/\s/g, "");
  const m1 = t.match(/(\d+)\s*[年载]/);
  if (m1) return Math.min(100, Math.max(0, parseInt(m1[1], 10)));

  const m2 = t.match(/([一二两三四五六七八九十廿百]+)\s*[年载]/);
  if (m2) {
    const s = m2[1];
    if (s === "十" || s === "十年") return 10;
    if (s.includes("十")) {
      const [a, b] = s.split("十");
      const n = (NUM_ZH[a] || 0) * 10 + (NUM_ZH[b] || 0);
      return Math.min(100, Math.max(0, n || 10));
    }
    return Math.min(100, Math.max(0, NUM_ZH[s] ?? 0));
  }
  const m3 = t.match(/(?:过了|过去|历经|经过)\s*(\d+)\s*年/);
  if (m3) return Math.min(100, Math.max(0, parseInt(m3[1], 10)));
  const m4 = t.match(/(\d+)\s*年后/);
  if (m4) return Math.min(100, Math.max(0, parseInt(m4[1], 10)));
  return 0;
}

/** 零耗时意图：观察、尾随、攀谈、潜入等即时动作，不推进时间 */
function isZeroTimeIntent(intent: string): boolean {
  const t = intent.trim();
  return (
    /观察|尾随|攀谈|潜入|盯梢|打听|探听|查探|夜探|贿赂|拜会|请教|询问|暗中观察|速退|暂避/.test(t) ||
    /探听风声|打听消息|打听风声|探听消息/.test(t)
  );
}

/**
 * 解析动作消耗月数：行军2月、闭关十年等。
 * 观察/尾随/攀谈/潜入等即时动作返回 0；仅闭关、等待、前往远方（跨区域）或显式「N月」「N年」才加时。
 */
export function parseTimeCost(
  intent: string,
  travelContext?: { fromRegionType?: string; toRegionType?: string }
): number {
  const t = intent.trim();
  if (isZeroTimeIntent(t)) return 0;

  const isTravel =
    /前往|去|到|旅行|云游|游历|赶路|跋涉|行军|出征|进军|投奔|启程|上路/.test(t);
  const isCultivation = /修炼|闭关|苦练|修行|读书|钻研|参悟|静修|隐居/.test(t);
  const isExplicitWait = /等待\s*(\d+)\s*[月年]|等候\s*(\d+)\s*[月年]/.test(t);

  if (isTravel && travelContext?.fromRegionType != null && travelContext?.toRegionType != null) {
    const months = computeTravelMonths(travelContext.fromRegionType, travelContext.toRegionType);
    if (months > 0) return months;
  }

  const months = parseMonthsFromText(t);
  if (months > 0 && (isTravel || isExplicitWait || /行军|赶路|跋涉|月/.test(t))) return months;

  const years = parseYearsFromText(t);
  if (years > 0) return Math.min(1200, years * 12);
  if (isCultivation) return 12;
  if (isTravel) return 1;
  return 0;
}

/**
 * 是否为涉及地点切换的移动意图。
 * 用于 snapshot 注入 travel_minimal_hours 与旅途视觉描写要求。
 */
export function isLocationSwitchIntent(intent: string): boolean {
  const t = intent.trim();
  return /前往|去|到|旅行|云游|游历|赶路|跋涉|行军|出征|进军|投奔|启程|上路/.test(t);
}

/**
 * 内测阶段：每回合固定消耗 1 点行动力；正式上线后可恢复按意图区分消耗，不足时引导看广告补充。
 */
export function getStaminaCost(_intent: string): number {
  return 1;
}
