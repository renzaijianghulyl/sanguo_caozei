/**
 * 游戏体验自动化测试：直接调用裁决 API，多轮对话后输出「主要聊天」+「测试结论」。
 * 需设置 ADJUDICATION_API（如 http://localhost:3000/intent/resolve）才会执行。
 * 运行：ADJUDICATION_API=<url> npm run test -- tests/playtestExperience.test.ts --run
 */
import { describe, expect, it } from "vitest";
import { buildAdjudicationPayload } from "@core/snapshot";
import { processPlayerAction } from "@core/actionProcessor";
import type { GameSaveData } from "@core/state";

const ADJUDICATION_API = process.env.ADJUDICATION_API;

function createFixtureSave(): GameSaveData {
  return {
    meta: {
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      lastSaved: new Date().toISOString(),
      playerId: "playtest",
      saveName: "体验测试档",
      saveSlot: 0
    },
    player: {
      id: "playtest",
      name: "测试者",
      attrs: { strength: 70, intelligence: 75, charm: 60, luck: 50 },
      legend: 20,
      tags: [],
      reputation: 40,
      resources: { gold: 100, food: 200, soldiers: 0 },
      location: { region: "yingchuan", scene: "village" }
    },
    world: {
      era: "184",
      flags: [],
      time: { year: 184, month: 2, day: 1 }
    },
    npcs: [],
    eventLog: [],
    dialogueHistory: [],
    progress: { totalTurns: 0, lastEventId: "", lastEventTime: "" }
  };
}

async function callAdjudicationHttp(payload: unknown): Promise<{ narrative?: string }> {
  const url = ADJUDICATION_API!.trim();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`裁决 API 返回 ${res.status}`);
  const data = (await res.json()) as { result?: { narrative?: string } };
  return data?.result ?? {};
}

const skipPlaytest = !ADJUDICATION_API;

describe.skipIf(skipPlaytest)("游戏体验自动化测试", () => {
  const intents = ["前往洛阳", "打听消息", "闭关一年"];
  const rounds: { player: string; system: string }[] = [];
  let saveData: GameSaveData = createFixtureSave();

  it(
    "多轮对话并记录主要聊天与测试结论",
    async () => {
      for (const intent of intents) {
        const payload = buildAdjudicationPayload({
          saveData,
          playerIntent: intent,
          recentDialogue: saveData.dialogueHistory?.slice(-5)
        });
        const processed = processPlayerAction(payload);
        const { narrative } = await callAdjudicationHttp(processed);
        const systemText = narrative?.trim() || "（无叙事返回）";
        rounds.push({ player: intent, system: systemText });
        saveData.dialogueHistory = [...(saveData.dialogueHistory || []), `你：${intent}`, systemText];
      }

      const report = [
        "# 游戏体验自动化测试报告",
        "",
        "## 主要聊天信息",
        "",
        ...rounds.flatMap((r, i) => [
          `### 第 ${i + 1} 轮`,
          "",
          `- **玩家**：${r.player}`,
          `- **系统**：${r.system.slice(0, 500)}${r.system.length > 500 ? "…" : ""}`,
          ""
        ]),
        "## 测试结论",
        "",
        rounds.every((r) => r.system && r.system !== "（无叙事返回）")
          ? "- 所有轮次均返回叙事，**通过**。"
          : "- 存在轮次无叙事或异常，**未通过**。",
        "",
        `- 共 ${rounds.length} 轮，执行时间：${new Date().toISOString()}`
      ].join("\n");

      expect(rounds.length).toBe(intents.length);
      expect(rounds.every((r) => r.system.length > 0)).toBe(true);

      const fs = await import("node:fs");
      const path = await import("node:path");
      const outPath = path.join(process.cwd(), "playtest-report.md");
      fs.writeFileSync(outPath, report, "utf-8");
      console.log("\n" + report);
      console.log("\n报告已写入: " + outPath);
    },
    60_000
  );
});
