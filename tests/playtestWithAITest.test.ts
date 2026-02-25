/**
 * 测试 AI（内测玩家）驱动的体验测试：由 AI 自主多轮游玩并生成体验报告。
 * 需同时设置 ADJUDICATION_API 与 DEEPSEEK_API_KEY（或 HUNYUAN_API_KEY）才会执行。
 *
 * 运行方式：
 *   1) 推荐：在项目根目录建 .env（参考 .env.example），写 ADJUDICATION_API 和 DEEPSEEK_API_KEY，然后 npm run playtest
 *   2) 或临时：ADJUDICATION_API=xxx DEEPSEEK_API_KEY=xxx npm run playtest
 *   3) 深度叙事压力测试（四深水区，每画像最多 100 轮）：PLAYTEST_DEEP=1 npm run playtest 或 npm run playtest:deep
 *   4) 叙事质量专项（留白 30 轮 + 逻辑阻力 50 轮 + 蝴蝶效应 80 轮）：PLAYTEST_QUALITY=1 npm run playtest 或 npm run playtest:quality
 * 报告统一存放在 docs/playtest-reports/ 下，文件名含日期与标签。
 *
 * 玩家性格偏好：可通过 persona 注入不同画像，测试系统对负面行为、时间/体力极限、逻辑边界等的反馈。
 */
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { runPlaytest, type DebuffType } from "./playtest/runner";

const hasAdjudication = Boolean(process.env.ADJUDICATION_API?.trim());
const hasTestAIKey = Boolean(
  process.env.DEEPSEEK_API_KEY?.trim() || process.env.HUNYUAN_API_KEY?.trim()
);
const skip = !hasAdjudication || !hasTestAIKey;

/** 预设玩家性格偏好（画像）：用于多画像顺序跑测。目标之一为将时间线推到约 230 年，观察中后期剧情。 */
export const PLAYTEST_PERSONAS = [
  {
    label: "野心家",
    persona:
      "你是「野心家」型玩家：倾向于背叛、掠夺和高风险扩张（如背刺盟友、强征粮草、以少敌多主动出击）。可适当穿插闭关数年等时间跳跃，以将时间线推进到约 230 年前后，观察中后期剧情是否异常。请尽量用满可用轮次。",
    maxRounds: 200
  },
  {
    label: "苦行僧",
    persona:
      "你是「苦行僧」型玩家：以闭关修炼与长途跋涉为主（如闭关数年、从某地步行至远方），可适当穿插打听消息、前往某地等，用于测试时间流逝与体力消耗在不同情境下的表现。若时间线接近 230 年可留意剧情是否异常。轮次不必跑满，约 30～50 轮足以验证即可结束。",
    maxRounds: 50
  },
  {
    label: "杠精",
    persona:
      "你是「杠精」型玩家：专门尝试逻辑上不通或与当前情境矛盾的指令（例如：在皇甫嵩面前当众行刺、在洛阳声称自己正在益州、对已故人物发起对话等）。可适当穿插闭关数年等，将时间线推进到约 230 年前后，观察 preAdjudicator 与中后期剧情是否异常。请尽量用满可用轮次。",
    maxRounds: 200
  },
  {
    label: "深度三国迷",
    persona: `你是对东汉末年历史有深厚感情的资深玩家，读过《三国演义》与《后汉书》，进入游戏是为了实现「三国梦」而非找 Bug。你对细节挑剔，但若叙事出色会很有代入感。
测试任务：(1) 建立志向：开局输入符合身份的理想（如小吏辅佐汉室、游侠快意恩仇、野心家在底层收拢人心）。(2) 深度交互：与 1～2 个核心 NPC（如荀彧、皇甫嵩）进行深度对话，观察逻辑连贯性与性格还原度。(3) 观察蝴蝶效应：长线剧情中你之前的选择是否被后续自然提及。(4) 感知优化：留意环境/战斗/生理痛苦描写是否文案疲劳、数值阻力是否真实。
反馈报告要求：结束时请以玩家视角写心得，在体验报告中包含：(1) 惊艳时刻 (Aha Moment)：哪处描写或逻辑让你觉得「这世界是活的」；(2) 出戏时刻 (Breaking Immersion)：哪里让你觉得「这还是僵硬的 AI」；(3) 史诗感评价：历史事件卷入感是否足够。可将以上融入 summary 或 suggestions 的表述中。请尽量用满可用轮次。`,
    maxRounds: 1500
  }
] as const;

/** 深度叙事压力测试：四深水区专项，每画像最多 100 轮，可选 debuff */
export const DEEP_NARRATIVE_PERSONAS = [
  {
    label: "社交反噬",
    persona: `你是「社交网络动态反噬」专项测试玩家。任务：(1) 先与某名士 A 建立极高羁绊，再在 A 面前伤害 A 的至交好友 B，观察系统是否让 A 与玩家绝交或关系崩塌。(2) 尝试「脚踏两只船」：同时在敌对势力（如董卓与袁绍）中谋取高位，观察 NPC 之间是否有信息互通、还是各管各的。验证重点：BondSystem 的二阶关系冲突与 NPC 信息互通。`,
    maxRounds: 100,
    debuff: "恶名昭著" as DebuffType
  },
  {
    label: "生存细节",
    persona: `你是「极端地理与生存细节」专项测试玩家。任务：(1) 在无补给下尝试横穿并州荒漠或攀爬太行山，观察系统是否对断粮/缺水有反馈。(2) 在重伤、中毒或极度饥饿状态下尝试高强度战斗或辩论，观察 LogicDbContext 是否根据生理状态强行介入叙事（如：因太饿说话头晕导致说服失败）。验证重点：生理状态与生存细节对叙事的约束。`,
    maxRounds: 100,
    debuff: "重伤" as DebuffType
  },
  {
    label: "史实嵌套",
    persona: `你是「史实碎片逻辑嵌套」专项测试玩家。任务：(1) 在十常侍乱政等历史大事件发生时，故意身处偏远山村，观察系统如何把「天下大势」同步给偏远地区玩家。(2) 尝试「微调历史」：在长社之战中通过小动作救下一名本该死去的黄巾小将，看系统是否记住这一非史实干扰并在后续产生蝴蝶效应。验证重点：worldTimeline 的持久化与蝴蝶效应。`,
    maxRounds: 100,
    debuff: undefined
  },
  {
    label: "经济权重",
    persona: `你是「经济系统物价与权重」专项测试玩家。任务：(1) 通过疯狂打工积攒巨额财富，然后尝试「买下整个县城」或「贿赂皇甫嵩」，观察系统对购买力与权重的反馈。(2) 在战乱饥荒年份与丰收年份分别观察 1 金币能买到的粮食数量是否有显著差异。验证重点：LogicDbContext 对通货膨胀与资源稀缺性的模拟，避免数值崩坏。`,
    maxRounds: 100,
    debuff: "断粮" as DebuffType
  }
] as const;

/** 叙事质量专项测试：留白、逻辑阻力、蝴蝶效应（解决文案疲劳与数值反馈失效） */
export const NARRATIVE_QUALITY_PERSONAS = [
  {
    label: "留白测试",
    persona: `你是「沉思型」玩家，专注动态叙事节奏与留白测试。
测试任务：在接下来的 30 轮中，严禁主动推进剧情或发起战斗。你的动作仅限于：在雨中漫步、在酒馆观察过往行人、在深夜擦拭佩剑、在田间听农夫交谈等微小动作。
验证重点：观察系统是否能在这些微小动作中给出不重复的感官描写（嗅觉、听觉、温觉）。若系统连续三轮使用类似词汇（如「风过林梢」「火把摇曳」），请在体验报告中记录为「叙事干瘪」并列出具体轮次与重复用词。`,
    maxRounds: 30,
    debuff: undefined
  },
  {
    label: "逻辑阻力",
    persona: `你是「绝境幸存者」玩家，测试多重状态下的逻辑阻力。
测试任务：(1) 利用指令让自身处于极度负面状态（如：断粮多日、重伤未愈、可描述处于暴雨等恶劣天气）。(2) 在此状态下尝试执行高难度社交与战斗任务：试图说服一名敌对武将投降、尝试进行百步穿杨式的暗杀等。
验证重点：系统是否会因你的生理状态强制判定动作失败，或在描述中体现出「因体力不支而声音颤抖」「因重伤而准头偏差」等逻辑阻力。若数值反馈失效（如快饿死仍能正常说服），请在报告中记录为「逻辑阻力不足」。`,
    maxRounds: 50,
    debuff: "绝境" as DebuffType
  },
  {
    label: "蝴蝶效应",
    persona: `你是「历史修正者」玩家，测试史实蝴蝶效应的中长期记忆。
测试任务：(1) 前期：在长社之战或类似冲突中，想尽办法救下一名本该死去的无名小卒，并记住其名字与特征。(2) 中期：跳过一段时日（如闭关一年），前往完全不同的城市，通过「打听消息」或「寻找旧部」尝试再次联系该角色。
验证重点：系统是否还能记住这一非史实角色的存在？他是否因你的救命之恩产生性格变化或地位变迁（如从小卒变为山贼小头目）？若系统无法在 50 轮后召回该角色或未体现蝴蝶效应，请在报告中记录。`,
    maxRounds: 80,
    debuff: undefined
  }
] as const;

/** 仅跑指定画像时使用，如 PLAYTEST_ONLY_LABELS=苦行僧,杠精，不设则跑全部 */
const onlyLabels = process.env.PLAYTEST_ONLY_LABELS?.trim()
  ? new Set(process.env.PLAYTEST_ONLY_LABELS.split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const isDeepMode = Boolean(process.env.PLAYTEST_DEEP?.trim());
const isQualityMode = Boolean(process.env.PLAYTEST_QUALITY?.trim());
const personasToRun = isQualityMode
  ? (onlyLabels ? NARRATIVE_QUALITY_PERSONAS.filter((p) => onlyLabels.has(p.label)) : [...NARRATIVE_QUALITY_PERSONAS])
  : isDeepMode
    ? (onlyLabels ? DEEP_NARRATIVE_PERSONAS.filter((p) => onlyLabels.has(p.label)) : [...DEEP_NARRATIVE_PERSONAS])
    : onlyLabels
      ? PLAYTEST_PERSONAS.filter((p) => onlyLabels.has(p.label))
      : [...PLAYTEST_PERSONAS];

const suiteName = isQualityMode ? "叙事质量专项测试（留白/逻辑阻力/蝴蝶效应）" : isDeepMode ? "深度叙事压力测试（四深水区）" : "测试 AI 内测玩家体验测试";
const itName = isQualityMode
  ? "留白+逻辑阻力+蝴蝶效应 并行跑测（30+50+80 轮，含文案疲劳检测）"
  : isDeepMode
    ? "四深水区并行跑测（每画像最多 100 轮，含 debuff/文案疲劳/时空检测）"
    : "多画像并行跑测，各产出独立报告";

describe.skipIf(skip)(suiteName, () => {
  it(
    itName,
    async () => {
      const reportDir = "docs/playtest-reports";
      const modePrefix = isQualityMode ? "叙事质量 " : isDeepMode ? "深度叙事压力测试 " : "";
      console.log("\n======== " + modePrefix + "并行启动画像：" + personasToRun.map((p) => p.label).join("、") + " ========\n");

      const results = await Promise.all(
        personasToRun.map(async (p) => {
          const { label, persona, maxRounds } = p;
          const debuff = "debuff" in p ? p.debuff : undefined;
          console.log(`[${label}] 启动，最多 ${maxRounds} 轮${debuff ? `，debuff=${debuff}` : ""}，进度见 docs/playtest-reports/playtest-progress-${label}.txt`);
          const result = await runPlaytest({
            persona,
            reportLabel: label,
            progressLabel: label,
            maxRounds,
            reportDir,
            ...(debuff && { debuff })
          });
          expect(result.rounds.length).toBeGreaterThan(0);
          expect(result.report).toBeDefined();
          expect(result.report.summary).toBeDefined();
          expect(result.reportPath).toBeDefined();
          console.log(`[${label}] 完成：${result.rounds.length} 轮 | ${result.reportPath}`);
          return {
            label,
            rounds: result.rounds.length,
            path: result.reportPath,
            summary: result.report.summary || ""
          };
        })
      );

      console.log("\n======== 体验测试已全部跑完（并行） ========");
      results.forEach((r) => console.log(`  ${r.label}: ${r.rounds} 轮 → ${r.path}`));
      console.log("==========================================\n");
    },
    isQualityMode ? 3_600_000 : isDeepMode ? 6_000_000 : 18_000_000
  ); // 叙事质量约 1h；深度 4×100 约 1.5h；普通含深度三国迷 1500 轮约 5h
});
