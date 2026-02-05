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

## 4. LLM集成(DeepSeek)
- 接口: 统一Provider抽象
- 输入: 结构化上下文 + 玩家意图
- 输出: 严格JSON, 必须包含impact_level、narrative、state_changes

## 5. 失败处理(重试优先)
- JSON校验失败: 自动重试(最多2次)
- 重试策略: 降温、缩短上下文
- JSON修复: 通过修复型Prompt纠正结构
- 仅在多次失败或合规拦截时, 才启用规则兜底
- 兜底不生成“模板化无聊结果”, 而是基于当前事件模板生成短叙事

## 6. 数据与存储
- 本地存档: 微信小游戏KV + 文件分块
- 服务端存储: 仅保留匿名会话日志与事件统计
- 事件去重: EventLog中记录事件ID与冷却时间

## 7. API建议
- POST /intent/resolve
  - request: PlayerState, WorldState, NPCState, intent
  - response: IntentResult
- POST /save
- GET /config/events
- GET /config/npcs

## 8. 安全与合规
- 敏感词与违规意图拦截
- 叙事风格控制(古风为主, 现代少量点缀)
- 记录审计日志(不含隐私)
