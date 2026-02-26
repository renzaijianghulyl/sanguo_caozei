# 裁决 API 契约说明

本文档描述客户端与云函数/HTTP 裁决服务之间的 Request/Response 结构及 `event_context`、`logical_results` 常用字段，便于云函数与多端对齐、Mock 与自动化测试。

## Request（AdjudicationRequest）

| 字段 | 类型 | 说明 |
|------|------|------|
| `player_state` | PlayerState | 玩家状态（属性、资源、位置、体力、健康度、志向等） |
| `world_state` | WorldState | 世界状态（时间、history_flags 等） |
| `npc_state` | NPCState[] | NPC 状态（位置、好感、羁绊等） |
| `event_context` | Record<string, unknown>? | 叙事约束与引导键值，见 [event-context-sources.md](./event-context-sources.md) |
| `player_intent` | string | 玩家本回合意图文本 |
| `logical_results` | LogicalResults? | 逻辑层预处理结果（时间推进、体力消耗等），见下 |
| `logic_override` | LogicOverride? | 存在时表示逻辑层判定为不可能，LLM 必须描写失败 |
| `logic_db` | LogicDbContext? | 三国结构化数据库（城池、武将），供 LLM 参考 |

## Response（AdjudicationResponse）

| 字段 | 类型 | 说明 |
|------|------|------|
| `result` | object? | 叙事与效果 |
| `result.narrative` | string? | 本回合叙事正文 |
| `result.effects` | string[]? | 效果列表（如 strength+5、npc_2001_favor+10） |
| `result.suggested_actions` | string[]? | 与叙事衔接的后续可选动作（优先使用） |
| `result.suggested_goals` | string[]? | 重要剧情转折时的阶段性目标，合并入 player.active_goals |
| `state_changes` | object? | 状态变更 |
| `state_changes.player` | string[]? | 玩家侧变更（与 effects 同格式，可合并解析） |
| `state_changes.world` | Partial<WorldState>? | 世界状态增量（时间、history_flags 等） |
| `audio_trigger` | string? | 环境音效触发标签 |

## logical_results（LogicalResults）

逻辑层（preAdjudicator）预处理后的既定事实，供 LLM 基于事实做文学化叙事。

| 字段 | 类型 | 说明 |
|------|------|------|
| `time_passed` | number? | 经过的年数（时间跳跃） |
| `time_passed_months` | number? | 经过的月数 |
| `new_time` | { year, month }? | 推进后的权威时间 |
| `attribute_gained` | object? | 属性增益（如闭关导致） |
| `world_changes` | string[]? | 该时间跨度内发生的世界大事 |
| `folk_rumors` | string[]? | 民间传闻，供 NPC 对话自然提及 |
| `stamina_cost` | number? | 本回合体力消耗 |
| `infamy_delta` | number? | 本回合恶行导致的恶名增加 |
| `hostile_faction_add` | string? | 本回合加入的敌对势力 id |
| `audio_trigger` | string? | 环境音效标签（如 war / history / calm） |
| `success_rate_modifier` | number? | 成功率修正（-1～1），重伤/断粮等时可为 -0.5 |
| `physiological_success_factor` | number? | 生理成功率因子 0～1 |
| `health_delta` | number? | 本回合健康度变化量 |
| `game_over_reason` | string? | 非空时表示游戏终止，前端展示结束界面 |

## logic_override（LogicOverride）

当玩家意图不可能实现时，逻辑层强制 LLM 描写失败。

| 字段 | 类型 | 说明 |
|------|------|------|
| `reason` | string | 原因标识（如 impossible_battle / beyond_timeline） |
| `instruction` | string | 给模型的简短说明 |

## 存档版本与迁移

- 存档结构见 `GameSaveData`（@core/state）；`meta.version` 用于迁移。
- 任何对 GameSaveData 的增删字段都需配套 migrate 并 bump SAVE_VERSION，避免旧档损坏或缺字段导致运行时异常。
