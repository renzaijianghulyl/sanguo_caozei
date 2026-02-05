# 意图裁决服务器

## 概述
这是三国文字沙箱游戏的服务端意图裁决API服务，基于ADJUDICATION_SPEC.md规范实现。

## 接口说明

### 健康检查
```
GET /health
```

### 意图裁决
```
POST /intent/resolve
```

**请求体示例：**
```json
{
  "player_state": {
    "id": "p1",
    "attrs": {
      "str": 32,
      "int": 68,
      "cha": 55,
      "luck": 46
    },
    "legend": 10,
    "tags": ["civilian"]
  },
  "world_state": {
    "era": "184",
    "region": "yingchuan",
    "flags": ["taipingdao_spread=high"]
  },
  "npc_state": [
    {
      "id": "npc_xianwei",
      "stance": "court",
      "trust": 40
    }
  ],
  "event_context": {
    "event_id": "yc_illness_001",
    "scene": "village",
    "rumors": "..."
  },
  "player_intent": "我想结交当地豪强"
}
```

**响应体示例：**
```json
{
  "impact_level": "branch",
  "intent_summary": "玩家意图：我想结交当地豪强",
  "success_prob": 0.7,
  "result": {
    "success": true,
    "narrative": "你深吸一口气，将心中的盘算付诸行动。",
    "costs": ["energy-2"],
    "effects": ["reputation+5"],
    "world_flags": ["taipingdao_risk=monitoring"],
    "followup_hooks": ["next_decision_point"]
  },
  "state_changes": {
    "player": ["reputation+5", "legend+1"],
    "npc": ["npc_xianwei_trust+5"],
    "world": [],
    "event": []
  }
}
```

## 运行方式

### 安装依赖
```bash
npm install
```

### 启动服务器
```bash
npm start
# 或使用开发模式（需要nodemon）
npm run dev
```

### 测试接口
使用curl测试：
```bash
curl -X POST http://localhost:3000/intent/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "player_state": {"id":"p1","attrs":{"str":32,"int":68,"cha":55,"luck":46},"legend":10,"tags":["civilian"]},
    "world_state": {"era":"184","region":"yingchuan","flags":["taipingdao_spread=high"]},
    "player_intent": "我想结交当地豪强"
  }'
```

## 错误处理

- 400 Bad Request：请求体格式错误或缺少必要字段
- 500 Internal Server Error：服务器内部错误

## 模拟LLM裁决
当前版本使用模拟的LLM裁决逻辑，后续将集成真实的DeepSeek API。