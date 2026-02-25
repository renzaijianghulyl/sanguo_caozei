/**
 * 三国 LLM 游戏 · 全维度测试框架
 * Phase 2: 数据一致性与地理拓扑测试
 * Case 4: 三国时空悖论自检 | Case 5: 地理路径连通性
 */
import { describe, expect, it } from "vitest";

import { npcs184 } from "@data/sanguoDb/npcs";
import { regions184 } from "@data/sanguoDb/regions";

describe("Data Integrity - Chronological Check (Case 4)", () => {
  it("all NPCs have appear_year <= death_year", () => {
    const violations = npcs184.filter((n) => n.appear_year > n.death_year);
    expect(violations).toHaveLength(0);
  });

  it("曹操 at 184: birth_year 155 => age 29", () => {
    const caocao = npcs184.find((n) => n.name === "曹操");
    expect(caocao).toBeDefined();
    expect(caocao!.birth_year).toBe(155);
    const ageAt184 = 184 - caocao!.birth_year;
    expect(ageAt184).toBe(29);
  });
});

describe("Data Integrity - Map Connectivity (Case 5)", () => {
  function buildAdjacencyMap(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const r of regions184) {
      const name = r.name;
      if (!map.has(name)) map.set(name, new Set());
      for (const adj of r.adjacent_regions) {
        map.get(name)!.add(adj);
      }
    }
    return map;
  }

  it("all adjacent regions have bidirectional link", () => {
    const adjMap = buildAdjacencyMap();
    for (const r of regions184) {
      for (const adjName of r.adjacent_regions) {
        const adjRegion = regions184.find((x) => x.name === adjName);
        expect(adjRegion).toBeDefined();
        const revAdj = adjMap.get(adjName);
        expect(revAdj).toBeDefined();
        expect(revAdj!.has(r.name)).toBe(true);
      }
    }
  });

  it("陈留 to 许昌: path exists (both directions)", () => {
    const adjMap = buildAdjacencyMap();
    const chenliu = adjMap.get("陈留");
    const xuchang = adjMap.get("许昌");
    expect(chenliu).toBeDefined();
    expect(xuchang).toBeDefined();
    expect(chenliu!.has("许昌")).toBe(true);
    expect(xuchang!.has("陈留")).toBe(true);
  });

  it("no isolated region (all have at least one adjacent)", () => {
    const isolated = regions184.filter((r) => !r.adjacent_regions || r.adjacent_regions.length === 0);
    expect(isolated).toHaveLength(0);
  });
});
