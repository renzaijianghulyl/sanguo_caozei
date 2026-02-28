/**
 * 世界管理器（WorldManager）：游戏物理规则引擎单例。
 * 接管 saveData.world，统一时间步进、NPC 岁数/生死、区域天气与势力博弈模拟。
 * 纯逻辑、确定性、不依赖 AI。
 */
import type { GameSaveData, NPCState, WorldState } from "@core/state";
import {
  totalDaysToCalendar,
  calendarToTotalDays,
  getSeasonFromMonth
} from "./TimeManager";
import { getWeatherForMonth } from "./WorldStateManager";
import { REGION_DISPLAY_NAMES } from "@config/index";

/** 势力：用于势力博弈模拟 */
export interface Faction {
  id: string;
  name: string;
  /** 野心 0～100，影响扩张倾向 */
  ambition: number;
  /** 兵力/实力 0～100，影响扩张成功率 */
  power: number;
}

/** 可参与归属与天气的区域 key 列表（与 config REGION_DISPLAY_NAMES 一致） */
const REGION_KEYS = Object.keys(REGION_DISPLAY_NAMES);

/** 区域守将：占领时若该 NPC 忠诚度低于阈值则生成「献城」战报。key = regionKey */
const REGION_GOVERNOR: Record<string, { npcId: string; npcName: string }> = {
  chenliu: { npcId: "zhangmiao", npcName: "张邈" }
};

/** 守将忠诚度低于此值时生成「献城」战报（0～100） */
const GOVERNOR_SURRENDER_LOYALTY_THRESHOLD = 40;

/**
 * 势力重力（按年/阶段）：年份区间 -> 势力 id -> 权重 0～1，用于抑制历史崩坏。
 * 权重为 0 时该势力本阶段不扩张。详见 docs/世界管理器与导演系统-增强方案.md
 */
export const HISTORICAL_WEIGHT_STUB: Record<string, Record<string, number>> = {
  "184-189": { caocao: 0, liu_bei: 0, sun_quan: 0, yuan_shao: 0, dong_zhuo: 0.5 },
  "190-199": { caocao: 0.6, liu_bei: 0.3, sun_quan: 0.2, yuan_shao: 0.8, dong_zhuo: 0.9 },
  "200-209": { caocao: 0.9, liu_bei: 0.5, sun_quan: 0.6, yuan_shao: 0.4, dong_zhuo: 0 }
};

/** 季节对应的天气模板（随机抽一项） */
const SEASON_WEATHER: Record<string, string[]> = {
  春: ["春雨", "晴", "阴"],
  夏: ["夏暑", "晴", "风"],
  秋: ["秋燥", "晴", "雨"],
  冬: ["冬雪", "晴", "雪"]
};

/** 极简势力列表：id、名称、野心、实力（用于确定性扩张判定） */
const FACTIONS: Faction[] = [
  { id: "caocao", name: "曹操", ambition: 85, power: 88 },
  { id: "liu_bei", name: "刘备", ambition: 75, power: 70 },
  { id: "sun_quan", name: "孙权", ambition: 72, power: 75 },
  { id: "yuan_shao", name: "袁绍", ambition: 78, power: 82 },
  { id: "dong_zhuo", name: "董卓", ambition: 90, power: 85 }
];

/** 确定性伪随机：同一 seed 始终得到同一序列，用于可复现的势力扩张与天气 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** 根据年份取得势力重力区间 key（与 HISTORICAL_WEIGHT_STUB 一致） */
function getHistoricalWeightKey(year: number): string {
  if (year < 190) return "184-189";
  if (year < 200) return "190-199";
  return "200-209";
}

/**
 * 单例世界管理器
 */
class WorldManagerClass {
  private static _instance: WorldManagerClass | null = null;

  static getInstance(): WorldManagerClass {
    if (WorldManagerClass._instance === null) {
      WorldManagerClass._instance = new WorldManagerClass();
    }
    return WorldManagerClass._instance;
  }

  /**
   * 物理步进：增加 totalDays，映射到 year/month/day，更新 era；
   * 同步 NPC 的 is_alive、current_age；
   * 按季节为各区域刷新天气；
   * 势力博弈：基于 ambition 与 power 做扩张判定，更新 regionStatus 并生成战报。
   * @param saveData 当前存档（只读参考，不直接修改；返回的新 world/npcs 由调用方写回）
   * @param deltaDays 步进天数（通常 7）
   * @returns 新的 world、npcs 与战报摘要数组（一句话客观事实，供 AI 叙事输入）
   */
  updateWorld(
    saveData: GameSaveData,
    deltaDays: number
  ): { world: WorldState; npcs: NPCState[]; reports: string[] } {
    const world = { ...saveData.world };
    const time = world.time ?? { year: 184, month: 1, day: 1 };
    let totalDays = Math.max(0, world.totalDays ?? calendarToTotalDays(time.year, time.month, time.day));
    totalDays += Math.max(0, Math.floor(deltaDays));

    const cal = totalDaysToCalendar(totalDays);
    world.time = { year: cal.year, month: cal.month, day: cal.day };
    world.totalDays = totalDays;
    world.era = String(cal.year);

    const npcs = this.syncNpcsForYear(saveData.npcs ?? [], cal.year);
    this.refreshRegionWeather(world, cal.month, totalDays);
    const reports = this.runFactionSimulator(world, cal.year, cal.month, totalDays, npcs);

    return { world, npcs, reports };
  }

  /**
   * 根据当前年份同步所有 NPC 的 is_alive 与 current_age
   */
  private syncNpcsForYear(npcs: NPCState[], currentYear: number): NPCState[] {
    return npcs.map((n) => {
      const birth = n.birth_year ?? currentYear;
      const death = n.death_year ?? 999;
      const current_age = Math.max(0, currentYear - birth);
      const is_alive = currentYear <= death;
      return { ...n, current_age, is_alive };
    });
  }

  /**
   * 按季节模板为各区域随机刷新天气标签（确定性：seed 基于 totalDays + regionIndex）。
   * 集成 WorldStateManager.getWeatherForMonth 作为当月主天气，再按季节补充随机项。
   */
  private refreshRegionWeather(world: WorldState, month: number, totalDays: number): void {
    const season = getSeasonFromMonth(month);
    const mainWeather = getWeatherForMonth(month);
    const templates = SEASON_WEATHER[season] ?? ["晴"];
    const options = [mainWeather, ...templates.filter((w) => w !== mainWeather)];
    if (!world.regions) world.regions = {};
    REGION_KEYS.forEach((key, i) => {
      const seed = totalDays * 31 + i;
      const idx = Math.floor(seededRandom(seed) * options.length) % options.length;
      const weather = options[idx] ?? "晴";
      const prev = world.regions![key] ?? {};
      world.regions![key] = { ...prev, weather };
    });
  }

  /**
   * 势力博弈模拟：按野心与实力做扩张判定，更新 regionStatus 并返回战报。
   * 使用 HISTORICAL_WEIGHT_STUB 按年份抑制过早扩张（势力重力）；权重为 0 则该势力本回合不扩张。
   */
  private runFactionSimulator(
    world: WorldState,
    year: number,
    month: number,
    totalDays: number,
    npcs: NPCState[] = []
  ): string[] {
    const reports: string[] = [];
    const status = { ...(world.regionStatus ?? {}) };
    const season = getSeasonFromMonth(month);
    const seasonName = season === "春" ? "春" : season === "夏" ? "夏" : season === "秋" ? "秋" : "冬";
    const weightKey = getHistoricalWeightKey(year);
    const weights = HISTORICAL_WEIGHT_STUB[weightKey];

    FACTIONS.forEach((faction, factionIndex) => {
      const weight = weights?.[faction.id];
      if (weight != null && weight <= 0) return;

      const seed = totalDays * 1007 + factionIndex * 31 + year;
      const roll = seededRandom(seed);
      let threshold = (faction.ambition / 100) * (faction.power / 100) * 0.25;
      if (weight != null && weight > 0) {
        threshold = threshold / Math.max(0.01, weight);
      }
      if (roll >= threshold) return;

      const candidateRegions = REGION_KEYS.filter((k) => status[k] !== faction.id);
      if (candidateRegions.length === 0) return;

      const pickSeed = totalDays * 31 + factionIndex + 1;
      const idx = Math.floor(seededRandom(pickSeed) * candidateRegions.length) % candidateRegions.length;
      const regionKey = candidateRegions[idx];
      const governor = REGION_GOVERNOR[regionKey];
      const regionName = REGION_DISPLAY_NAMES[regionKey] ?? regionKey;
      let reportText: string;

      if (governor && npcs.length > 0) {
        const npc = npcs.find((n) => n.id === governor.npcId);
        const loyalty = npc?.loyalty ?? 100;
        if (loyalty < GOVERNOR_SURRENDER_LOYALTY_THRESHOLD) {
          reportText = `${year}年${seasonName}，${governor.npcName}献城，${faction.name}兵不血刃入${regionName}`;
        } else {
          reportText = `${year}年${seasonName}，${faction.name}占领${regionName}`;
        }
      } else {
        reportText = `${year}年${seasonName}，${faction.name}占领${regionName}`;
      }

      reports.push(reportText);
      status[regionKey] = faction.id;
    });

    world.regionStatus = status;
    return reports;
  }

  /** 供测试或外部查询：当前定义的势力列表 */
  getFactions(): Faction[] {
    return [...FACTIONS];
  }

  /** 供测试或外部查询：区域 key 列表 */
  getRegionKeys(): string[] {
    return [...REGION_KEYS];
  }
}

export const WorldManager = WorldManagerClass.getInstance();
export function getWorldManager(): WorldManagerClass {
  return WorldManagerClass.getInstance();
}
