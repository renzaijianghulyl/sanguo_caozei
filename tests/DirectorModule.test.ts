import { describe, expect, it } from "vitest";
import {
  buildDirectorIntent,
  getSensoryForWeather,
  SENSORY_BY_WEATHER
} from "../src/core/DirectorModule";
import type { WorldState } from "../src/core/state";

describe("DirectorModule", () => {
  describe("getSensoryForWeather", () => {
    it("返回已知天气标签对应的感官短语列表", () => {
      expect(getSensoryForWeather("冬雪")).toEqual(["炉火噼啪", "碎雪声", "呵气成霜", "檐角冰棱"]);
      expect(getSensoryForWeather("夏暑")).toEqual(["蝉鸣聒耳", "树影匝地", "汗透衣背"]);
      expect(getSensoryForWeather("晴")).toEqual(["日光灼灼", "微风习习"]);
    });
    it("未知天气返回空数组", () => {
      expect(getSensoryForWeather("未知")).toEqual([]);
      expect(getSensoryForWeather("")).toEqual([]);
    });
  });

  describe("buildDirectorIntent", () => {
    it("无极端情境时返回 null", () => {
      const world: WorldState = {
        era: "184",
        flags: [],
        time: { year: 184, month: 5, day: 1 },
        regionStatus: { jingzhou: "stable" }
      };
      expect(buildDirectorIntent(world)).toBeNull();
    });

    it("flags 含战事关键词时返回 recent_war 导演指示", () => {
      const world: WorldState = {
        era: "190",
        flags: ["战后"],
        time: { year: 190, month: 3, day: 1 },
        regionStatus: {}
      };
      const r = buildDirectorIntent(world);
      expect(r).not.toBeNull();
      expect(r!.reason).toBe("recent_war");
      expect(r!.instruction).toContain("导演指示");
      expect(r!.instruction).toMatch(/征战|压抑|疲惫/);
    });

    it("flags 含灾/饥时返回 disaster 导演指示", () => {
      const world: WorldState = {
        era: "194",
        flags: ["饥荒"],
        time: { year: 194, month: 6, day: 1 },
        regionStatus: {}
      };
      const r = buildDirectorIntent(world);
      expect(r).not.toBeNull();
      expect(r!.reason).toBe("disaster");
      expect(r!.instruction).toMatch(/大灾|民生|凋敝/);
    });

    it("冬月且 flags 含雪/寒时返回 heavy_snow 导演指示", () => {
      const world: WorldState = {
        era: "184",
        flags: ["大雪"],
        time: { year: 184, month: 12, day: 1 },
        regionStatus: {}
      };
      const r = buildDirectorIntent(world);
      expect(r).not.toBeNull();
      expect(r!.reason).toBe("heavy_snow");
      expect(r!.instruction).toMatch(/炉火|碎雪|呵气成霜/);
    });

    it("regionStatus 多处 turmoil 时返回 turmoil 导演指示", () => {
      const world: WorldState = {
        era: "190",
        flags: [],
        time: { year: 190, month: 5, day: 1 },
        regionStatus: { a: "turmoil", b: "turmoil", c: "stable" }
      };
      const r = buildDirectorIntent(world);
      expect(r).not.toBeNull();
      expect(r!.reason).toBe("turmoil");
    });
  });

  describe("SENSORY_BY_WEATHER", () => {
    it("包含设计草案中的主要天气键", () => {
      expect(Object.keys(SENSORY_BY_WEATHER)).toContain("春雨");
      expect(Object.keys(SENSORY_BY_WEATHER)).toContain("冬雪");
      expect(Object.keys(SENSORY_BY_WEATHER)).toContain("雪");
    });
  });
});
