/**
 * 高沉浸叙事与交互测试
 * 参考：新手引导、动态反馈分级、历史注入
 */
import { describe, expect, it } from "vitest";

import { buildAdjudicationPayload } from "@core/snapshot";
import { applyHardConstraints } from "@core/preAdjudicator";
import { getEventsInRange } from "@config/worldTimeline";
import {
  NEW_SAVE_INITIAL_DIALOGUE,
  HEAVEN_REVELATION,
  INITIAL_DIALOGUE
} from "@config/index";
import { createSplashLayout } from "@ui/splash";

const createBaseSaveData = (overrides?: { time?: { year: number; month: number; day: number } }) => ({
  meta: {
    version: "1.0.0",
    createdAt: "",
    lastSaved: "",
    playerId: "p1",
    saveName: "测试",
    saveSlot: 0
  },
  player: {
    id: "p1",
    attrs: { strength: 70, intelligence: 75, charm: 60, luck: 50 },
    legend: 20,
    tags: ["civilian"],
    reputation: 40,
    resources: { gold: 100, food: 200, soldiers: 0 },
    location: { region: "yingchuan", scene: "village" }
  },
  world: {
    era: "184",
    flags: [],
    time: overrides?.time ?? { year: 184, month: 2, day: 1 }
  },
  npcs: [],
  eventLog: [],
  dialogueHistory: [],
  progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
});

describe("高沉浸叙事与交互测试", () => {
  describe("Case 1-2: 新手引导与首入体验", () => {
    it("新存档首条文案必须包含核心玩法说明（时间流逝、逻辑裁决）", () => {
      const firstLine = NEW_SAVE_INITIAL_DIALOGUE[0];
      expect(firstLine).toBe(HEAVEN_REVELATION[0]);
      expect(firstLine).toMatch(/底层逻辑|每一句话|审视/);
      expect(HEAVEN_REVELATION.some((l) => l.includes("时间流逝"))).toBe(true);
      expect(HEAVEN_REVELATION.some((l) => l.includes("闭关") || l.includes("博弈"))).toBe(true);
    });

    it("INITIAL_DIALOGUE 为数组（已清空时无默认开场文案；若有内容则应含玩法提示）", () => {
      expect(Array.isArray(INITIAL_DIALOGUE)).toBe(true);
      if (INITIAL_DIALOGUE.length > 0) {
        const hasHint = INITIAL_DIALOGUE.some(
          (l) => l.includes("输入") || l.includes("意图") || l.includes("推进")
        );
        expect(hasHint).toBe(true);
      }
    });

    it("开始页展示玩法指南（guideArea 存在且有效）", () => {
      const layout = createSplashLayout(375, 667);
      expect(layout.guideArea).toBeDefined();
      expect(layout.guideArea.width).toBeGreaterThan(0);
      expect(layout.guideArea.height).toBeGreaterThan(0);
    });
  });

  describe("NarrativeLevel: 动态反馈分级", () => {
    it("timeSkip=1 月 → Level 1：concise，50～100 字，max_tokens=256", () => {
      const saveData = createBaseSaveData();
      let payload = buildAdjudicationPayload({
        saveData,
        playerIntent: "前往洛阳"
      });
      payload = applyHardConstraints(payload);

      const ctx = payload.event_context as Record<string, unknown>;
      expect(ctx?.narrative_feedback_level).toBe(1);
      expect(ctx?.narrative_style).toBe("concise");
      expect(ctx?.narrative_max_tokens).toBe(256);
      expect(String(ctx?.narrative_instruction)).toMatch(/50|100|环境|即时/);
    });

    it("timeSkip=120 月（十年）→ Level 3：novelistic，三幕式史诗结构，max_tokens=900", () => {
      const saveData = createBaseSaveData();
      let payload = buildAdjudicationPayload({
        saveData,
        playerIntent: "闭关十年"
      });
      payload = applyHardConstraints(payload);

      const ctx = payload.event_context as Record<string, unknown>;
      expect(ctx?.narrative_feedback_level).toBe(3);
      expect(ctx?.narrative_style).toBe("novelistic");
      expect(ctx?.narrative_max_tokens).toBe(900);
      const instr = String(ctx?.narrative_instruction ?? "");
      expect(instr).toMatch(/岁月流变|个人境遇|修行|心境/);
      expect(instr).toMatch(/星移斗转|天下大势|historical_summary|政权|名将/);
      expect(instr).toMatch(/重回尘世|当下感官|出关/);
      expect(instr).toMatch(/500|800/);
    });

    it("timeSkip=6 月 → Level 2：detailed，约 200 字", () => {
      const saveData = createBaseSaveData();
      let payload = buildAdjudicationPayload({
        saveData,
        playerIntent: "修炼 6 月"
      });
      payload = applyHardConstraints(payload);

      const ctx = payload.event_context as Record<string, unknown>;
      expect(ctx?.narrative_feedback_level).toBe(2);
      expect(ctx?.narrative_style).toBe("detailed");
      expect(ctx?.narrative_max_tokens).toBe(480);
      expect(String(ctx?.narrative_instruction)).toMatch(/200|个人成长|心境/);
    });

    it("timeSkip=12 月 → Level 3：三幕式史诗结构（阈值 12 月）", () => {
      const saveData = createBaseSaveData();
      let payload = buildAdjudicationPayload({
        saveData,
        playerIntent: "闭关一年"
      });
      payload = applyHardConstraints(payload);

      const ctx = payload.event_context as Record<string, unknown>;
      expect(ctx?.narrative_feedback_level).toBe(3);
      expect(ctx?.narrative_style).toBe("novelistic");
      expect(ctx?.narrative_max_tokens).toBe(900);
    });
  });

  describe("历史注入：184 年闭关至 194 年", () => {
    it("getEventsInRange(184,194) 包含 184-194 年间核心事件", () => {
      const events = getEventsInRange(184, 194);
      const labels = events.map((e) => e.label);

      expect(labels).toContain("灵帝崩殂");
      expect(labels).toContain("十常侍之乱");
      expect(labels).toContain("关东诸侯起兵讨董");
      expect(labels).toContain("董卓迁都长安");
    });

    it("闭关十年 Payload 的 event_context 注入 historical_summary 与 world_changes", () => {
      const saveData = createBaseSaveData();
      let payload = buildAdjudicationPayload({
        saveData,
        playerIntent: "闭关十年"
      });
      payload = applyHardConstraints(payload);

      expect(payload.world_state.time.year).toBe(194);
      expect(payload.logical_results?.world_changes).toBeDefined();
      expect(payload.logical_results!.world_changes!.length).toBeGreaterThan(0);

      const ctx = payload.event_context as Record<string, unknown>;
      expect(ctx?.historical_summary).toBeDefined();
      expect(String(ctx?.historical_summary)).toMatch(
        /灵帝|董卓|十常侍|关东|黄巾|184|194|十年/
      );

      const worldChanges = payload.logical_results!.world_changes!;
      const hasKeyEvent =
        worldChanges.some((e) => e.includes("灵帝")) ||
        worldChanges.some((e) => e.includes("董卓")) ||
        worldChanges.some((e) => e.includes("十常侍")) ||
        worldChanges.some((e) => e.includes("关东"));
      expect(hasKeyEvent).toBe(true);
    });

    it("events_in_period 与 timeline 该时段事件一致", () => {
      const events = getEventsInRange(184, 194);
      const saveData = createBaseSaveData();
      let payload = buildAdjudicationPayload({
        saveData,
        playerIntent: "闭关十年"
      });
      payload = applyHardConstraints(payload);

      const eventsInPeriod = (payload.event_context as Record<string, unknown>)
        ?.events_in_period as Array<{ label: string }> | undefined;
      expect(eventsInPeriod).toBeDefined();

      const timelineLabels = new Set(events.map((e) => e.label));
      for (const ep of eventsInPeriod ?? []) {
        expect(timelineLabels.has(ep.label)).toBe(true);
      }
    });
  });
});
