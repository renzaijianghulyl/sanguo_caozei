import type { AmbitionType, GameSaveData, NPCState, PlayerState, WorldState } from "@core/state";
import { initBondEngine } from "../core/BondSystem";
import { getSuggestedActions } from "../data/actionSuggestions";

export const DEFAULT_PLAYER_STATE: PlayerState = {
  id: "player_001",
  /** 默认出生年，184 年时 15 岁，满足义结金兰/结婚年龄门槛 */
  birth_year: 169,
  attrs: {
    strength: 75,
    intelligence: 82,
    charm: 68,
    luck: 55
  },
  legend: 30,
  tags: ["civilian"],
  reputation: 50,
  resources: {
    gold: 0,
    food: 0,
    soldiers: 0
  },
  location: {
    region: "yingchuan",
    scene: "village"
  },
  stamina: 80,
  active_titles: []
};

export const DEFAULT_WORLD_STATE: WorldState = {
  era: "184",
  flags: ["taipingdao_spread=high"],
  history_flags: [],
  time: {
    year: 184,
    month: 2,
    day: 1
  },
  regionStatus: {
    jingzhou: "stable",
    yuzhou: "turmoil",
    jizhou: "stable"
  }
};

/** 通用引子：所有志向都先播放这句，再切入专属独白 */
export const GAME_INTRO_COMMON = `公元一八四年，汉室倾颓，黄巾四起。
一道流光闪过，你已不再是那个世界的匆匆过客……`;

/** 立志阶段系统提问（开局创角后强制进入） */
export const ASPIRATION_QUESTION = "阁下此番入世，所求为何？";

/** 新档开场第一段：游戏玩法与人物属性作用 */
export const INTRO_PART1 = `本作中，你将以文字与群雄博弈：在输入框写下你的意图（如「前往洛阳」「结识曹操」），即可推进剧情；时间会随选择流逝，世界随之变化。
你的武力影响战局与威慑，智力影响谋略与说服，魅力影响结交与声望，运势则暗藏机缘。善用属性，在这乱世中走出自己的道路。`;

/** 地区 key -> 展示名（供开场、预裁决中解析当前区域类型与旅行耗时） */
export const REGION_DISPLAY_NAMES: Record<string, string> = {
  yingchuan: "颍川",
  luoyang: "洛阳",
  jingzhou: "荆州",
  jizhou: "冀州",
  yuzhou: "豫州",
  zhuoxian: "涿县"
};
export const SCENE_DISPLAY_NAMES: Record<string, string> = {
  village: "村庄",
  city: "城内",
  camp: "营地",
  inn: "客栈",
  temple: "庙宇",
  prison: "牢狱"
};

/** 新档开场第二段：穿越·懵·沙箱自由（固定叙事）+ 当前现状（时间地点周遭下一步） */
const INTRO_SEGMENT2_NARRATIVE = `你悠悠转醒，脑中只剩些许前世的残影，身在何处、今夕何年，一时恍惚。四下望去，古装行人、土路矮屋——这不是你熟悉的世界。
很快你便意识到：此地虽是乱世，却也是一方由你书写的「文字沙箱」。你既已穿越而来，前缘已断，何去何从皆由你定。想逐鹿天下、一统三国，可以；想结交豪杰、在乱世里谈一场姻缘，也可以。读书入仕、经商致富、归隐田园……命运之笔，正握在你手中。`;

export function getIntroSegment2CurrentSituation(saveData: GameSaveData | null): string {
  if (!saveData?.player?.location || !saveData?.world?.time) {
    return `${INTRO_SEGMENT2_NARRATIVE}\n\n你身在乱世之中，前路未卜，却处处是可能。`;
  }
  const time = saveData.world.time;
  const year = time.year ?? 184;
  const month = time.month ?? 1;
  const region = saveData.player.location.region ?? "yingchuan";
  const scene = saveData.player.location.scene ?? "village";
  const stamina = saveData.player.stamina ?? 80;
  const regionName = REGION_DISPLAY_NAMES[region] ?? region;
  const sceneName = SCENE_DISPLAY_NAMES[scene] ?? scene;
  const [a1, a2] = getSuggestedActions(region, scene, stamina);
  const npcsHere = saveData.npcs?.filter((n) => n.location === regionName).slice(0, 3) ?? [];
  const who = npcsHere.length > 0 ? `周遭可见${npcsHere.map((n) => n.name).filter(Boolean).join("、")}等人。` : "周遭乡民往来。";
  const situation = `此刻是公元${year}年${month}月，你身在${regionName}的${sceneName}中。${who}前路未卜，却处处是可能。接下来你可以「${a1}」「${a2}」。`;
  return `${INTRO_SEGMENT2_NARRATIVE}\n\n${situation}`;
}

/** 新档开场仅两段叙事（玩法 + 当前现状），输入提示改为输入区上方固定小字，不占对话气泡 */
export function getIntroSequence(saveData?: GameSaveData | null): [string, string] {
  return [
    INTRO_PART1,
    getIntroSegment2CurrentSituation(saveData ?? null)
  ];
}

/** 志向专属开场文案：根据 player_state.ambition 动态加载 */
export const GAME_INTRO_AMBITIONS: Record<AmbitionType, string> = {
  unify: `……而今，你竟以异世之魂，降临这乱世。
穿越三国，书写自己的霸业传奇！

你心怀统一天下的宏图伟愿，欲凭一己之力，挽狂澜于既倒。
核心玩法：通过与名士豪杰的对话、合纵连横的策略，以及行军征伐的武力，逐步吞并州郡，最终定鼎中原。
游玩目标：发展势力，逐鹿天下，直至一统四海，建立不朽王朝！`,

  wealth: `……而今，你竟以异世之魂，降临这乱世。
穿越三国，书写自己的商道传奇！

你深知乱世之中，唯财力可动人心。欲凭敏锐商机与雄厚资产，左右天下局势。
核心玩法：在各城池之间低买高卖，囤积居奇；投资产业，广布商路；甚至资助一方诸侯，以财富影响战局。
游玩目标：积累万贯家财，成为掌控天下经济命脉的无冕之王！`,

  fortress: `……而今，你竟以异世之魂，降临这乱世。
穿越三国，书写自己的安居传奇！

你厌倦纷争，只想守住一方乐土，让治下百姓安居乐业，不被战火侵扰。
核心玩法：巩固城池防御，发展农业与民生，培养忠诚的将领与百姓，对外则合纵连横，寻求盟友，共同抵御外敌。
游玩目标：建立一座固若金汤的理想之城，让乱世中的一方百姓，皆能沐浴在你的贤明治下！`,

  scholar: `……而今，你竟以异世之魂，降临这乱世。
穿越三国，书写自己的名士传奇！

你无意争霸天下，但求结交天下贤才，游历名山大川，著书立说，留下千古美名。
核心玩法：周游列国，寻访隐士高人，与诸侯名将煮酒论道；以文会友，以言语化解干戈，以智慧影响时局。
游玩目标：结交天下英豪，学识渊博，留下传世著作，成为受人景仰的乱世名士！`
};

/** 开场提示结尾：引导玩家输入（曾作为对话气泡，现改为输入区上方固定小字） */
export const GAME_INTRO_HINT =
  "【提示】在下方输入框输入你的意图（如「前往洛阳」「结识豪杰」），点击发送即可推进剧情。";

/** 输入区上方固定提示文案（不占对话区，仅首屏/未发送过时显示） */
export const INPUT_HINT_FIXED =
  "在下方输入框输入你的意图（如「前往洛阳」「结识豪杰」），点击发送即可推进剧情。";

/** 新游戏开场文案（通用引子；志向已移除，不再按志向拼接专属独白） */
export function getGameIntroText(): string {
  return GAME_INTRO_COMMON;
}

/** 开场提示文案总览：供 initGame 动态加载 */
export const GAME_INTRO_TEXT = {
  common: GAME_INTRO_COMMON,
  hint: GAME_INTRO_HINT,
  getIntro: getGameIntroText
} as const;

/** 角色创建：每项属性基础值 */
export const ATTR_BASE = 50;
/** 角色创建：可分配点数 */
export const ATTR_BONUS_POINTS = 20;

/** 新存档首条「天之启示」，使命驱动型引导 */
export const HEAVEN_REVELATION = [
  "主公，你正置身于一个真实的 184 年。在这里，你的每一句话都将被底层逻辑审视。",
  "你可以通过文字与群雄博弈，也可以选择闭关修炼感悟天时。切记，时间流逝会带来世界的剧变，请慎重你的每一个决策。"
];

/** 开局旁白与新手引导，新档/首次进入时显示（已清空，不再展示默认开场文案） */
export const INITIAL_DIALOGUE: string[] = [];

/** 新档专用：天之启示 + 场景描写，替代纯 INITIAL_DIALOGUE */
export const NEW_SAVE_INITIAL_DIALOGUE = [...HEAVEN_REVELATION, ...INITIAL_DIALOGUE];

/**
 * 安全叙事规范：注入到裁决请求的 event_context，供云函数拼进 Prompt，从源头减少敏感表述。
 * 微信审核规则会动态调整，建议：1）定期根据审核失败日志补充「避免用语」；2）战争/生死用意象与典故带过。
 */
export const NARRATIVE_SAFETY_INSTRUCTION =
  "【安全叙事】叙事须符合平台内容规范。请用古风、含蓄笔法：战争与伤亡用意象或典故带过（如「兵戈所及」「烽烟散尽」），避免直白描写血腥、暴力细节；不涉及现实政治、色情、违法内容。在保持三国史诗感的前提下，优先通过审核。";

/** 来自三国结构化数据库 184 年剧本的默认 NPC 列表（含 Bond 与 relations，由 initBondEngine 生成） */
export const DEFAULT_NPC_STATE: NPCState[] = initBondEngine(184);

/** 安全读取环境变量，微信小游戏无 process 时不抛错（不直接引用 process 避免 ReferenceError） */
const _env: Record<string, string | undefined> = (() => {
  try {
    const g = typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : {});
    const p = (g as Record<string, unknown>).process;
    return p && typeof p === "object" && p !== null && "env" in p ? (p as { env: Record<string, string | undefined> }).env || {} : {};
  } catch {
    return {};
  }
})();

export const ClientConfig = {
  /** 云开发环境 ID，用于 wx.cloud.callFunction。在云开发控制台标题栏可见 */
  CLOUD_ENV: _env.CLOUD_ENV || "cloud1-3gfb9ep2701c4857",
  /** HTTP 模式时的裁决 API 地址；使用云函数时可留空 */
  ADJUDICATION_API: _env.ADJUDICATION_API || "http://localhost:3000/intent/resolve",
  MAX_RETRIES: 2,
  RETRY_DELAY: 1_000,
  REQUEST_TIMEOUT: 15_000,
  DEBUG: _env.NODE_ENV !== "production",
  /** 真机调试：为 true 时点击任意处会弹出 Toast 显示坐标。构建时: DEBUG_TOUCH=1 npm run build */
  DEBUG_TOUCH: _env.DEBUG_TOUCH === "true",
  /** 激励视频广告位 ID，上线时在微信公众平台申请后替换 */
  AD_UNIT_ID: _env.AD_UNIT_ID || "adunit-1234567890abcdef",
  DEFAULT_PLAYER_STATE,
  DEFAULT_WORLD_STATE,
  DEFAULT_NPC_STATE
};

export type ClientConfigShape = typeof ClientConfig;

export default ClientConfig;
