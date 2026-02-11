# 环境配置说明

## 1. DeepSeek API 配置

### 获取API密钥
1. 访问 [DeepSeek 官网](https://platform.deepseek.com/)
2. 注册账号并登录
3. 在控制台中创建API密钥
4. 复制生成的密钥

### 设置环境变量
#### Linux/macOS
```bash
export DEEPSEEK_API_KEY=your_api_key_here
export DEEPSEEK_API_BASE=https://api.deepseek.com  # 可选，默认值
```

#### Windows (Command Prompt)
```cmd
set DEEPSEEK_API_KEY=your_api_key_here
set DEEPSEEK_API_BASE=https://api.deepseek.com
```

#### Windows (PowerShell)
```powershell
$env:DEEPSEEK_API_KEY="your_api_key_here"
$env:DEEPSEEK_API_BASE="https://api.deepseek.com"
```

### 在启动脚本中设置
修改 `scripts/start_server.sh`，添加环境变量：
```bash
#!/bin/bash
export DEEPSEEK_API_KEY=your_api_key_here
node src/server/index.js
```

## 2. 服务端配置

### 端口配置
默认端口：3000
可以通过环境变量修改：
```bash
export PORT=8080
```

### 日志级别
```bash
export LOG_LEVEL=debug  # debug, info, warn, error
```

## 3. 模拟模式
如果未设置 `DEEPSEEK_API_KEY` 环境变量，服务端将自动切换到模拟模式：
- 使用固定的裁决逻辑
- 不调用真实API
- 适合开发和测试环境

## 4. 验证配置
启动服务后，访问健康检查端点验证配置：
```bash
curl http://localhost:3000/health
```

预期响应包含：
```json
{
  "status": "ok",
  "timestamp": "2026-02-05T06:33:00.000Z",
  "llm_enabled": true,
  "api_key_set": true
}
```

如果 `llm_enabled` 为 `false`，表示未正确配置API密钥。

## 5. 测试API调用
使用测试脚本验证裁决功能：
```bash
./scripts/test_api.sh
```

或手动调用：
```bash
curl -X POST http://localhost:3000/intent/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "player_state": {"id":"p1","attrs":{"str":32,"int":68,"cha":55,"luck":46},"legend":10,"tags":["civilian"]},
    "world_state": {"era":"184","region":"yingchuan","flags":["taipingdao_spread=high"]},
    "npc_state": [{"id":"npc_xianwei","stance":"court","trust":40}],
    "event_context": {"event_id":"yc_illness_001","scene":"village","rumors":"..."},
    "player_intent": "我想拜访当地的县令，建立关系"
  }'
```

## 6. 故障排除

### API密钥无效
症状：`llm_enabled` 为 `false`，日志显示 "DeepSeek LLM适配器初始化失败"
解决：
1. 确认API密钥正确复制
2. 检查环境变量是否在当前shell中设置
3. 重启服务使环境变量生效

### 网络连接问题
症状：API调用超时或返回网络错误
解决：
1. 检查网络连接
2. 确认 `DEEPSEEK_API_BASE` 地址正确
3. 如有防火墙，确保允许出站连接

### JSON解析错误
症状：日志显示 "JSON解析失败"
解决：
1. 检查DeepSeek API响应格式
2. 确保API密钥有足够的权限
3. 查看完整错误日志分析具体原因