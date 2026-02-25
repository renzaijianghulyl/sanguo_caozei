/**
 * 功能测试：羁绊、记忆碎片、历史偏移、存档迁移
 */
import { describe, expect, it } from "vitest";
import { ensureBond, normalizeBond, createDefaultBond } from "@core/RelationManager";
import { applyNpcRelationEffects } from "@core/effectsApplier";
import { buildAdjudicationPayload } from "@core/snapshot";
import {
  applyTypewriterCompletion,
  type TypewriterCompletionContext
} from "@app/adjudicationFlow";
import { SaveManager } from "@services/storage/saveManager";
import type { GameSaveData, NPCState, WorldState } from "@core/state";

function minimalSaveData(overrides?: Partial<GameSaveData>): GameSaveData {
  return {
    meta: { version: "1", createdAt: "", lastSaved: "", playerId: "p1", saveName: "", saveSlot: 0 },
    player: {
      id: "p1",
      birth_year: 169,
      attrs: { strength: 50, intelligence: 50, charm: 50, luck: 50 },
      legend: 0,
      tags: [],
      reputation: 0,
      resources: { gold: 0, food: 0, soldiers: 0 },
      location: { region: "yingchuan", scene: "village" }
    },
    world: { era: "184", flags: [], time: { year: 184, month: 1, day: 1 } },
    npcs: [
      { id: "2001", name: "张角", stance: "neutral", trust: 0, location: "" },
      { id: "2010", name: "曹操", stance: "neutral", trust: 30, location: "chenliu", birth_year: 155 }
    ],
    eventLog: [],
    dialogueHistory: [],
    progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" },
    ...overrides
  };
}

describe("Bond 与记忆碎片", () => {
  it("ensureBond 对旧版 bond（仅 milestones）规范为 memory_shards 并补全新字段", () => {
    const npc: NPCState = {
      id: "2001",
      name: "张角",
      stance: "neutral",
      trust: 0,
      location: "",
      bond: {
        affinity: 50,
        milestones: ["曾在市集有一面之缘"],
        last_seen_world_time: { year: 184, month: 1 }
      } as unknown as NPCState["bond"]
    };
    ensureBond(npc, { year: 185, month: 2 });
    expect(npc.bond).toBeDefined();
    expect(npc.bond!.memory_shards).toEqual(["曾在市集有一面之缘"]);
    expect(npc.bond!.relation_type).toBe("");
    expect(npc.bond!.last_interaction_year).toBe(184);
    expect(npc.player_favor).toBe(50);
  });

  it("createDefaultBond 包含 relation_type、memory_shards、last_interaction_year", () => {
    const bond = createDefaultBond({ year: 184, month: 1 });
    expect(bond.affinity).toBe(0);
    expect(bond.relation_type).toBe("");
    expect(bond.memory_shards).toEqual([]);
    expect(bond.last_interaction_year).toBe(184);
  });

  it("applyNpcRelationEffects 解析 npc_X_memory= 写入 memory_shards", () => {
    const save = minimalSaveData();
    applyNpcRelationEffects(save, ["npc_2001_memory=曾在洛阳共饮"], 184);
    const npc = save.npcs.find((n) => n.id === "2001");
    expect(npc?.bond?.memory_shards).toContain("曾在洛阳共饮");
    expect(npc?.bond?.last_interaction_year).toBe(184);
  });

  it("applyNpcRelationEffects 解析 npc_X_favor 更新 affinity 并同步 player_favor", () => {
    const save = minimalSaveData();
    applyNpcRelationEffects(save, ["npc_2010_favor+20"], 184);
    const npc = save.npcs.find((n) => n.id === "2010");
    expect(npc?.bond?.affinity).toBe(20);
    expect(npc?.player_favor).toBe(20);
  });

  it("applyNpcRelationEffects 解析 npc_X_relation= 更新 relation_type 并同步 player_relation", () => {
    const save = minimalSaveData();
    applyNpcRelationEffects(save, ["npc_2010_favor+90", "npc_2010_relation=sworn_brother"], 184);
    const npc = save.npcs.find((n) => n.id === "2010");
    expect(npc?.bond?.relation_type).toBe("sworn_brother");
    expect(npc?.player_relation).toBe("sworn_brother");
  });

  it("memory_shards 超过 30 条时只保留最近 30 条", () => {
    const save = minimalSaveData();
    const effects = Array.from({ length: 35 }, (_, i) => `npc_2001_memory=记忆${i}`);
    applyNpcRelationEffects(save, effects, 184);
    const npc = save.npcs.find((n) => n.id === "2001");
    expect(npc?.bond?.memory_shards?.length).toBe(30);
    expect(npc?.bond?.memory_shards?.[0]).toBe("记忆5");
    expect(npc?.bond?.memory_shards?.[29]).toBe("记忆34");
  });
});

describe("历史偏移 history_flags", () => {
  it("buildAdjudicationPayload 在 world_state 有 history_flags 时注入 history_deviation 与 instruction", () => {
    const save = minimalSaveData({
      world: {
        era: "190",
        flags: [],
        history_flags: ["郭嘉未死", "董卓已刺"],
        time: { year: 190, month: 1, day: 1 }
      } as WorldState
    });
    const payload = buildAdjudicationPayload({ saveData: save, playerIntent: "继续" });
    expect(payload.event_context?.history_deviation).toEqual(["郭嘉未死", "董卓已刺"]);
    expect(String(payload.event_context?.history_deviation_instruction)).toMatch(/历史已.*偏移/);
    expect(String(payload.event_context?.history_deviation_instruction)).toContain("郭嘉未死");
  });

  it("无 history_flags 时不注入 history_deviation", () => {
    const payload = buildAdjudicationPayload({ saveData: null, playerIntent: "test" });
    expect(payload.event_context?.history_deviation).toBeUndefined();
  });
});

describe("玩法上下文 playstyle_context", () => {
  it("player 有 ambition 时注入 playstyle_context", () => {
    const save = minimalSaveData({
      player: {
        id: "p1",
        birth_year: 169,
        attrs: { strength: 75, intelligence: 82, charm: 68, luck: 55 },
        legend: 30,
        tags: [],
        reputation: 50,
        resources: { gold: 0, food: 0, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" },
        ambition: "unify"
      }
    });
    const payload = buildAdjudicationPayload({ saveData: save, playerIntent: "出征" });
    expect(payload.event_context?.playstyle_context).toBeDefined();
    expect(String(payload.event_context?.playstyle_context)).toMatch(/军粮|民心|征伐/);
  });

  it("player 有 active_titles 时 playstyle_context 含称号说明", () => {
    const save = minimalSaveData({
      player: {
        id: "p1",
        birth_year: 169,
        attrs: { strength: 75, intelligence: 82, charm: 68, luck: 55 },
        legend: 30,
        tags: [],
        reputation: 50,
        resources: { gold: 0, food: 0, soldiers: 0 },
        location: { region: "yingchuan", scene: "village" },
        active_titles: ["乱世奸雄"]
      } as GameSaveData["player"]
    });
    const payload = buildAdjudicationPayload({ saveData: save, playerIntent: "test" });
    expect(String(payload.event_context?.playstyle_context)).toContain("乱世奸雄");
  });
});

describe("存档迁移", () => {
  it("load 后无 history_flags / active_titles 的存档被 migrateSaveData 补全", () => {
    const manager = new SaveManager();
    const raw = minimalSaveData();
    (raw.world as { history_flags?: string[] }).history_flags = undefined;
    (raw.player as { active_titles?: string[] }).active_titles = undefined;
    raw.npcs[0].bond = {
      affinity: 30,
      milestones: ["旧版里程碑"],
      last_seen_world_time: { year: 184, month: 1 }
    } as unknown as NPCState["bond"];
    manager.save(raw, false);
    const loaded = manager.load(0);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.history_flags).toEqual([]);
    expect((loaded!.player as { active_titles?: string[] }).active_titles).toEqual([]);
    const npc = loaded!.npcs.find((n) => n.id === "2001");
    expect(npc?.bond?.memory_shards).toEqual(["旧版里程碑"]);
    expect(npc?.player_favor).toBe(30);
  });
});

describe("applyTypewriterCompletion history_flags 合并", () => {
  it("state_changes.world 仅含 history_flags 时合并入 saveData.world.history_flags", () => {
    const save = minimalSaveData();
    save.world.history_flags = [];
    const ctx: TypewriterCompletionContext = {
      saveData: save,
      updatePlayerAttrs: () => {},
      updateWorldState: (sd, delta) => {
        Object.assign(sd.world!, delta);
      },
      autoSave: () => {},
      syncFromSave: () => {},
      setSuggestedActions: () => {},
      requestRewardedAd: () => {},
      playAmbientAudio: () => {}
    };
    applyTypewriterCompletion(
      {
        state_changes: {
          world: { history_flags: ["郭嘉未死"] }
        }
      },
      undefined,
      ctx
    );
    expect(save.world.history_flags).toContain("郭嘉未死");
    applyTypewriterCompletion(
      {
        state_changes: {
          world: { history_flags: ["郭嘉未死", "董卓已刺"] }
        }
      },
      undefined,
      ctx
    );
    expect(save.world.history_flags).toEqual(["郭嘉未死", "董卓已刺"]);
  });
});

describe("normalizeBond 边界", () => {
  it("bond 无 last_seen_world_time 时 last_interaction_year 用 worldTime.year", () => {
    const bond = {
      affinity: 10,
      relation_type: "",
      memory_shards: [] as string[],
      last_seen_world_time: undefined as unknown as { year: number; month: number }
    } as NPCState["bond"];
    normalizeBond(bond, { year: 190, month: 6 });
    expect((bond as { last_interaction_year: number }).last_interaction_year).toBe(190);
  });
});
