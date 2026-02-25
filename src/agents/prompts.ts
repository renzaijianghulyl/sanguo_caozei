import { registerPrompt } from "@core/contentRegistry";
import {
  DIVERSITY_LOOKBACK_LINES,
  DIVERSITY_MIN_LINES,
  DIVERSITY_OVERLAP_THRESHOLD
} from "@config/instructionThresholds";

export const PROMPT_KEYS = {
  SYSTEM: "system",
  SAFETY: "safety",
  NEW_PLAYER: "new_player",
  REPUTATION_PERSONA: "reputation_persona",
  TRAVEL_NARRATIVE: "travel_narrative",
  STATE_AWARE_NARRATIVE: "state_aware_narrative",
  NO_TEMPLATE_OPENING: "no_template_opening",
  NPC_DYNAMIC_FEEDBACK: "npc_dynamic_feedback",
  ENV_SENSORY: "env_sensory",
  SUPPORTING_NPC_LINE: "supporting_npc_line",
  INFAMY_NARRATIVE: "infamy_narrative",
  ASPIRATION_GUIDANCE: "aspiration_guidance",
  LOGIC_CONFLICT_HIGH: "logic_conflict_high",
  LOCATION_AUTHORITY: "location_authority",
  PRISON_LIFE_VARIETY: "prison_life_variety",
  PURCHASING_POWER: "purchasing_power",
  SUMMARY_COMPRESS: "summary_compress",
  OPENING_AMBITION: "opening_ambition",
  NARRATIVE_INNER_MONOLOGUE: "narrative_inner_monologue",
  RELATIONSHIP_RULES: "relationship_rules",
  DESTINY_GOAL_SOFT: "destiny_goal_soft",
  ACTIVE_GOALS: "active_goals",
  HOSTILE_FACTIONS: "hostile_factions",
  PAST_MILESTONES: "past_milestones",
  DELAYED_LETTER: "delayed_letter",
  CURRENT_REGION_LANDMARKS: "current_region_landmarks",
  SEASON_SENSORY: "season_sensory",
  /** 静坐/等待/观察等被动动作时的环境流逝模板，侧重微观变化 */
  ATMOSPHERE_GENERATOR: "atmosphere_generator",
  /** 生理状态导致动作失败时，强制首句描写生理痛苦 */
  PHYSIOLOGICAL_FAILURE_NARRATIVE: "physiological_failure_narrative",
  /** 中长期记忆联觉唤醒：关联关键事件，体现物是人非 */
  MEMORY_RESONANCE: "memory_resonance"
} as const;

export function bootstrapDefaultPrompts(): void {
  registerPrompt(
    PROMPT_KEYS.SYSTEM,
    "占位 System Prompt：请保持古风旁白，后续由内容团队提供正式文案。"
  );
  registerPrompt(
    PROMPT_KEYS.REPUTATION_PERSONA,
    "【名望与称呼】根据 player_state.reputation 调整 NPC 对玩家的称呼与态度：\n" +
      "- reputation 0～20（无名小卒）：称呼「你」「这位」「小辈」\n" +
      "- reputation 21～50（初露锋芒）：称呼「壮士」「义士」\n" +
      "- reputation 51～75（声名鹊起）：称呼「将军」「明公」「阁下」\n" +
      "- reputation 76～100（威震天下）：称呼「明公」「主公」「将军」，态度恭敬。\n" +
      "叙事中 NPC 的措辞、语气须与玩家名望相称。"
  );
  registerPrompt(
    PROMPT_KEYS.TRAVEL_NARRATIVE,
    "【移动/旅途叙事】禁止在移动动作中一笔带过。请根据 logical_results.time_passed（以及 time_passed_months）描写旅途中的岁月流逝感，例如：鞋履的破损、马匹的消瘦、沿途百姓的生活缩影、风尘仆仆的疲惫感。若 event_context 中提供 travel_background（季节、地貌、疲劳暗示），请结合其与时间跨度进行叙事。"
  );
  registerPrompt(
    PROMPT_KEYS.STATE_AWARE_NARRATIVE,
    "【状态感知叙事】每一轮叙事的开头，请根据 player_state 的 stamina（体力）与 attrs.charm（魅力）表现角色的第一人称体感：体力低时可写疲惫、饥饿感或步履沉重；魅力高时可写自信、气度从容；体力充沛且魅力高时可写神采奕奕；反之可写局促、低调或力不从心。用 1～2 句自然融入，勿单独成段罗列数值。"
  );
  registerPrompt(
    PROMPT_KEYS.NO_TEMPLATE_OPENING,
    "【去重与负向约束】严禁重复使用「岁月如刀」「闭门苦修」「岁月沧桑，一载光阴倏忽而过」等模板化开场白。若 logical_results.time_passed 为 0 或未跨年（time_passed_months < 12），禁止进行年度总结、天下大势段落或「这些年里」式回顾；直接写本回合动作的即时结果与当前场景。"
  );
  registerPrompt(
    PROMPT_KEYS.NPC_DYNAMIC_FEEDBACK,
    "【NPC 动态反馈】NPC 的对话与反应不能仅是「颔首」「赞许」等笼统描写。必须根据 logic_db.npcs 中该武将的 personality_traits 与 speech_style 给出具体、贴合人设的反馈。例如：皇甫嵩应带军令感、严厉、老将持重；荀彧应带谋略与择主之论、温文而切中要害；曹操应带枭雄气与用兵之志。每位 NPC 的台词与动作须体现其性格标签，避免千篇一律。"
  );
  registerPrompt(
    PROMPT_KEYS.ENV_SENSORY,
    "【强制环境渲染】每轮回复的「系统」场景描述中，必须包含至少一处由动词引导的感官细节（如：风在吹、火在跳、兵刃在碰撞、鸦鸣、马蹄声、落叶簌簌、炊烟袅袅），避免纯静态罗列。将感官细节自然融入叙事，勿单独成句堆砌。"
  );
  registerPrompt(
    PROMPT_KEYS.SUPPORTING_NPC_LINE,
    "【辅兵/下属台词】当本回合为事务性清点、整顿、点验、安抚伤兵等时，叙事中须随机让一名辅兵或下属说出一句带情绪的短台词（如：「校尉，我们真的能赢吗？」「这点粮草，能撑到月底就不错了。」），通过 NPC 的情绪反映当前氛围，避免冷冰冰的清单式回复。"
  );
  registerPrompt(
    PROMPT_KEYS.INFAMY_NARRATIVE,
    "【高恶名叙事】当 player_state.infamy 较高（如 ≥30）时，叙事风格须更加阴冷、压抑，强调因果循环与报应感。例如：抢来的马匹在夜间因无人照看而逃逸、劫掠所得引来追兵或内讧、纵火处余烬中偶见冤魂般的剪影。不必每段都写报应，但整体语气应让玩家感受到恶行带来的阴霾与代价。"
  );
  registerPrompt(
    PROMPT_KEYS.ASPIRATION_GUIDANCE,
    "【立志与主线软性引导】若 event_context 中有 destiny_goal，表示玩家开局已表露愿望。引导须软性化：不要在屏幕或叙事中跳出「主线任务：去买米」；应通过 NPC 对话、环境暗示或 suggested_actions 自然引导。例如：村长可说「既然你想经商，颍川战乱不休，不如先去县城倒卖些干草，积攒本钱再去洛阳闯荡。」当玩家迷茫或询问建议时，再根据 destiny_goal 给出贴合语境的指引（如：若想成就大业，这点口粮怕是撑不到你走出颍川）。"
  );
  registerPrompt(
    PROMPT_KEYS.LOGIC_CONFLICT_HIGH,
    "【逻辑冲突·高时叙事】当 event_context 中 logic_conflict_count 较高（≥3）时：停止对玩家悖论进行解释或说教；转而以嘲讽、无视、或将其视为精神错乱的态度进行叙事。NPC 可冷笑、敷衍、或直接当作疯话处理，勿再重复纠正时间线/地理位置；用简短、带情绪的回应替代长篇解释。"
  );
  registerPrompt(
    PROMPT_KEYS.LOCATION_AUTHORITY,
    "【地理位置硬约束】叙事中的场景、环境、NPC 所在必须以 player_state.location 与 logic_db.regions 中对应区域（RegionRecord）为准。禁止顺着玩家自称的错误地理位置（如玩家声称在益州时实际在颍川）进行描写；若玩家自称与事实不符，叙事应体现 NPC 的质疑、嘲讽或无视，场景仍以当前真实所在地为准。"
  );
  registerPrompt(
    PROMPT_KEYS.PRISON_LIFE_VARIETY,
    "【牢狱生活·随机细节】玩家处于牢狱/囚禁状态。本回合叙事请避免重复「铁门落下」等固定描写；可随机融入以下细节之一：其他囚犯抢牢饭、老鼠爬过脚边、狱卒呵斥、隔壁囚室呻吟、窗外光影变化、梦魇、送饭时的只言片语等，用细节打破复读感。"
  );
  registerPrompt(
    PROMPT_KEYS.PURCHASING_POWER,
    "【货币购买力约束】交易与物价叙事须符合逻辑：禁止出现「五金」买下「五十金」价值物资等数值崩坏；须根据当前世界时间、战乱程度与地域体现合理折价或溢价，一笔交易中支付金额与所得物资价值量级须大致相当。"
  );
  registerPrompt(
    PROMPT_KEYS.SUMMARY_COMPRESS,
    "【上下文压缩提示】当前对话已超过 10 轮，请在本轮叙事末尾附上一段 2～3 句的剧情摘要（可另起一行，标注「【剧情摘要】」），便于后续压缩上下文、减少 Token 消耗。"
  );
  registerPrompt(
    PROMPT_KEYS.OPENING_AMBITION,
    "【首段叙事】请根据 player_state.ambition 在本轮回复开头生成一段专属内心独白。unify（天下一统）：侧重「不忍见苍生受苦，欲提三尺剑立不世之功」；wealth（富甲天下）：侧重「乱世之中，唯有掌握天下之财，方能左右棋局」；fortress（割据一方）：侧重「厌倦纷争，守住一方乐土，让百姓安居」；scholar（一代名士）：侧重「无意争霸，但求结交贤才、著书立说、留下千古美名」。独白后再写对玩家意图的叙事反馈。"
  );
  registerPrompt(
    PROMPT_KEYS.NARRATIVE_INNER_MONOLOGUE,
    "【心理活动与愿望呼应】当产生长文案反馈（Level 3）时，请在正文前或结尾处增加一段以「我」为视角的括号内心独白。若 event_context 中有 destiny_goal（玩家开局填写的愿望），内心独白须与该愿望相呼应，作为对玩家的暗示与引导：愿望偏天下、功业时可写（我握紧剑柄，心想：这乱世，终须有人来终结）；偏财富、经商时可写（看着市集人流，我暗忖：钱财聚散，终有一日我要执掌商路）；偏割据、安宁时可写（望着城郭，我自忖：若能守得一方百姓安居，便足矣）；偏名士、著书时可写（抚过案头书卷，我心想：功名如烟，唯文章可传世）。无 destiny_goal 时则写与当前情境相符的普遍心理活动。"
  );
  registerPrompt(
    PROMPT_KEYS.RELATIONSHIP_RULES,
    "【关系与年龄规则】npc_state 中每位武将有 player_favor（玩家对其好感度 0～100）、player_relation（与玩家关系：空、acquaintance 相识、sworn_brother 义结金兰、spouse 结婚）；武将间关系见 relations（npc_id -> 好感度）。逻辑库中每名武将有 age、can_serve、father_id（血缘锁定）、owner_faction_id（阵营锁定）。未满 15 岁仅为娃娃不可出仕；义结金兰与结婚均需玩家与对方武将都满 15 岁。结拜/婚配叙事权限：仅当该武将好感度≥90 且符合史实逻辑时方可解锁，否则不得生成结拜或婚配剧情。叙事与判定须严格遵守上述年龄、血缘、阵营与关系设定。"
  );
  registerPrompt(
    PROMPT_KEYS.DESTINY_GOAL_SOFT,
    "【主线软性引导】玩家的初始愿望（destiny_goal）见上。之后的每一轮叙事与 suggested_actions 须自然向此目标靠拢，但不要硬性弹出「主线任务：去做某某」；应通过 NPC 对话、环境暗示或建议动作软性引导（例如：若想经商，村长可说「不如先去县城倒卖些干草，积攒本钱再去洛阳闯荡」）。当玩家迷茫或询问建议时，再根据 destiny_goal 给出贴合语境的指引。叙事中可自然穿插 1～2 句与愿望相关的括号内心独白（心理活动），让玩家感受到愿望在被呼应，增强代入感。"
  );
  registerPrompt(
    PROMPT_KEYS.ACTIVE_GOALS,
    "【目标引导】玩家当前进行中的目标见上，叙事与 suggested_actions 可与之衔接，在合适时机自然提及进展或下一步。"
  );
  registerPrompt(
    PROMPT_KEYS.HOSTILE_FACTIONS,
    "【阵营黑名单】玩家已对以下势力（owner_faction_id 在列表中）做过破坏动作，logic_db.npcs 中归属这些势力的 NPC 对你极度戒备且带有敌意，拒绝提供任何实质性帮助；除非玩家支付重金或进行威逼，否则叙事中须体现其冷淡、回避或敌意。"
  );
  registerPrompt(
    PROMPT_KEYS.PAST_MILESTONES,
    "【近期大事】以下为玩家近期经历，叙事须与之衔接，避免记忆跳跃（如玩家刚去过洛阳、刚达成某羁绊，回复中应自然体现）。"
  );
  registerPrompt(
    PROMPT_KEYS.DELAYED_LETTER,
    "【故人旧札】玩家上回合经历长时间闭关或远行，本回合叙事中可自然提及：在旧箧中发现该故人发来的发黄书信或口信，以体现时光流逝与羁绊。"
  );
  registerPrompt(
    PROMPT_KEYS.CURRENT_REGION_LANDMARKS,
    "玩家当前所在区域地标如下，请在环境描写中自然融入 1～2 处，增强身临其境感。"
  );
  registerPrompt(
    PROMPT_KEYS.SEASON_SENSORY,
    "请在环境描写中自然体现当前季节感官（如盛夏蝉鸣、深秋落叶、冬日寒风），勿生硬堆砌。"
  );
  registerPrompt(
    PROMPT_KEYS.ATMOSPHERE_GENERATOR,
    "【环境流逝·被动动作】本回合为静坐、等待、观察等被动动作。叙事须侧重时间流逝带来的微观变化：如影子的移动、茶叶的沉浮、远方隐约的犬吠、炉灰冷却的细微爆裂、檐水滴答的疏密变化等，避免空洞的意境渲染或重复前几轮已用的意象。"
  );
  registerPrompt(
    PROMPT_KEYS.PHYSIOLOGICAL_FAILURE_NARRATIVE,
    "【生理失败·强制体现】本回合动作因重伤/断粮/中毒等生理状态被判定为失败。叙事首句必须直接描述生理痛苦（如：头晕目眩、四肢百骸如针扎、饥肠辘辘导致眼前发黑），严禁出现「虽然你很累，但你依然成功完成了……」这类软绵绵的叙事。失败即失败，须让玩家感受到身体极限。"
  );
  registerPrompt(
    PROMPT_KEYS.MEMORY_RESONANCE,
    "【联觉唤醒·物是人非】event_context 中若提供 memory_resonance_tags，表示玩家曾在很久以前与此地/此人/此物有过关键交集。请在本轮描述中自然关联该事件，体现出物是人非的对比感或似曾相识的既视感，增强蝴蝶效应的参与感。"
  );
}

/** 备用叙事流派：当最近 5 轮 system_output 关键词重合度 > 70% 时强制随机选用其一 */
const NARRATIVE_STYLE_ALTERNATIVES: ReadonlyArray<{ name: string; instruction: string }> = [
  {
    name: "简练史书法",
    instruction:
      "【文案去重·本回合叙事流派】请采用「简练史书法」：句式短促、少修饰，类似史书笔法（如「某日，某人至某地，见某景」），避免长句堆砌与重复前几轮已用的意象。"
  },
  {
    name: "细腻白描法",
    instruction:
      "【文案去重·本回合叙事流派】请采用「细腻白描法」：以一处具体物象或动作切入（如「烛芯爆了个灯花」「檐角滴下昨夜积雨」），再展开场景，避免与前几轮雷同的概括式开场。"
  },
  {
    name: "市井评书法",
    instruction:
      "【文案去重·本回合叙事流派】请采用「市井评书法」：略带说书口吻或市井俗语，可适当用「却说」「且说」「这厢」等衔接，语气与前几轮区分开。"
  }
];


/** 从单条叙事中提取关键词（2～4 字片段），用于重合度检测 */
function extractKeywords(text: string): Set<string> {
  const normalized = text.replace(/[，。！？、；\s：「」『』（）]+/g, " ").trim();
  const set = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    for (let len = 2; len <= 4 && i + len <= normalized.length; len++) {
      const seg = normalized.slice(i, i + len);
      if (seg.length >= 2) set.add(seg);
    }
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 文案去重引擎：检测最近 5 轮 system_output 关键词重合度，若 > 70% 则返回随机备用叙事流派指令。
 * 供 snapshot 注入 event_context.diversity_instruction。
 */
export function getDiversityInstruction(dialogueHistory: string[] | undefined): string | undefined {
  if (!dialogueHistory?.length) return undefined;
  const systemLines = dialogueHistory.filter((line) => !/^你[：:]/.test(line.trim())).slice(-DIVERSITY_LOOKBACK_LINES);
  if (systemLines.length < DIVERSITY_MIN_LINES) return undefined;
  const sets = systemLines.map((line) => extractKeywords(line));
  let totalJaccard = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      totalJaccard += jaccard(sets[i], sets[j]);
      pairs++;
    }
  }
  const avgOverlap = pairs > 0 ? totalJaccard / pairs : 0;
  if (avgOverlap <= DIVERSITY_OVERLAP_THRESHOLD) return undefined;
  const idx = Math.floor(Math.random() * NARRATIVE_STYLE_ALTERNATIVES.length);
  return NARRATIVE_STYLE_ALTERNATIVES[idx].instruction;
}
