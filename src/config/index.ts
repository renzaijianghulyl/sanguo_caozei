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

export const ClientConfig = {
  ADJUDICATION_API: process.env.ADJUDICATION_API || "http://localhost:3000/intent/resolve",
  MAX_RETRIES: 2,
  RETRY_DELAY: 1_000,
  REQUEST_TIMEOUT: 15_000,
  DEBUG: process.env.NODE_ENV !== "production",
  DEFAULT_PLAYER_STATE,
  DEFAULT_WORLD_STATE,
  DEFAULT_NPC_STATE
};

export type ClientConfigShape = typeof ClientConfig;

export default ClientConfig;
