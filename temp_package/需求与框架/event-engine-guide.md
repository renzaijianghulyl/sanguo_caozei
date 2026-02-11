# 事件模板引擎使用指南

## 概述

事件模板引擎是三国文字沙箱游戏的核心系统之一，负责管理游戏中的各种事件（主线、支线、随机事件）。该系统基于 `EVENT_SPEC.md` 规范设计，实现了事件的动态触发、状态检查和集成裁决。

## 核心组件

### 1. EventTemplate（事件模板类）
- **位置**: `src/server/events/EventTemplate.js`
- **功能**: 封装单个事件的所有属性和逻辑
- **主要方法**:
  - `canTrigger()`: 检查事件是否可以触发（基于玩家状态、世界状态、完成事件、冷却时间）
  - `getLLMContext()`: 获取事件的LLM裁决上下文
  - `getStateChanges()`: 获取成功/失败后的状态变更

### 2. EventLoader（事件加载器）
- **位置**: `src/server/events/EventLoader.js`
- **功能**: 从JSON文件加载事件模板，并提供多种查询方式
- **主要方法**:
  - `loadFromDirectory()`: 从指定目录加载所有JSON事件文件
  - `getEventsByType()`: 按类型（main/branch/random）查询事件
  - `getTriggerableEvents()`: 获取当前可触发的事件列表

### 3. EventManager（事件管理器）
- **位置**: `src/server/events/EventManager.js`
- **功能**: 集成管理事件生命周期，提供对外API
- **主要方法**:
  - `checkTriggerableEvents()`: 检查并返回可触发事件
  - `triggerEvent()`: 触发特定事件并应用状态变更
  - `prepareEventContext()`: 为裁决API准备事件上下文

## API端点

### 1. 事件检查
```
POST /events/check
```
**请求体**:
```json
{
  "player_state": {...},
  "world_state": {...}
}
```
**响应**:
```json
{
  "request_id": "abc123",
  "triggerable_events": [...],
  "count": 3
}
```

### 2. 事件触发
```
POST /events/trigger
```
**请求体**:
```json
{
  "event_id": "main_huangjin_rising",
  "player_state": {...},
  "world_state": {...},
  "success": true
}
```

### 3. 意图裁决（已集成事件）
```
POST /intent/resolve
```
- 如果没有提供 `event_context`，系统会自动检查并添加第一个可触发事件
- 事件上下文会传递给LLM，影响裁决结果
- 裁决结果中会包含 `event_info` 字段（如果触发了事件）

## 事件模板格式

事件模板使用JSON格式，存放在 `data/events/` 目录下。示例：

```json
{
  "event_id": "main_huangjin_rising",
  "title": "黄巾起义",
  "era": "184",
  "region": "jizhou",
  "scene": "capital",
  "summary": "太平道张角发动黄巾起义，天下震动，汉室危急。",
  "entry_conditions": {
    "time_range": ["184-02-01", "184-12-31"],
    "player_identity": ["civilian", "scholar", "official"],
    "world_flags": ["taipingdao_spread=high"],
    "event_not_done": ["main_huangjin_rising"]
  },
  "npcs": ["npc_zhangjiao", "npc_emperor_ling", "npc_hejin"],
  "player_hint": "黄巾军席卷八州，烽火连天，汉室震动...",
  "player_intent_prompt": "面对这场席卷天下的动乱，你将如何选择？",
  "intent_tags": ["投靠朝廷", "加入黄巾", "避祸他乡", "趁机起事"],
  "llm_context": {
    "local_rumors": "张角自称\"大贤良师\"，信徒遍布天下",
    "official_pressure": "朝廷紧急征调各地兵马",
    "civilian_state": "百姓惶恐不安，流民四起"
  },
  "impact_hint": "global",
  "resolution": {
    "on_success": {
      "state_changes": ["reputation+20", "legend+10", "gold+100"],
      "world_flags": ["huangjin_rebellion=ongoing", "historical_momentum=changed"]
    },
    "on_fail": {
      "state_changes": ["reputation-10", "health-20"],
      "world_flags": ["huangjin_rebellion=ongoing"]
    }
  },
  "cooldown_days": 0
}
```

## 触发条件详解

事件触发条件在 `entry_conditions` 中定义：

1. **时间范围** (`time_range`): 事件可触发的时间区间
2. **玩家身份** (`player_identity`): 玩家必须具有的身份标签
3. **世界标记** (`world_flags`): 世界状态必须满足的条件
4. **事件未完成** (`event_not_done`): 指定事件不能已完成

## 集成流程

### 客户端建议流程
1. 玩家进入新场景时，调用 `/events/check` 检查可触发事件
2. 如果有可触发事件，向玩家展示事件提示
3. 玩家输入意图后，调用 `/intent/resolve` 进行裁决
   - 可包含 `event_context` 指定当前处理的事件
   - 或不包含，由服务端自动选择

### 服务端自动流程
- 每次裁决请求时，如果没有 `event_context`，自动检查可触发事件
- 将第一个可触发事件作为当前事件上下文
- LLM裁决时考虑事件信息
- 裁决结果中包含事件完成标记

## 测试

已提供完整的测试套件：
- **单元测试**: `scripts/test_event_engine.js`
- **测试数据**: `data/events/` 下的3个示例事件

运行测试：
```bash
node scripts/test_event_engine.js
```

## 事件去重与冷却机制

### 设计目标
1. **事件去重**: 基于 `event_id + player_id` 的唯一约束，确保同一事件对同一玩家只能触发一次（除非特别设计的重复事件）
2. **冷却机制**: 为每个事件类型配置最小触发间隔时间，避免同类事件在短时间内频繁触发
3. **玩家特定**: 冷却状态和触发记录都是玩家特定的，不同玩家之间互不影响

### 数据库表结构
系统使用SQLite数据库存储事件触发记录和冷却状态，位于 `data/shared_state/state.db`：

#### event_log 表（用于事件去重）
```sql
CREATE TABLE IF NOT EXISTS event_log (
    event_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    triggered_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, player_id)
);
```

#### event_cooldown 表（用于冷却机制）
```sql
CREATE TABLE IF NOT EXISTS event_cooldown (
    event_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    last_triggered_at TEXT NOT NULL,
    cooldown_remaining INTEGER NOT NULL DEFAULT 0,
    triggered_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, player_id)
);
```

### EventManager 新增方法

#### checkEventCooldown(eventId, playerId)
检查指定事件对特定玩家是否处于冷却状态。

**返回值**:
```javascript
{
    isInCooldown: boolean,      // 是否在冷却中
    remainingSeconds: number,   // 剩余冷却秒数
    triggeredCount: number      // 已触发次数
}
```

#### markEventTriggered(eventId, playerId)
标记事件已触发，记录到数据库并设置冷却时间。

**功能**:
1. 向 `event_log` 表插入记录（幂等操作，重复插入会被忽略）
2. 如果事件模板定义了 `cooldown_days`，向 `event_cooldown` 表设置冷却
3. 更新内存缓存以便快速访问

### 不同类型事件的策略差异

| 事件类型 | 去重策略 | 冷却时间 | 重复触发 |
|---------|---------|---------|---------|
| 主线事件 | 严格去重，默认 `allow_repeat: false` | 通常为0（不可重复） | 不允许（除非特别设计） |
| 支线事件 | 一般去重，`allow_repeat: false` | 较长（如30天） | 冷却结束后可重复 |
| 随机事件 | 宽松去重，`allow_repeat: true` | 较短（如7天） | 允许重复触发 |

### 集成流程
1. **事件检查阶段**: `EventManager.checkTriggerableEvents()` 会过滤掉已触发过（且不允许重复）的事件
2. **冷却检查阶段**: 进一步过滤掉对当前玩家仍处于冷却状态的事件
3. **事件触发阶段**: `EventManager.triggerEvent()` 调用 `markEventTriggered()` 记录触发和冷却

### 测试
新增测试脚本 `scripts/test_event_cooldown.js`，包含11个测试用例：
1. 基本去重功能测试
2. 冷却机制测试
3. EventManager.checkEventCooldown方法测试
4. EventManager.markEventTriggered方法测试
5. 事件类型去重策略差异测试
6. 冷却时间计算准确性测试
7. 数据库幂等性测试
8. EventManager.checkTriggerableEvents集成测试
9. 错误处理和内存回退测试
10. 性能与并发测试（基础）

运行测试：
```bash
node scripts/test_event_cooldown.js
```

## 下一步开发建议

1. **状态变更实现**: 当前 `EventManager.triggerEvent()` 中的状态变更仅记录日志，需要实现具体的状态更新逻辑
2. **事件优先级**: 可考虑更复杂的事件优先级和冲突解决机制
3. **批量生成工具**: 开发事件模板批量生成和验证工具
4. **可视化编辑器**: 为策划提供可视化的事件模板编辑器

## 注意事项

- 事件ID必须唯一
- 主线事件通常设置 `cooldown_days: 0`（不可重复）
- 支线事件建议设置较长冷却（如30天）
- 随机事件建议设置较短冷却（如7天）
- 所有时间格式使用 `YYYY-MM-DD`
- 随机事件建议设置较短冷却（如7天）
