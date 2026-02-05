# 事件规范与写作指南 (V1)

## 1. 事件结构(字段完整)
```json
{
  "event_id": "yc_illness_001",
  "title": "瘟疫与施药",
  "era": "184",
  "region": "yingchuan",
  "scene": "village",
  "summary": "疫病爆发, 太平道施药, 官府疑心",
  "entry_conditions": {
    "time_range": ["184-01-01","184-06-30"],
    "player_identity": ["civilian","scholar"],
    "world_flags": ["taipingdao_spread=high"],
    "event_not_done": ["yc_illness_001"]
  },
  "npcs": ["npc_xianwei","npc_taiping_disciple"],
  "player_hint": "村里病患增多, 太平道施药, 官府疑心渐重。",
  "player_intent_prompt": "你准备怎么做?",
  "intent_tags": ["调查","医治","联络官府","接触太平道"],
  "llm_context": {
    "local_rumors": "太平道密语在传播",
    "official_pressure": "县尉在查探异动",
    "civilian_state": "民心不稳"
  },
  "impact_hint": "branch",
  "resolution": {
    "on_success": {
      "state_changes": ["reputation+5","npc_xianwei_trust+5"],
      "world_flags": ["taipingdao_risk=triggered"]
    },
    "on_fail": {
      "state_changes": ["reputation-2"],
      "world_flags": []
    }
  },
  "cooldown_days": 0
}
```

## 2. 事件分级
- global: 影响历史与势力格局
- branch: 影响局部剧情与NPC关系
- minor: 影响资源或情绪

## 3. 写作规范
- 单事件只讲一件事
- 场景描述<=150字
- 结果反馈<=80字
- 用古风叙事, 避免现代网络用语
- 失败也要推进(给信息或关系变化)

## 4. 事件去重与冷却
- 主线事件: 默认不可重复
- 支线事件: 可设置冷却(如30天)
- 随机事件: 冷却短, 可复刷

## 5. 推荐事件类型
- 偶遇/对话
- 战斗/冲突
- 政务/抉择
- 招募/关系
- 成长/训练
