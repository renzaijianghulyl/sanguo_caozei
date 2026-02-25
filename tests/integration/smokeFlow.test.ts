/**
 * 全流程 Smoke 测试：验证 gameApp 裁决链路与新增模块无运行时错误
 */
import { describe, expect, it } from "vitest";

import { buildAdjudicationPayload } from "@core/snapshot";
import { processPlayerAction } from "@core/actionProcessor";
import { getSuggestedActions } from "@data/actionSuggestions";
import { getDeceasedNPCsInRange } from "@data/sanguoDb";
import { getRandomRumorHints } from "@config/worldTimeline";
import { parseTimeCost } from "@core/timeParser";
import { createUILayout } from "@ui/layout";
import { createSplashLayout } from "@ui/splash";

describe("Smoke Flow - 无运行时错误", () => {
  it("processPlayerAction 链与 applyHardConstraints 等价且不抛错", () => {
    const saveData = {
      meta: { version: "1.0.0", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
      player: {
        id: "p1",
        attrs: { strength: 70, intelligence: 75, charm: 60, luck: 50 },
        legend: 20,
        tags: [],
        reputation: 40,
        resources: { gold: 100, food: 200, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" }
      },
      world: { era: "184", flags: [], time: { year: 184, month: 2, day: 1 } },
      npcs: [],
      eventLog: [],
      dialogueHistory: [],
      progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
    };

    const payload = buildAdjudicationPayload({ saveData, playerIntent: "闭关 3 年" });
    const result = processPlayerAction(payload);

    expect(result).toBeDefined();
    expect(result.world_state?.time?.year).toBe(187);
    expect(result.logical_results?.time_passed).toBe(3);
  });

  it("getSuggestedActions 在不同场景下返回 2 个字符串", () => {
    const r1 = getSuggestedActions("yingchuan", "village");
    expect(r1).toHaveLength(2);
    expect(r1.every((s) => typeof s === "string" && s.length > 0)).toBe(true);

    const r2 = getSuggestedActions("luoyang", "city");
    expect(r2).toHaveLength(2);
    expect(r2).toContain("打探朝局");

    const r3 = getSuggestedActions("unknown", "unknown");
    expect(r3).toHaveLength(2);
    expect(r3).toContain("前往洛阳");

    const r4 = getSuggestedActions("yingchuan", "village", 10);
    expect(r4).toContain("休息恢复");
  });

  it("getDeceasedNPCsInRange 返回字符串数组", () => {
    const names = getDeceasedNPCsInRange(184, 190);
    expect(Array.isArray(names)).toBe(true);
    expect(names.every((n) => typeof n === "string")).toBe(true);
  });

  it("parseTimeCost 正确解析常见意图", () => {
    expect(parseTimeCost("闭关 2 年")).toBe(24);
    expect(parseTimeCost("行军 3 月")).toBe(3);
    expect(parseTimeCost("打听消息")).toBe(0); // 即时动作，不推进时间
  });

  it("getRandomRumorHints 返回传闻字符串数组", () => {
    const rumors = getRandomRumorHints(184, 190, ["黄巾起义爆发"], 2);
    expect(Array.isArray(rumors)).toBe(true);
    expect(rumors.length).toBeLessThanOrEqual(2);
    rumors.forEach((r) => {
      expect(typeof r).toBe("string");
      expect(r).toMatch(/听说/);
    });
  });

  it("createUILayout 包含 actionGuideSlot", () => {
    const layout = createUILayout(375, 667);
    expect(layout.actionGuideSlot).toBeDefined();
    expect(layout.actionGuideSlot.x).toBeGreaterThanOrEqual(0);
    expect(layout.actionGuideSlot.width).toBeGreaterThan(0);
    expect(layout.actionGuideSlot.height).toBeGreaterThan(0);
  });

  it("createSplashLayout 包含 guideArea", () => {
    const layout = createSplashLayout(375, 667);
    expect(layout.guideArea).toBeDefined();
    expect(layout.guideArea.width).toBeGreaterThan(0);
    expect(layout.guideArea.height).toBeGreaterThan(0);
  });
});
