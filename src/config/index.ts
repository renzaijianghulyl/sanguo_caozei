import type { NPCState, PlayerState, WorldState } from "@core/state";

export const DEFAULT_PLAYER_STATE: PlayerState = {
  id: "player_001",
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
    gold: 100,
    food: 200,
    soldiers: 0
  },
  location: {
    region: "yingchuan",
    scene: "village"
  }
};

export const DEFAULT_WORLD_STATE: WorldState = {
  era: "184",
  flags: ["taipingdao_spread=high"],
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

/** 开局旁白与新手引导，新档/首次进入时显示 */
export const INITIAL_DIALOGUE = [
  "建宁元年（公元168年），你醒来发现自己身处洛阳城外的小村庄。",
  "村中长者告诉你，黄巾之乱即将爆发，天下将乱。",
  "你可以选择投靠官府，也可以暗中结交豪杰，甚至加入太平道……",
  "【提示】在下方输入框输入你的意图（如「前往洛阳」「结识豪杰」），点击发送即可推进剧情。"
];

export const DEFAULT_NPC_STATE: NPCState[] = [
  {
    id: "caocao",
    name: "曹操",
    stance: "neutral",
    trust: 30,
    location: "luoyang"
  },
  {
    id: "liubei",
    name: "刘备",
    stance: "friendly",
    trust: 50,
    location: "zhuoxian"
  }
];

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
