# event_context 键来源说明

裁决请求中的 `event_context` 由 **snapshot（含 eventContextPipeline）** 与 **preAdjudicator** 共同填充。新增键时请按职责放入对应位置。

## 来源分工

| 来源 | 职责 |
|------|------|
| **snapshot + eventContextPipeline** | 与当前 saveData / 意图 / 对话轮次 / 世界状态相关的**静态或缓变**叙事约束（地点权威、去重、季节、愿望、关系规则、时间跳跃过场白等）。 |
| **preAdjudicator** | **本回合逻辑结果**（time_passed、stamina、生理因子、logic_override、game_over_reason）以及「因本回合判定结果才需要的」少量 event_context 补充（如生理失败时的叙事指令、时间是否推进、长篇叙事等级等）。 |

## 键名 → 来源一览

### snapshot / eventContextPipeline 写入

（snapshot.ts 中直接写入或通过 `buildSnapshotInstructions` 得到后 `Object.assign` 进 event_context）

| 键名 | 说明 |
|------|------|
| `dialogue_rounds` | 对话轮次（你：/你说： 条数） |
| `season_sensory` | 季节感官描述（如盛夏蝉鸣） |
| `env_sensory_instruction` | 环境感官 Prompt |
| `current_region_landmarks` | 当前区域地标 |
| `history_deviation` | 历史偏移 flag 列表 |
| `active_goals` | 玩家当前目标 |
| `hostile_faction_ids` | 敌对势力 id 列表 |
| `past_milestones` | 近期大事记 |
| `travel_background` | 移动意图时的路途背景（季节、地貌等） |
| `travel_minimal_hours` | 移动最小耗时（如 2） |
| `travel_background_instruction` | 旅途叙事说明 |
| `require_supporting_npc_line` | 是否要求辅兵/路人台词 |
| `supporting_npc_instruction` | 辅兵台词说明 |
| `location_authority` | 地点权威约束 |
| `logic_conflict_instruction` | 逻辑冲突高时（≥阈值）的嘲讽/无视指令 |
| `prison_life_variety_instruction` | 牢狱场景多样性 |
| `diversity_instruction` | 叙事去重/多样化 |
| `negative_constraints` | 负面约束（禁止重复表述等） |
| `perspective_switch_instruction` | 视角切换提示 |
| `atmosphere_generator_instruction` | 被动动作（静坐/观察）环境流逝 |
| `time_skip_instruction` | 时间跳跃叙事说明 |
| `purchasing_power_instruction` | 货币购买力约束 |
| `suggest_summary` / `summary_instruction` | 长对话压缩摘要 |
| `is_opening` / `opening_instruction` | 开局志向开场 |
| `relationship_rules` | 关系规则 |
| `narrative_safety_instruction` | 叙事安全 |
| `core_safety_constitution` | 安全宪法 |
| `jailbreak_response_variety_instruction` | 越狱应对多样化 |
| `history_deviation_instruction` | 历史偏移说明 |
| `playstyle_context` | 志向/称号玩法权重 |
| `destiny_goal` / `destiny_goal_instruction` | 志向愿望与软性引导 |
| `active_goals_instruction` | 当前目标说明 |
| `hostile_factions_instruction` | 敌对势力说明 |
| `past_milestones_instruction` | 大事记说明 |
| `delayed_letter_from` / `delayed_letter_instruction` | 故人旧札 |
| `current_region_landmarks_instruction` | 当前地标说明 |
| `season_sensory_instruction` | 季节感官说明 |
| `memory_resonance_tags` / `memory_resonance_instruction` | 联觉唤醒/物是人非 |

### preAdjudicator 写入

（在 preAdjudicator 内基于 logical_results 与本回合判定结果写入 baseEventContext）

| 键名 | 说明 |
|------|------|
| `new_time` | 本回合权威时间（logical_results.new_time） |
| `temporal_authority` | 时序硬约束说明 |
| `logic_conflict_count` | 逻辑冲突计数（高时叙事切换嘲讽/无视） |
| `debuff_active` | 负面状态标签（重伤/断粮/中毒等） |
| `debuff_narrative_instruction` | 负面状态叙事强制体现 |
| `aspiration_alignment_instruction` | 每 10 轮志向对齐 |
| `time_advanced` | 本回合是否推进了时间 |
| `time_instruction` | 时间是否推进的叙事说明 |
| `scene_focus_instruction` | 未推进时间时的即时场景聚焦 |
| `narrative_feedback_level` | 叙事反馈等级 1/2/3 |
| `narrative_style` | concise / detailed / novelistic |
| `narrative_max_tokens` | 256 / 480 / 900 |
| `narrative_instruction` | 本回合叙事长度与风格说明 |
| `cross_region_travel` | 是否跨区域移动 |
| `travel_encounter_instruction` | 跨区域路途奇遇说明 |
| `folk_rumors` | 民间传闻 |
| `folk_rumors_instruction` | 民间传闻使用说明 |
| `events_in_period` | 时间跨度内历史事件 |
| `historical_summary` | 岁月沧桑摘要 |
| `historical_summary_instruction` | 历史摘要叙事要求 |
| `bond_emotional_brief` | 羁绊情感简报（久别重逢等） |
| `bond_emotional_instruction` | 羁绊情感叙事要求 |

---

新增键时：若与「当前存档/意图/轮次/世界」相关且不依赖本回合逻辑结果 → snapshot/eventContextPipeline；若依赖本回合时间推进、体力、生理失败、逻辑冲突计数等 → preAdjudicator。
