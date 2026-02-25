/**
 * 微信云函数：裁决 API
 * 接收小游戏提交的玩家意图与状态，调用 LLM 生成剧情，返回 narrative + state_changes
 *
 * 支持的模型（任选其一配置即可）：
 * - DeepSeek：在云开发控制台 → 云函数 → adjudication → 配置 → 环境变量
 *   添加 DEEPSEEK_API_KEY = sk-xxx
 * - 腾讯混元：添加 HUNYUAN_API_KEY = 你的混元 API Key
 *   （混元控制台 https://console.cloud.tencent.com/hunyuan/start 创建）
 * 优先使用 HUNYUAN_API_KEY，若未配置则使用 DEEPSEEK_API_KEY
 */
const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
const HUNYUAN_API = "https://api.hunyuan.cloud.tencent.com/v1/chat/completions";

const SYSTEM_PROMPT = `你是一名三国文字冒险游戏的剧情裁决者。根据玩家当前状态、世界状态和玩家意图，生成简短的剧情叙述（narrative）、可选的状态变更（effects）以及 3 条与当前叙事衔接的后续可选动作（suggested_actions）。

规则：
1. narrative：1～3 句古风旁白，描述玩家的举动带来的结果，50～150 字。
2. effects：可选，字符串数组。
   - 玩家属性：如 "intelligence+2"、"gold+10"、"legend+5"、"reputation-3"。
   - 武将好感与关系（仅当剧情涉及该武将时使用）："npc_{武将id}_favor+10" 或 "npc_{武将id}_favor-5"（好感 0～100）；"npc_{武将id}_relation=acquaintance"（相识）、"npc_{武将id}_relation=sworn_brother"（义结金兰）、"npc_{武将id}_relation=spouse"（结婚）。义结金兰与结婚仅当玩家与对方均满 15 岁时生效，否则勿输出 relation=sworn_brother 或 relation=spouse。
   - 记忆碎片（关键剧情节点可写入）："npc_{武将id}_memory=一句简短关键记忆描述"（如 "npc_2010_memory=曾在洛阳共饮论天下"），用于羁绊回顾。
3. suggested_actions：必须输出，字符串数组，恰好 3 条。根据本轮叙事与当前情境，给出玩家接下来可选的 3 个动作短句（每条 4～10 字），如「前往洛阳」「与曹操对话」「打听黄巾动向」「闭关一年」。要与剧情衔接、符合三国背景。
4. 保持三国时代背景，语言简洁古风。
5. 必须严格输出 JSON，格式：{"narrative":"...", "effects":[], "suggested_actions":["动作1","动作2","动作3"]}`;

function buildUserPrompt(payload) {
  const { player_state, world_state, npc_state, player_intent, event_context = {}, logical_results, logic_override, logic_db } =
    payload;
  const parts = [];

  if (logic_override) {
    parts.push(`【强制约束】${logic_override.instruction}`);
  }

  if (logical_results && Object.keys(logical_results).length > 0) {
    const lines = [];
    if (logical_results.time_passed) {
      lines.push(`时间过去了 ${logical_results.time_passed} 年`);
    }
    if (logical_results.attribute_gained && Object.keys(logical_results.attribute_gained).length > 0) {
      const attrs = Object.entries(logical_results.attribute_gained)
        .map(([k, v]) => `${k}+${v}`)
        .join(" ");
      lines.push(`玩家属性增益（已计入状态）：${attrs}`);
    }
    if (logical_results.world_changes?.length) {
      lines.push(`该期间发生的大事：${logical_results.world_changes.join("；")}`);
    }
    if (lines.length) {
      parts.push(
        `【既定事实】系统已计算：${lines.join("；")}。你的叙事必须严格基于以上事实，不可改写时间与属性结果。这些事实权重高于对话历史。`
      );
    }
  }

  parts.push(`【玩家意图】${player_intent}`);

  parts.push(`【玩家状态】
- 武力${player_state?.attrs?.strength ?? 0} 智力${player_state?.attrs?.intelligence ?? 0} 魅力${player_state?.attrs?.charm ?? 0} 运气${player_state?.attrs?.luck ?? 0}
- 传奇度${player_state?.legend ?? 0} 声望${player_state?.reputation ?? 0}
- 资源：金${player_state?.resources?.gold ?? 0} 粮${player_state?.resources?.food ?? 0} 兵${player_state?.resources?.soldiers ?? 0}
- 位置：${player_state?.location?.region ?? ""} ${player_state?.location?.scene ?? ""}`);

  parts.push(`【世界状态】时代${world_state?.era ?? ""} ${world_state?.time?.year ?? ""}年`);

  if (player_state?.birth_year != null) {
    const year = world_state?.time?.year ?? 184;
    parts.push(`【玩家年龄】${year - player_state.birth_year}岁（出生${player_state.birth_year}年）`);
  }

  if (npc_state?.length > 0) {
    const lines = npc_state.slice(0, 30).map((n) => {
      const favor = n.player_favor ?? 0;
      const rel = n.player_relation || "无";
      return `${n.name ?? n.id}: 好感${favor} 关系${rel}`;
    });
    parts.push(`【武将与玩家关系】${lines.join("；")}`);
  }

  if (logic_db?.npcs?.length > 0) {
    const lines = logic_db.npcs.slice(0, 40).map((n) => {
      const age = n.age != null ? n.age : (world_state?.time?.year ?? 184) - n.birth_year;
      const serve = n.can_serve != null ? (n.can_serve ? "可出仕" : "未满15") : "";
      return `${n.name}: ${age}岁 ${serve}`.trim();
    });
    parts.push(`【逻辑库武将年龄/出仕】${lines.join("；")}`);
  }

  if (event_context?.recent_dialogue?.length) {
    parts.push(`【近期对话】${event_context.recent_dialogue.join("; ")}`);
  }

  if (event_context?.location_authority) {
    parts.push(`【地理位置约束】${event_context.location_authority}`);
  }
  if (event_context?.logic_conflict_instruction) {
    parts.push(`【逻辑冲突·叙事】${event_context.logic_conflict_instruction}`);
  }
  if (event_context?.logic_conflict_count != null && event_context.logic_conflict_count > 0) {
    parts.push(`【逻辑冲突计数】当前为 ${event_context.logic_conflict_count}，叙事语气须与之匹配（高时嘲讽/无视）。`);
  }
  if (event_context?.prison_life_variety_instruction) {
    parts.push(`【牢狱生活】${event_context.prison_life_variety_instruction}`);
  }
  if (event_context?.diversity_instruction) {
    parts.push(`【文案去重·叙事流派】${event_context.diversity_instruction}`);
  }
  if (event_context?.env_sensory_instruction) {
    parts.push(`【环境感官】${event_context.env_sensory_instruction}`);
  }
  if (event_context?.purchasing_power_instruction) {
    parts.push(`【货币购买力】${event_context.purchasing_power_instruction}`);
  }
  if (event_context?.suggest_summary && event_context?.summary_instruction) {
    parts.push(`【上下文压缩】${event_context.summary_instruction}`);
  }
  if (event_context?.is_opening && event_context?.opening_instruction) {
    parts.push(`【首段叙事】${event_context.opening_instruction}`);
  }
  if (event_context?.current_region_landmarks?.length > 0 && event_context?.current_region_landmarks_instruction) {
    parts.push(`【当前区域地标】${event_context.current_region_landmarks.join("、")}\n${event_context.current_region_landmarks_instruction}`);
  }
  if (event_context?.season_sensory) {
    parts.push(`【季节感官】${event_context.season_sensory}`);
  }
  if (event_context?.season_sensory_instruction) {
    parts.push(`【季节描写】${event_context.season_sensory_instruction}`);
  }
  if (event_context?.past_milestones?.length > 0 && event_context?.past_milestones_instruction) {
    parts.push(`【近期大事】${event_context.past_milestones.join("；")}\n${event_context.past_milestones_instruction}`);
  }
  if (event_context?.active_goals?.length > 0 && event_context?.active_goals_instruction) {
    parts.push(`【进行中目标】${event_context.active_goals.join("、")}\n${event_context.active_goals_instruction}`);
  }
  if (event_context?.hostile_faction_ids?.length > 0 && event_context?.hostile_factions_instruction) {
    parts.push(`【阵营黑名单】${event_context.hostile_factions_instruction}`);
  }
  if (event_context?.delayed_letter_from && event_context?.delayed_letter_instruction) {
    parts.push(`【故人旧札】${event_context.delayed_letter_instruction}`);
  }
  if (event_context?.travel_background) {
    parts.push(`【旅途背景】${event_context.travel_background}`);
    if (event_context?.travel_background_instruction) {
      parts.push(`【旅途叙事】${event_context.travel_background_instruction}`);
    }
  }
  if (event_context?.require_supporting_npc_line && event_context?.supporting_npc_instruction) {
    parts.push(`【辅兵/下属台词】${event_context.supporting_npc_instruction}`);
  }
  if (event_context?.aspiration_alignment_instruction) {
    parts.push(`【志向对齐】${event_context.aspiration_alignment_instruction}`);
  }
  if (event_context?.scene_focus_instruction) {
    parts.push(`【即时场景】${event_context.scene_focus_instruction}`);
  }
  if (event_context?.cross_region_travel && event_context?.travel_encounter_instruction) {
    parts.push(`【跨区域移动·路途奇遇】${event_context.travel_encounter_instruction}`);
  }
  if (event_context?.folk_rumors?.length > 0 && event_context?.folk_rumors_instruction) {
    parts.push(`【民间传闻】${event_context.folk_rumors.join("；")}\n${event_context.folk_rumors_instruction}`);
  }
  if (event_context?.bond_emotional_brief?.length > 0 && event_context?.bond_emotional_instruction) {
    parts.push(`【羁绊·物是人非】${event_context.bond_emotional_instruction}`);
  }

  if (event_context?.time_instruction) {
    parts.push(`【时间与叙事约束】${event_context.time_instruction}`);
  }

  if (event_context?.historical_summary) {
    parts.push(`【历史变迁简报】${event_context.historical_summary}`);
    if (event_context.historical_summary_instruction) {
      parts.push(`【叙事要求】${event_context.historical_summary_instruction}`);
    }
  }

  if (event_context?.narrative_instruction) {
    parts.push(`【叙事风格】${event_context.narrative_instruction}`);
  }

  if (event_context?.narrative_safety_instruction) {
    parts.push(String(event_context.narrative_safety_instruction));
  }

  if (event_context?.relationship_rules) {
    parts.push(`【关系与年龄规则】${event_context.relationship_rules}`);
  }

  if (event_context?.history_deviation_instruction) {
    parts.push(`【历史偏移】${event_context.history_deviation_instruction}`);
  }

  if (event_context?.playstyle_context) {
    parts.push(`【玩法与志向权重】\n${event_context.playstyle_context}`);
  }
  if (event_context?.destiny_goal) {
    parts.push(`【玩家愿望】玩家开局填写的愿望：${event_context.destiny_goal}`);
    if (event_context?.destiny_goal_instruction) {
      parts.push(`【愿望引导与心理活动】${event_context.destiny_goal_instruction}`);
    }
  }

  if (event_context?.negative_constraints) {
    parts.push(`【叙事去重】${event_context.negative_constraints}`);
  }
  if (event_context?.perspective_switch_instruction) {
    parts.push(`【视角切换】${event_context.perspective_switch_instruction}`);
  }
  if (event_context?.atmosphere_generator_instruction) {
    parts.push(`【环境流逝】${event_context.atmosphere_generator_instruction}`);
  }
  if (event_context?.memory_resonance_tags?.length > 0 && event_context?.memory_resonance_instruction) {
    parts.push(`【联觉唤醒·关键记忆标签】${event_context.memory_resonance_tags.join("、")}\n${event_context.memory_resonance_instruction}`);
  }
  if (event_context?.debuff_active?.length > 0 && event_context?.debuff_narrative_instruction) {
    parts.push(`【负面状态】${event_context.debuff_narrative_instruction}`);
  }
  if (logical_results?.physiological_success_factor != null) {
    parts.push(`【生理成功率因子】本回合生理状态折算的成功率因子为 ${logical_results.physiological_success_factor}，叙事与判定须与此一致。`);
  }

  parts.push(
    `请输出 JSON：{"narrative":"...", "effects":[], "suggested_actions":["动作一","动作二","动作三"]}。effects 可包含玩家属性及武将好感/关系；suggested_actions 必须为恰好 3 条与当前叙事衔接的后续可选动作（4～10 字/条）。`
  );
  return parts.join("\n\n");
}

const LLM_REQUEST_TIMEOUT_MS = 120000; // 单次 LLM 请求最长 2 分钟，避免 read ETIMEDOUT 导致长线测试中断

function callLLM(url, apiKey, model, messages, maxTokens = 512) {
  return new Promise((resolve, reject) => {
    const https = require("https");
    const data = JSON.stringify({
      model,
      messages,
      temperature: 0.8,
      max_tokens: maxTokens
    });
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (resp) => {
        let body = "";
        resp.on("data", (chunk) => (body += chunk));
        resp.on("end", () => {
          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error("LLM 返回解析失败"));
            }
          } else {
            reject(new Error(`LLM API ${resp.statusCode}: ${body}`));
          }
        });
      }
    );
    req.setTimeout(LLM_REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`LLM 请求超时（${LLM_REQUEST_TIMEOUT_MS / 1000} 秒），请检查网络或稍后重试`));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * 解析 LLM 返回的 narrative + effects。
 * 支持：完整 JSON、被截断的 JSON（从片段中抽取 narrative）、以及 ```json 代码块。
 */
function parseLLMOutput(content) {
  let raw = (content || "").trim();
  if (!raw) {
    console.warn("[adjudication] LLM 返回内容为空，请检查 HUNYUAN_API_KEY 或 DEEPSEEK_API_KEY 及网络");
    return {
      narrative: "（未收到大模型回复，请检查云函数环境变量中的 API Key 与网络）",
      effects: [],
      suggested_actions: []
    };
  }
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const jsonStr = jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr);
      const narrative =
        parsed.narrative ||
        parsed.叙事 ||
        parsed.text ||
        (typeof parsed.content === "string" ? parsed.content : "") ||
        "";
      const effects = Array.isArray(parsed.effects) ? parsed.effects : [];
      const suggested_actions = Array.isArray(parsed.suggested_actions)
        ? parsed.suggested_actions.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 3)
        : [];
      if (narrative && String(narrative).trim() !== "") {
        return { narrative: String(narrative).trim(), effects, suggested_actions };
      }
      if (!narrative || String(narrative).trim() === "") {
        console.warn("[adjudication] JSON 中无 narrative/叙事 字段或为空，keys:", Object.keys(parsed));
      }
    } catch (e) {
      console.warn("[adjudication] JSON 解析失败:", e?.message, "片段:", jsonStr.slice(0, 150));
    }
  }
  // 完整 JSON 不存在或解析失败时，尝试从截断/片段中抽取 narrative（常见于 API 返回被截断）
  const narrativeClosed = raw.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[,}]/);
  if (narrativeClosed && narrativeClosed[1]) {
    const unescaped = narrativeClosed[1].replace(/\\"/g, '"').trim();
    if (unescaped.length > 0) {
      console.log("[adjudication] 从完整 JSON 片段中解析出 narrative，长度:", unescaped.length);
      return { narrative: unescaped, effects: [], suggested_actions: [] };
    }
  }
  // 无闭合引号：整段内容在 "narrative": " 之后被截断
  const narrativeToEnd = raw.match(/"narrative"\s*:\s*"([\s\S]*)$/);
  if (narrativeToEnd && narrativeToEnd[1]) {
    const unescaped = narrativeToEnd[1].replace(/\\"/g, '"').trim();
    if (unescaped.length > 0) {
      console.log("[adjudication] 从截断内容中解析出 narrative（无闭合引号），长度:", unescaped.length);
      return { narrative: unescaped, effects: [], suggested_actions: [] };
    }
  }
  console.warn("[adjudication] LLM 输出无有效 JSON 且无法抽取 narrative，原始内容前 300 字:", raw.slice(0, 300));
  return {
    narrative: "（叙事解析异常：LLM 未返回合法 JSON，请查看云函数日志中 [adjudication] 的原始输出）",
    effects: [],
    suggested_actions: []
  };
}

function makeResponse(result, state_changes, audio_trigger) {
  const res = { result, state_changes };
  if (audio_trigger) res.audio_trigger = audio_trigger;
  return res;
}

exports.main = async (event, context) => {
  const hunyuanKey = process.env.HUNYUAN_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const useHunyuan = hunyuanKey && String(hunyuanKey).trim().length > 0;
  const useDeepSeek = deepseekKey && deepseekKey.startsWith("sk-");
  const apiKey = useHunyuan ? hunyuanKey : useDeepSeek ? deepseekKey : null;
  const isHttp = !!event.body;

  if (!apiKey) {
    const res = makeResponse(
      { narrative: "裁决服务配置异常，请配置 HUNYUAN_API_KEY 或 DEEPSEEK_API_KEY。", effects: [] },
      undefined
    );
    return isHttp ? { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify(res) } : res;
  }

  let payload = event;
  if (event.body) {
    try {
      payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return isHttp
        ? { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "请求体 JSON 解析失败" }) }
        : makeResponse({ narrative: "请求格式错误。", effects: [] }, undefined);
    }
  }

  const { player_intent } = payload;
  if (!player_intent) {
    const res = makeResponse({ narrative: "缺少意图。", effects: [] }, undefined);
    return isHttp ? { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify(res) } : res;
  }

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(payload) }
    ];
    const url = useHunyuan ? HUNYUAN_API : DEEPSEEK_API;
    const model = useHunyuan ? "hunyuan-turbos-latest" : "deepseek-chat";
    const eventCtx = payload.event_context || {};
    const requested = eventCtx.narrative_max_tokens ?? 512;
    const maxTokens = Math.max(512, requested + 200);
    let res;
    try {
      res = await callLLM(url, apiKey, model, messages, maxTokens);
    } catch (firstErr) {
      const firstMsg = firstErr?.message || "";
      if ((firstMsg.includes("ETIMEDOUT") || firstMsg.includes("超时")) && !firstMsg.includes("重试")) {
        console.warn("[adjudication] 首次 LLM 请求超时，2 秒后重试一次");
        await new Promise((r) => setTimeout(r, 2000));
        res = await callLLM(url, apiKey, model, messages, maxTokens);
      } else {
        throw firstErr;
      }
    }
    const content = res?.choices?.[0]?.message?.content?.trim() ?? "";
    console.log("[adjudication] LLM 返回长度:", content.length);
    let { narrative, effects, suggested_actions } = parseLLMOutput(content);
    if (!narrative || String(narrative).trim() === "") {
      console.warn("[adjudication] parseLLMOutput 后 narrative 为空，强制兜底");
      narrative = "（未收到大模型剧情，请检查云函数日志中的 DEEPSEEK_API_KEY / HUNYUAN_API_KEY 与网络）";
    }
    narrative = String(narrative).replace(/\uFFFD+/g, "你");
    console.log("[adjudication] 最终 narrative 长度:", narrative.length);

    const audio_trigger = payload.logical_results?.audio_trigger;
    const resultPayload = { narrative, effects };
    if (Array.isArray(suggested_actions) && suggested_actions.length >= 3) {
      resultPayload.suggested_actions = suggested_actions.slice(0, 3);
    }
    const response = makeResponse(
      resultPayload,
      effects.length ? { player: effects } : undefined,
      audio_trigger
    );

    return isHttp
      ? { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) }
      : response;
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("裁决失败:", err);
    const hint =
      msg.includes("401") || msg.includes("403")
        ? "API 密钥可能无效或已过期，请检查云函数环境变量。"
        : msg.includes("429")
          ? "请求过于频繁，请稍后再试。"
          : msg.includes("timeout") || msg.includes("ETIMEDOUT")
            ? "大模型响应超时（已设 2 分钟并自动重试一次），若仍失败请检查网络或云函数超时配置。"
            : msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")
              ? "无法连接大模型服务，请检查网络。"
              : `大模型调用失败：${msg.slice(0, 80)}`;
    const res = makeResponse(
      { narrative: `天有不测风云，你的举动暂时未能得到回应。${hint}`, effects: [] },
      undefined
    );
    return isHttp ? { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify(res) } : res;
  }
};
