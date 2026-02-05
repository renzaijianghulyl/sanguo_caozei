# 意图裁决规范 (V1)

## 1. 裁决目标
- 理解玩家意图
- 给出重要性分级
- 生成可执行的状态变更
- 提供叙事反馈与后续钩子

## 2. 输入结构(服务端)
```json
{
  "player_state": {"id":"p1","attrs":{"str":32,"int":68,"cha":55,"luck":46},"legend":10,"tags":["civilian"]},
  "world_state": {"era":"184","region":"yingchuan","flags":["taipingdao_spread=high"]},
  "npc_state": [{"id":"npc_xianwei","stance":"court","trust":40}],
  "event_context": {"event_id":"yc_illness_001","scene":"village","rumors":"..."},
  "player_intent": "我想..."
}
```

## 3. 输出结构(LLM必须返回JSON)
```json
{
  "impact_level": "global | branch | minor",
  "intent_summary": "一句话概述",
  "success_prob": 0.0,
  "result": {
    "success": true,
    "narrative": "短叙事反馈",
    "costs": ["reputation-2"],
    "effects": ["npc_xianwei_trust+5"],
    "world_flags": ["taipingdao_risk=triggered"],
    "followup_hooks": ["assassination_risk"]
  },
  "state_changes": {
    "player": ["reputation+5","legend+1"],
    "npc": ["npc_xianwei_trust+5"],
    "world": ["taipingdao_risk=triggered"],
    "event": ["event_done:yc_illness_001"]
  }
}
```

## 4. 重要性分级规则
- global: 影响势力格局、关键历史节点
- branch: 影响局部剧情、NPC关系
- minor: 影响资源或短期情绪

## 5. 状态变更规则
- 变更必须在允许字段内
- impact_level决定可改动范围
  - global: 可改世界势力标记
  - branch: 可改NPC关系、局部事件
  - minor: 仅改资源/情绪/小标记
- 每次裁决最多影响3个主字段
- 不允许直接抹除核心世界标记(除非global)

## 6. 失败处理
- LLM输出校验失败: 自动重试(最多2次)
- 仍失败: JSON修复Prompt
- 再失败或合规拦截: 规则兜底生成短叙事(非模板化)

## 7. 风格控制
- 叙事风格: 古风旁白 + 少量对话
- 禁止现代网络用语
- 文本长度: 叙事<=120字
