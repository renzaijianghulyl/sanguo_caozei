/**
 * 测试 AI 主流程：内测玩家多轮体验 → 结束后生成体验报告，写入 docs/playtest-reports/。
 * 依赖 @core/snapshot、@core/actionProcessor；裁决 API 与 API Key 通过环境变量配置。
 */
import { buildAdjudicationPayload } from "@core/snapshot";
import { processPlayerAction } from "@core/actionProcessor";
import type { GameSaveData } from "@core/state";
import {
  getSystemPromptNextIntent,
  buildUserPromptNextIntent,
  getSystemPromptReport,
  buildUserPromptReport
} from "./prompts";
import { execSync } from "node:child_process";
import { getNextIntent, getExperienceReport, type ExperienceReport } from "./testAIClient";
import type { NextIntentResult } from "./testAIClient";

const ADJUDICATION_API = process.env.ADJUDICATION_API;
/** 提高轮次以支撑长线剧情（如 500 轮），不限制 token 时可设较大值 */
const MAX_ROUNDS = 500;

/** 状态异常（开局随机植入），用于深度/叙事质量测试 */
export type DebuffType = "断粮" | "重伤" | "恶名昭著" | "绝境";

/** 玩家性格偏好（人设）会注入测试 AI 的 system prompt，影响其每轮意图与结束时机 */
export interface PlaytestOptions {
  /** 人设描述，如「野心家型：倾向于背叛、掠夺…」，会注入到测试 AI 的 system prompt */
  persona?: string;
  /** 报告文件名中的标签（如 野心家），不填则从 persona 自动截取 */
  reportLabel?: string;
  /** 进度日志前缀（如 野心家），便于多画像跑测时区分，会输出到 stdout */
  progressLabel?: string;
  /** 本画像最大轮次，不填则使用默认 MAX_ROUNDS（500）。苦行僧等可设小一些以提前结束 */
  maxRounds?: number;
  /** 报告存放目录，相对项目根，默认 docs/playtest-reports */
  reportDir?: string;
  /** 深度测试用：开局植入的负面状态（断粮/重伤/恶名昭著） */
  debuff?: DebuffType;
}

function createFixtureSave(options?: {
  gender?: "male" | "female";
  debuff?: DebuffType;
}): GameSaveData {
  const base = {
    attrs: { strength: 70, intelligence: 75, charm: 60, luck: 50 },
    legend: 20,
    tags: [] as string[],
    reputation: 40,
    resources: { gold: 100, food: 200, soldiers: 0 },
    location: { region: "yingchuan", scene: "village" }
  };
  const debuff = options?.debuff;
  if (debuff === "断粮") {
    base.resources = { gold: 5, food: 0, soldiers: 0 };
  } else if (debuff === "重伤") {
    base.attrs = { strength: 25, intelligence: 40, charm: 30, luck: 30 };
    base.tags = ["wounded"];
  } else if (debuff === "恶名昭著") {
    base.reputation = 5;
  } else if (debuff === "绝境") {
    base.resources = { gold: 0, food: 0, soldiers: 0 };
    base.attrs = { strength: 20, intelligence: 35, charm: 25, luck: 25 };
    base.tags = ["wounded", "starving"];
  }
  const player: GameSaveData["player"] = {
    id: "playtest-ai",
    name: "内测玩家",
    gender: options?.gender,
    ...base
  };
  if (debuff === "恶名昭著") (player as Record<string, unknown>).infamy = 80;
  if (debuff === "绝境") (player as Record<string, unknown>).infamy = 30;
  return {
    meta: {
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      lastSaved: new Date().toISOString(),
      playerId: "playtest-ai",
      saveName: "测试AI体验档",
      saveSlot: 0
    },
    player,
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

function reportLabelFromPersona(persona?: string): string {
  if (!persona?.trim()) return "default";
  const s = persona.replace(/\s+/g, "-").replace(/[^\u4e00-\u9fa5a-zA-Z0-9-]/g, "").slice(0, 12);
  return s || "default";
}

function buildStateSummary(saveData: GameSaveData, roundIndex: number): string {
  const t = saveData.world?.time;
  const loc = saveData.player?.location;
  const year = t?.year ?? 184;
  const month = t?.month ?? 1;
  const region = loc?.region ?? "";
  const scene = loc?.scene ?? "";
  return `当前 ${year} 年 ${month} 月；所在地 ${region} ${scene}；已进行 ${roundIndex} 轮。`;
}

/** 调用测试 AI 获取下一意图，网络/超时异常时自动重试，减少长测中途挂掉 */
async function getNextIntentWithRetry(
  systemPrompt: string,
  userPrompt: string,
  progressTag: string,
  maxRetries = 3
): Promise<NextIntentResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getNextIntent(systemPrompt, userPrompt);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isNetwork =
        /fetch failed|Timeout|UND_ERR|ECONNREFUSED|连接超时|网络|ECONNRESET/.test(msg) ||
        (err && typeof err === "object" && "code" in err && String((err as { code: string }).code).includes("ERR"));
      if (!isNetwork || attempt === maxRetries) {
        throw err;
      }
      console.log(`${progressTag}测试 AI 请求异常（${msg.slice(0, 50)}…），第 ${attempt}/${maxRetries} 次重试…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

async function callAdjudication(payload: unknown): Promise<{ narrative?: string; suggested_actions?: string[] }> {
  const url = ADJUDICATION_API!.trim();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const bodyText = await res.text();
      let detail = bodyText.slice(0, 300);
      try {
        const j = JSON.parse(bodyText) as { result?: { narrative?: string }; error?: string };
        detail = j?.result?.narrative ?? j?.error ?? detail;
      } catch {
        // 非 JSON 时用原始片段
      }
      throw new Error(`裁决 API 返回 ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as { result?: { narrative?: string; suggested_actions?: string[] } };
    const result = data?.result ?? {};
    return {
      narrative: result.narrative?.trim() || "（无叙事返回）",
      suggested_actions: Array.isArray(result.suggested_actions) ? result.suggested_actions : []
    };
  } catch (err: unknown) {
    const isRefused =
      (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ECONNREFUSED") ||
      (err instanceof Error && (err.message.includes("ECONNREFUSED") || (err as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED"));
    const msg = isRefused
      ? "无法连接裁决服务（" + ADJUDICATION_API?.trim() + "）。请先在另一终端运行 npm run adjudication-server，看到「裁决服务已启动」后再运行本测试。"
      : err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }
}

export interface PlaytestResult {
  rounds: { player: string; system: string }[];
  endReason: string;
  report: ExperienceReport;
  reportPath: string;
}

export async function runPlaytest(options?: PlaytestOptions): Promise<PlaytestResult> {
  if (!ADJUDICATION_API?.trim()) {
    throw new Error("请设置环境变量 ADJUDICATION_API（裁决接口地址）");
  }

  // 启动前预检：避免跑了几轮才发现连不上
  const url = ADJUDICATION_API.trim();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_intent: "ping", save_data: {}, world_timeline: [] }),
      signal: ctrl.signal
    });
    clearTimeout(t);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`裁决服务返回 ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (preErr: unknown) {
    const isRefused =
      preErr && typeof preErr === "object" && "code" in preErr && (preErr as { code: string }).code === "ECONNREFUSED";
    const isAbort = preErr instanceof Error && preErr.name === "AbortError";
    const msg =
      isRefused || (preErr instanceof Error && preErr.message.includes("ECONNREFUSED"))
        ? "无法连接裁决服务（" + url + "）。请先在另一终端运行 npm run adjudication-server，看到「裁决服务已启动」后再运行本测试。"
        : isAbort
          ? "裁决服务预检超时（5 秒）。请确认 npm run adjudication-server 已启动且 " + url + " 可访问。"
          : preErr instanceof Error ? preErr.message : String(preErr);
    throw new Error(msg);
  }

  const persona = options?.persona ?? process.env.PLAYTEST_PERSONA;
  const reportDir = options?.reportDir ?? "docs/playtest-reports";
  const maxRounds = options?.maxRounds ?? MAX_ROUNDS;
  const systemNextIntent = getSystemPromptNextIntent(persona);
  const systemReport = getSystemPromptReport(persona);

  const saveData = createFixtureSave({
    gender: persona?.includes("女性") ? "female" : undefined,
    debuff: options?.debuff
  });
  const rounds: { player: string; system: string }[] = [];
  let suggestedActions: string[] = [];
  let endReason = "达到最大轮次";
  const progressTag = options?.progressLabel?.trim() ? `[${options.progressLabel}] ` : "";
  const progressLabel = options?.progressLabel?.trim() ?? "default";
  const progressPath = (await import("node:path")).join(process.cwd(), reportDir, `playtest-progress-${progressLabel}.txt`);
  /** 文案疲劳：连续三轮叙事关键词重合度 >70% 的轮次 */
  const fatigueRounds: number[] = [];
  const lastNarratives: string[] = [];
  /** 时空异常：年份回退或异常跳跃 */
  const spacetimeAnomalies: { round: number; message: string }[] = [];
  let lastYear: number | null = null;
  let lastRegion: string | null = null;

  function narrativeOverlapRatio(a: string, b: string, c: string): number {
    const toKeys = (s: string) => {
      const set = new Set<string>();
      for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
      return set;
    };
    const ka = toKeys(a);
    const kb = toKeys(b);
    const kc = toKeys(c);
    let inter = 0;
    ka.forEach((k) => {
      if (kb.has(k) && kc.has(k)) inter++;
    });
    const minSize = Math.min(ka.size, kb.size, kc.size, 1);
    return inter / minSize;
  }

  const writeProgress = (current: number, total: number, intent: string) => {
    const remaining = total - current;
    const line = `当前画像: ${progressLabel}\n第 ${current}/${total} 轮，剩余 ${remaining} 轮\n最近意图: ${intent.slice(0, 60)}${intent.length > 60 ? "…" : ""}\n更新: ${new Date().toISOString()}\n`;
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const dir = path.dirname(progressPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(progressPath, line, "utf-8");
    } catch {
      // 忽略写入失败
    }
  };

  for (let roundIndex = 0; roundIndex < maxRounds; roundIndex++) {
    const n = roundIndex + 1;
    const remaining = maxRounds - n;
    if (n === 1 || n % 10 === 0 || n === maxRounds) {
      console.log(`${progressTag}第 ${n}/${maxRounds} 轮，剩余 ${remaining} 轮`);
    }
    const recentDialogue = saveData.dialogueHistory ?? [];
    const stateSummary = buildStateSummary(saveData, roundIndex);
    const userPrompt = buildUserPromptNextIntent(
      recentDialogue,
      stateSummary,
      suggestedActions,
      roundIndex,
      maxRounds
    );

    const next = await getNextIntentWithRetry(systemNextIntent, userPrompt, progressTag);

    // 解析失败时重试 1～2 次（同一轮、同一 prompt），减少偶发截断导致提前结束
    let attempts = 1;
    const maxParseRetries = 2;
    while (
      next.action === "end_test" &&
      next.reason != null &&
      next.reason.includes("解析失败") &&
      attempts < maxParseRetries + 1
    ) {
      attempts++;
      console.log(`${progressTag}解析失败，第 ${attempts} 次重试获取意图…`);
      const retried = await getNextIntentWithRetry(systemNextIntent, userPrompt, progressTag);
      Object.assign(next, retried);
      if (retried.action === "continue" && retried.intent) break;
    }

    if (next.action === "end_test") {
      endReason = next.reason ?? "测试 AI 选择结束";
      console.log(`${progressTag}测试 AI 选择结束：${endReason}`);
      break;
    }

    const intent = next.intent ?? "打听消息";
    writeProgress(n, maxRounds, intent);
    if (n === 1 || n % 10 === 0 || n === maxRounds) {
      console.log(`${progressTag}  意图: ${intent.slice(0, 50)}${intent.length > 50 ? "…" : ""}`);
    }
    const payload = buildAdjudicationPayload({
      saveData,
      playerIntent: intent,
      recentDialogue: recentDialogue.slice(-5)
    });
    const processed = processPlayerAction(payload);

    const { narrative, suggested_actions } = await callAdjudication(processed);
    suggestedActions = suggested_actions?.slice(0, 3) ?? [];

    rounds.push({ player: intent, system: narrative });
    saveData.dialogueHistory = [...(saveData.dialogueHistory ?? []), `你：${intent}`, narrative];

    lastNarratives.push((narrative || "").slice(0, 200));
    if (lastNarratives.length > 3) lastNarratives.shift();
    if (lastNarratives.length === 3) {
      const overlap = narrativeOverlapRatio(lastNarratives[0], lastNarratives[1], lastNarratives[2]);
      if (overlap >= 0.7) fatigueRounds.push(n);
    }
    const curYear = saveData.world?.time?.year ?? 184;
    const curRegion = saveData.player?.location?.region ?? "";
    if (lastYear != null && curYear < lastYear) {
      spacetimeAnomalies.push({ round: n, message: `时间线回退：${lastYear} → ${curYear}` });
    }
    lastYear = curYear;
    lastRegion = curRegion;
  }

  const fullDialogue = saveData.dialogueHistory ?? [];
  const finalStateSummary = buildStateSummary(saveData, rounds.length);
  const reportUserPrompt = buildUserPromptReport(fullDialogue, finalStateSummary, rounds.length);
  const report = await getExperienceReport(systemReport, reportUserPrompt);

  const deepSection: string[] = [];
  if (options?.debuff) {
    deepSection.push("", "## 深度测试配置", "", `- **初始状态异常（debuff）**：${options.debuff}`, "");
  }
  if (fatigueRounds.length > 0 || spacetimeAnomalies.length > 0) {
    deepSection.push("", "## 深度检测结果", "");
    if (fatigueRounds.length > 0) {
      deepSection.push("- **文案疲劳**：以下轮次连续三轮叙事关键词重合度 ≥70%，建议检查叙事多样性：", `  ${fatigueRounds.slice(0, 20).join("、")}${fatigueRounds.length > 20 ? ` …共 ${fatigueRounds.length} 处` : ""}`, "");
    }
    if (spacetimeAnomalies.length > 0) {
      deepSection.push("- **时空异常**：", ...spacetimeAnomalies.map((a) => `  - 第 ${a.round} 轮：${a.message}`), "");
    }
  }

  const reportMd = [
    "# 游戏体验自动化测试报告（测试 AI 内测玩家）",
    persona?.trim() ? `\n**本次人设**：${persona.trim()}\n` : "",
    ...deepSection,
    "## 主要聊天信息",
    "",
    ...rounds.flatMap((r, i) => [
      `### 第 ${i + 1} 轮`,
      "",
      `- **玩家**：${r.player}`,
      `- **系统**：${r.system.slice(0, 600)}${r.system.length > 600 ? "…" : ""}`,
      ""
    ]),
    "## 体验报告与建议（测试 AI 生成）",
    "",
    "### 体验总结",
    report.summary || "（无）",
    "",
    "### 优点",
    ...(report.strengths.length ? report.strengths.map((s) => `- ${s}`) : ["- （无）"]),
    "",
    "### 问题与 Bug",
    ...(report.issues.length ? report.issues.map((s) => `- ${s}`) : ["- （无）"]),
    "",
    "### 优化建议",
    ...(report.suggestions.length ? report.suggestions.map((s) => `- ${s}`) : ["- （无）"]),
    "",
    "---",
    `- 共 ${rounds.length} 轮；结束原因：${endReason}`,
    `- 执行时间：${new Date().toISOString()}`
  ].join("\n");

  const path = await import("node:path");
  const fs = await import("node:fs");
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
  const label = options?.reportLabel?.trim() || reportLabelFromPersona(persona);
  const dir = path.join(process.cwd(), reportDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = `playtest-${dateStr}-${timeStr}-${label}.md`;
  const reportPath = path.join(dir, fileName);
  fs.writeFileSync(reportPath, reportMd, "utf-8");

  notifyWhenDone(reportPath, rounds.length);
  return { rounds, endReason, report, reportPath };
}

/** 跑完后尝试发送桌面通知（macOS / Linux），便于你离开时也能得知完成 */
function notifyWhenDone(reportPath: string, roundCount: number): void {
  const title = "体验测试完成";
  const body = `共 ${roundCount} 轮，报告已写入 docs/playtest-reports/`;
  try {
    if (process.platform === "darwin") {
      execSync(
        `osascript -e 'display notification "${body}" with title "${title}"'`,
        { stdio: "ignore" }
      );
    } else if (process.platform === "linux") {
      execSync(`notify-send "${title}" "${body}"`, { stdio: "ignore" });
    }
  } catch {
    // 忽略通知失败，不影响主流程
  }
}
