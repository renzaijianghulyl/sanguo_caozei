# 云函数 vectorMemory（三国沙盒 2.0 向量记忆）

支持**双模型协作**：即时回复用 DeepSeek + Zilliz 检索；异步摘要与存储用 **GLM-4-Flash + 智谱 Embedding**。

## 双模型协作流程（推荐）

| 阶段 | 模型 | 用途 |
|------|------|------|
| **即时生成** | DeepSeek-V3（裁决云函数） | 玩家提问 → 先 `retrieve` 拉取 Zilliz 记忆 → 再生成具备 NPC 性格的回话 |
| **异步处理** | GLM-4-Flash | 任务 A：将本轮对话总结成约 50 字摘要；任务 B：摘要经智谱 Embedding 转向量后存入 Zilliz（由本云函数 `summarizeAndSave` 一次完成） |
| **世界反馈** | GLM-4-Flash（可选） | 判定事件影响力，重大事件可自动生成传闻（可后续接在裁决或单独云函数） |

**RPM 限制**：GLM-4-Flash 有每分钟请求数限制。云函数内已对摘要请求做 400–800ms 随机延迟以分散并发；客户端建议对「摘要并存储」做队列或节流（例如每轮对话最多触发一次、或间隔数秒再发），避免 300+ NPC 同时触发导致限流。

## 环境变量（云开发控制台 → 云函数 vectorMemory → 配置）

| 变量 | 说明 |
|------|------|
| `ZILLIZ_ENDPOINT` | 集群公网 Endpoint（仅域名，**不要**带 `/v1`、`/v2` 等路径） |
| `ZILLIZ_API_KEY` | Zilliz API Key（控制台创建） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（用于 embedding 直连，若可用；可选） |
| **智谱 Embed（推荐）** `EMBED_API_URL` | `https://open.bigmodel.cn/api/paas/v4/embeddings` |
| **智谱 Embed** `EMBED_API_KEY` | 智谱开放平台 API Key（与 GLM 可同一 Key） |
| **智谱 Embed** `EMBED_MODEL` | `embedding-2`（1024 维，与当前 Zilliz 集合一致） |
| **摘要用** `ZHIPU_API_KEY` | 智谱 API Key（用于 GLM-4-Flash 摘要，可与上面共用） |

未配置时：`save` 静默成功，`retrieve` 返回空数组。使用双模型时建议只配 **Zilliz + 智谱（EMBED_* + ZHIPU_API_KEY）**，不配 DEEPSEEK 也可。

## Zilliz Collection 约定

- **集合名**：`sanguo_memories`
- **主键**：`primary_key`（INT64）
- **向量**：`vector`，**维度须与 Embed 模型一致**（智谱 **embedding-2** 为 **1024 维**，与当前集合一致；若改用其他模型需对应调整）
- **相似度**：Cosine
- **标量字段**：`npc_ids`(VARCHAR 256)、`region_id`(VARCHAR 64)、`year`(INT32)、`session_id`(VARCHAR 128)、**`summary`(VARCHAR，建议 512)**、**`created_at`(INT64，毫秒时间戳，用于 30 天自动清理)**、**`memory_type`(VARCHAR 32，可选)**  
  **若当前集合尚无 `summary` 字段，请在 Zilliz 控制台为该集合添加 `summary` 字段（VARCHAR，用于存储记忆正文），否则写入会报错。**  
  **为支持流失用户 30 天自动删除，请添加标量字段 `created_at`（INT64）；未添加时 `deleteOlderThan` 仅对带 `created_at` 的新数据生效。**  
  **为支持导演模块「初始设定」与「战报传闻」：请添加标量字段 `memory_type`（VARCHAR 32）。取值：`default`（普通对话摘要）、`origin`（玩家立志/个人设定）、`global_rumor`（战报文学化传闻）、`interpersonal`（与某 NPC 深度交流后写入，检索时按 npc_id 优先召回以支撑第二人称化台词）。未添加时 `saveOrigin` 与 `literarizeAndSaveRumors` 的插入可能失败；`retrieve` 的 origin 优先召回会 try/catch 忽略。**

## 请求格式（小程序通过 wx.cloud.callFunction 调用）

- **retrieve**：`{ action: "retrieve", npc_id?, region_id?, session_id, limit?, include_origin? }`  
  返回 `{ memories: string[] }`。**即时流程**：玩家提问前调用，将返回的 `memories` 传给裁决云函数作为上下文。若 `include_origin !== false`，会优先召回该 session 下 `memory_type === "origin"` 的一条记忆并置于数组首位；若有 `npc_id`，会再召回该 NPC 的 `interpersonal` 记忆（按 `created_at` 降序，最多 2 条）置于 origin 之后；其余为 default 与 global_rumor（rumor 按时间降序，越近战报越靠前）。
- **save**：`{ action: "save", summary, npc_ids, region_id, year, session_id, memory_type? }`  
  直接写入给定摘要的向量（一般由后端或已生成摘要的客户端调用）。`memory_type` 默认 `"default"`，可为 `"interpersonal"`（与某 NPC 深度交流后写入，需在 `npc_ids` 中带上该 NPC id 以便检索时按人召回）。
- **saveOrigin**：`{ action: "saveOrigin", content, session_id }`  
  将玩家「初始设定」（如立志愿望）以 `memory_type: "origin"` 存入向量库，供检索时优先召回。
- **summarizeAndSave**（双模型推荐）：`{ action: "summarizeAndSave", dialogue, npc_ids?, region_id?, year?, session_id }`  
  先用 GLM-4-Flash 将 `dialogue` 总结成约 50 字，再 Embed 并写入 Zilliz。返回 `{ saved: true, summary: "..." }`。**异步流程**：每轮对话结束后传入本轮对话原文，无需先自己生成摘要。
- **literarizeAndSaveRumors**：`{ action: "literarizeAndSaveRumors", reports: string[], session_id, region_id?, year? }`  
  对每条战报用 GLM-4-Flash 改写成约 30 字「江湖传闻」，再 Embed 并写入 Zilliz，`memory_type: "global_rumor"`。异步调用，失败静默。
- **deleteBySessionId**：`{ action: "deleteBySessionId", session_id }`  
  删除该 `session_id` 下的全部向量记忆。**用途**：用户重新开始游戏（新存档）时调用，避免旧档记忆残留。
- **deleteOlderThan**：`{ action: "deleteOlderThan", days?: number }`  
  删除 `created_at` 早于 N 天的数据（默认 30 天）。**用途**：定时触发器（如云函数定时任务）每日调用，清理流失用户数据。需集合含 `created_at`（INT64）字段。

## 部署

1. 在云开发控制台创建云函数 `vectorMemory`，上传本目录（含 `index.js`、`package.json`）。
2. 在云函数配置中添加上述环境变量。
3. 小程序构建时开启向量记忆：`USE_VECTOR_MEMORY=true npm run build`，并确保 `CLOUD_ENV` 已配置为同一环境。

### 30 天自动清理（流失用户数据）

在微信云开发中为云函数 `vectorMemory` 配置**定时触发器**（例如每天 0 点执行一次），触发时传入参数：`{ "action": "deleteOlderThan", "days": 30 }`。云函数会删除 `created_at` 早于 30 天的记录。需确保 Zilliz 集合已添加标量字段 `created_at`（INT64），且新写入的数据均带该字段。

## 重要：为什么「本地测试通过」但微信调试报 Embed 404？

- **本地脚本 `test-zilliz-local.js` 只测了 Zilliz**：用的是**假向量**（`fakeVector1024()`），**没有调用 DeepSeek**，所以「本地通过」只代表 Zilliz 可用，不能说明 DeepSeek 正常。
- **云函数流程**：先调 **DeepSeek Embed** 拿向量 → 再调 **Zilliz** 写入/检索。当前报错是**第一步 DeepSeek 就返回 404**，请求还没到 Zilliz，所以**和 Zilliz 维度无关**，不需要改 Zilliz 维度来修 404。

**建议按下面步骤排查并解决：**

1. **在本机测 DeepSeek**（与云函数同 URL/同请求体）  
   在项目根目录执行：  
   `DEEPSEEK_API_KEY="你的Key" node scripts/test-deepseek-embed.js`  
   - **本机也 404**：说明该 Key 或账号未开通 embeddings，需在 DeepSeek 控制台确认或换 Key。  
   - **本机 200、云上 404**：说明 Key 正确，但**微信云环境访问 DeepSeek 被拦**（出口/代理限制），用下面「方案 B」绕过。

2. **方案 A：继续用 DeepSeek 直连**  
   若本机 200，可先确认云函数超时足够（建议 ≥10 秒）、网络配置允许出网；若仍 404，多为云侧限制，建议用方案 B。

3. **方案 B：用转发代理绕过云侧限制（推荐）**  
   在本机或能访问 `api.deepseek.com` 的服务器上运行转发脚本，云函数改调代理地址，由代理转发到 DeepSeek：
   - 在项目根目录执行：`DEEPSEEK_API_KEY="你的Key" node scripts/embed-proxy.js`（默认监听 3780 端口）。
   - 用 **ngrok** 或其它方式把本机 3780 暴露为公网 HTTPS 地址（例如 `https://xxx.ngrok.io`）。
   - 云函数环境变量设置：`EMBED_API_URL=https://xxx.ngrok.io/v1/embeddings`，`EMBED_API_KEY=占位`（任意非空即可）。  
   这样云函数只访问你的代理，代理再访问 DeepSeek；DeepSeek 返回的向量维度为 **1536**，Zilliz 集合须为 **1536 维**（若当前为 1024 维，需在 Zilliz 控制台新建 1536 维的 collection 并改云函数中的集合名）。

4. **方案 C：换用其他 Embed 接口**  
   若有其他 OpenAI 兼容的 embeddings 服务（且从微信云可访问），在云函数中配置 `EMBED_API_URL`、`EMBED_API_KEY`（及可选 `EMBED_MODEL`），向量维度须与 Zilliz 集合一致。

## 建议：先本地调通 Zilliz 再部署云函数

在项目根目录执行（请替换为你的真实 API Key）：

```bash
ZILLIZ_ENDPOINT="https://in03-18eed75254ba9c2.serverless.ali-cn-hangzhou.cloud.zilliz.com.cn" \
ZILLIZ_API_KEY="你的Zilliz_API_Key" \
node scripts/test-zilliz-local.js
```

- 若返回 **401**：说明路径正确，请检查 API Key 是否与 Zilliz 控制台一致（云函数里填的 `ZILLIZ_API_KEY` 必须与控制台该集群的 Token/API Key 一致）。
- 若返回 **200**：说明插入/检索在本机已通，再用同一 `ZILLIZ_ENDPOINT` 与 `ZILLIZ_API_KEY` 部署云函数即可。
- 若云函数仍报 **404** 而本地 200：可能是微信云环境出网策略或代理导致，需在云开发控制台检查网络设置或考虑通过「HTTP 触发器」由自有服务器转发请求。

## 若云函数返回 404（Request failed with status code 404）

**1. 先看云函数日志确认是谁返回 404**

部署最新代码后，触发一次 save，在云开发控制台查看该次调用的**完整日志**：

- 若出现 `[vectorMemory] save: 调用 embed` 后直接报 404，且**没有**出现 `请求 URL: https://...zilliz...`，则 404 来自 **Embed 接口**（多为 DeepSeek）。
- 若出现 `[vectorMemory] save: embed 成功，调用 Zilliz insert` 和 `[vectorMemory] 请求 URL: https://in03-xxx.../v2/vectordb/entities/insert`，再报 404，则 404 来自 **Zilliz**。日志里还会有 `[vectorMemory] 非 2xx 状态: 404` 和 `[vectorMemory] 响应 body:`，请把**完整请求 URL** 和**响应 body** 抄下来备用。

**若 Embed 返回 404 且 body 为 "Not Found. Please check the configuration."**：说明请求已到达 DeepSeek，但接口或配置不被认可（账号可能未开通 embeddings，或云环境只放行 chat 路径）。**建议**：在云函数中配置**备用 Embed**：增加环境变量 `EMBED_API_URL`、`EMBED_API_KEY`（可选 `EMBED_MODEL`），填任意 OpenAI 兼容的 embeddings 接口地址与 Key，云函数会优先使用该接口；备用模型的向量维度须与 Zilliz 集合一致（当前 1024 维），否则需在 Zilliz 新建对应维度的 collection。

**2. 核对 ZILLIZ_ENDPOINT**

1. 登录 [Zilliz Cloud 控制台](https://cloud.zilliz.com.cn)（中国区）。
2. 进入你的集群 → **集群详情** / **查看集群详情**，找到「**Endpoint**」或「**公网地址**」。
3. 环境变量里填的必须是**纯集群地址**，例如：  
   `https://in03-18eed75254ba9c2.serverless.ali-cn-hangzhou.cloud.zilliz.com.cn`  
   **不要**带任何路径（不要 `/v1`、`/v2`、`/vectordb` 等）。云函数会自动拼上 `/v2/vectordb/entities/insert` 和 `/v2/vectordb/entities/search`。

**3. 若 URL 与本地一致、本地 200 而云上仍 404**

多为**微信云（腾讯云）访问 Zilliz 中国区（阿里云）时的网络/网关差异**（非白名单问题）。可选方案：

- **方案 A**：在 Zilliz 控制台确认集群 IP 白名单为默认（未限制），并确认该集群类型支持 REST 数据面。
- **方案 B**：使用**中转**：在阿里云部署一个极简 HTTP 服务，云函数只调该服务，由该服务再请求 Zilliz（请求从阿里云出口，与 Zilliz 同区，通常可避免 404）。需要时可再细化中转接口与鉴权。
