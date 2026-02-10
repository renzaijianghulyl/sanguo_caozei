# 技术架构方案 (V1)

## 1. 总览
- 客户端: 微信小游戏
- 服务端: 裁决编排与状态管理
- 大模型: DeepSeek (结构化JSON输出)

## 2. 客户端(微信小游戏)
- UI层: 对话区、输入区、属性面板、事件反馈
- 逻辑层: 输入采集、基础校验、结果渲染
- 数据层: 本地存档、缓存、资源动态加载
- 资源策略: 首包只包含基础UI与核心逻辑

## 3. 服务端(编排与裁决)
- 会话管理: 玩家状态、世界状态、NPC状态
- 意图裁决: 组装上下文 -> LLM -> 结构化结果
- 状态更新: 应用state_changes, 写入日志
- 合规过滤: 敏感内容与违规意图拦截
- 监控埋点: 错误率、裁决分级分布

## 4. NPC关系系统
### 4.1 关系维度
- **亲密度(Closeness)**: 0-100，表示个人情感亲疏程度
- **信任度(Trust)**: 0-100，表示可靠性认知
- **立场(Stance)**: -100到100，表示政治立场倾向（负数为敌对，正数为友好）

### 4.2 核心类
- **NPCRelationship**: 管理单个NPC与玩家的关系状态
  - 关系值存储与查询
  - 关系变化计算与边界控制
  - 关系描述自动生成
  - 序列化与反序列化支持
- **NPCRelationshipManager**: 管理所有NPC关系
  - 批量关系操作
  - 事件结果自动更新关系
  - 数据持久化（保存到data/relationships/）

### 4.3 关系计算
- **综合关系评分**: 亲密度40% + 信任度40% + 立场20%（归一化）
- **关系等级**: 生死之交、莫逆之交、挚友、好友、相识、泛泛之交、冷淡、疏远、厌恶、死敌
- **事件影响**: 事件结果中的state_changes.npc字段直接影响关系值

## 5. 势力系统
### 5.1 势力构成
- **势力(Faction)**: 代表游戏中的政治/军事集团
  - 基础属性: 名称、阵营、领导者、描述
  - 实力维度: 力量(Strength)、影响力(Influence)、财富(Wealth)
  - 战略目标: 核心区域、目标列表

### 5.2 管理机制
- **FactionManager**: 统一管理所有势力
  - 玩家声望管理: 对各势力的声望值（-100到100）
  - 外交关系管理: 势力间的关系网络
  - 领土控制: 区域与势力映射关系
  - 连锁效应: 声望变化对同盟势力的影响

### 5.3 外交关系
- **关系网络**: 双向对称关系矩阵
- **关系等级**: 铁杆盟友、亲密盟友、坚实盟友、盟友、友好、亲近、良好、和睦、一般、冷淡、疏远、紧张、对立、敌对、严重敌对、血海深仇、势不两立
- **动态调整**: 事件结果中的state_changes.world字段可修改外交关系

## 6. 系统集成
### 6.1 服务端集成
- 初始化时创建NPCRelationshipManager和FactionManager实例
- 加载初始数据: data/npcs.json和data/factions.json
- 健康检查端点显示系统状态

### 6.2 裁决上下文扩展
- 在/intent/resolve端点中添加关系与势力上下文:
  - `npc_relationships`: 所有NPC关系状态
  - `faction_reputations`: 玩家对各势力的声望
- LLM裁决时考虑关系与声望因素

### 6.3 事件结果处理
- 事件触发后自动更新NPC关系
- 根据事件结果更新势力声望与外交关系
- 结果中返回关系与势力的更新摘要

## 7. LLM集成(DeepSeek)
- 接口: 统一Provider抽象
- 输入: 结构化上下文 + 玩家意图 + 关系与势力上下文
- 输出: 严格JSON, 必须包含impact_level、narrative、state_changes

## 8. 失败处理(重试优先)
- JSON校验失败: 自动重试(最多2次)
- 重试策略: 降温、缩短上下文
- JSON修复: 通过修复型Prompt纠正结构
- 仅在多次失败或合规拦截时, 才启用规则兜底
- 兜底不生成"模板化无聊结果", 而是基于当前事件模板生成短叙事

## 9. 数据与存储
- 本地存档: 微信小游戏KV + 文件分块
- 服务端存储: 仅保留匿名会话日志与事件统计
- 事件去重: EventLog中记录事件ID与冷却时间
- 关系数据: 保存到data/relationships/player_relationships.json
- 势力数据: 静态配置在data/factions.json，运行时状态内存管理

## 10. API建议
- POST /intent/resolve
  - request: PlayerState, WorldState, NPCState, intent, [npc_relationships, faction_reputations]
  - response: IntentResult (包含npc_relationship_updates, faction_updates)
- POST /save
- GET /config/events
- GET /config/npcs
- GET /config/factions

## 11. 安全与合规

### 11.1 合规过滤系统架构

#### 三层过滤机制
1. **敏感词检测层**
   - 基于模糊匹配的敏感词库（data/sensitive_words.txt）
   - 支持拼音、简繁变体识别
   - 分级风险评估：high/medium/low

2. **意图安全评估层**
   - 违规意图类别：暴力、色情、政治敏感、恶意攻击
   - 基于规则与关键词的多维度识别
   - 实时拦截高风险玩家输入

3. **叙事风格控制层**
   - 现代网络用语自动替换为古风表达
   - 确保输出文本符合古风旁白风格
   - 提供风格修正建议与日志记录

#### 核心类：ComplianceFilter
- 位置：`src/server/filters/ComplianceFilter.js`
- 功能：
  - `checkPlayerInput()`：统一检查玩家输入
  - `checkLLMOutput()`：二次过滤LLM叙事文本
  - `checkSensitiveWords()`：敏感词检测
  - `assessIntentSafety()`：意图安全评估
  - `controlNarrativeStyle()`：叙事风格控制

### 11.2 服务端集成

#### 初始化
```javascript
const ComplianceFilter = require('./filters/ComplianceFilter');
let complianceFilter = new ComplianceFilter();
```

#### 玩家输入预处理
在`/intent/resolve`端点中，验证参数后立即进行合规检查：
- 调用`complianceFilter.checkPlayerInput(player_intent)`
- 如果`safe: false`，直接返回安全警告叙事
- 拦截高风险意图，阻止进入LLM裁决流程

#### LLM输出后处理
在LLM生成裁决结果后，对叙事文本进行二次过滤：
- 调用`complianceFilter.checkLLMOutput(narrative_text)`
- 如果包含敏感词，使用安全回退叙事
- 如果包含现代网络用语，自动替换为古风表达
- 记录所有替换与过滤操作

### 11.3 敏感词库设计

#### 文件格式
- 位置：`data/sensitive_words.txt`
- 注释以#开头，空行忽略
- 每行一个敏感词或模式

#### 模糊匹配支持
1. **拼音变体**：`sha ren` → 匹配"杀人"
2. **简繁变体**：`殺人` → 匹配"杀人"
3. **全匹配与部分匹配**：支持子字符串检测

#### 风险等级划分
- **高风险**：暴力、色情、政治敏感内容
- **中等风险**：恶意攻击、血腥描述
- **低风险**：其他敏感词

### 11.4 安全回退机制

#### 玩家输入拦截
```javascript
{
  "request_id": "...",
  "impact_level": "blocked",
  "intent_summary": "玩家意图因合规原因被拦截: ...",
  "success_prob": 0.0,
  "result": {
    "success": false,
    "narrative": "此意图涉及敏感内容，请重新输入符合古风三国的意图。",
    "costs": [],
    "effects": [],
    "world_flags": [],
    "followup_hooks": []
  }
}
```

#### LLM输出过滤
- 高风险叙事：替换为通用安全叙事
- 风格修正：保留原意，替换现代用语
- 完整日志：记录所有修改操作

### 11.5 测试与验证

#### 测试脚本
- 位置：`scripts/test_compliance_filter.js`
- 功能：单元测试所有过滤模块
- 场景：正常意图通过、违规意图拦截、叙事风格修正

#### 验证标准
1. 敏感词检测：能识别预设敏感词及变体
2. 意图安全评估：明确拦截高风险意图
3. 叙事风格控制：自动替换现代网络用语
4. 服务端集成：在预处理和后处理节点生效
5. 安全回退：体验不中断，返回合规反馈