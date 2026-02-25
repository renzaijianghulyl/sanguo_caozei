# 微信云开发 · 裁决 API 部署指南

本文档说明如何将裁决 API 部署到微信云开发（云函数），以及**如何安全配置 LLM API 密钥**。支持 **DeepSeek** 或 **腾讯混元**，任选其一配置即可。

---

## 一、前置条件

1. 已安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 项目已在微信开发者工具中打开（以「小游戏」方式导入）
3. 已有以下任一 API 密钥：
   - **DeepSeek**：[获取地址](https://platform.deepseek.com/)
   - **腾讯混元**：[混元控制台](https://console.cloud.tencent.com/hunyuan/start) 创建 API Key

---

## 二、配置 API 密钥（环境变量）

**API 密钥必须通过环境变量配置，绝不能写在代码里。** 支持 DeepSeek 和腾讯混元，任选其一；若两者都配置，优先使用混元。

### 步骤 1：开通云开发（必须先做，否则看不到「上传并部署」）

1. 在微信开发者工具中打开项目
2. 点击顶部 **「云开发」** 按钮（在预览、真机调试旁边）
3. 若未开通：按提示开通云开发，创建环境（如 `cloud1-xxx`），等待初始化完成
4. **重要**：必须成功进入云开发控制台后，云函数目录才会有「上传并部署」选项

### 步骤 2：确认云函数目录

1. 项目已配置 `cloudfunctionRoot: "cloudfunctions/"`（见 `project.config.json`）
2. 左侧文件树中，`cloudfunctions` 下应显示 **`adjudication`** 文件夹（图标通常为云朵）
3. 若图标为普通文件夹、右键没有「上传并部署」：请先完成步骤 1，或关闭项目重新打开

### 步骤 3：上传云函数

1. 在 `cloudfunctions` 下找到 **`adjudication`**
2. **右键 `adjudication`** → **「上传并部署：云端安装依赖」**（或「上传并部署：不校验域名」）
3. 等待部署完成

### 步骤 4：配置环境变量（API 密钥）

1. 点击顶部 **云开发**，进入云开发控制台
2. 左侧选择 **云函数**
3. 找到 `adjudication`，点击进入
4. 切换到 **配置** 选项卡
5. 找到 **环境变量** 区域，点击 **编辑**
6. 新增环境变量（任选其一或两者都配）：
   - **腾讯混元**（优先）：`HUNYUAN_API_KEY` = 在 [混元控制台](https://console.cloud.tencent.com/hunyuan/start) 创建的 API Key
   - **DeepSeek**：`DEEPSEEK_API_KEY` = `sk-xxxxxxxx`（你的 DeepSeek API 密钥）
7. 保存后，需**重新部署**云函数使环境变量生效：
   - 回到微信开发者工具
   - 右键 `adjudication` → **上传并部署：云端安装依赖**

### 步骤 5：配置超时时间（必做，否则会报 -504003 超时）

云函数默认超时仅 **3 秒**，而调用大模型通常需要 5～20 秒，必须提高超时时间：

1. 在云开发控制台 → **云函数** → 点击 `adjudication`
2. 切换到 **「配置」** 选项卡
3. 找到 **超时时间**（或「函数配置」中的超时），改为 **20 秒** 或 **30 秒**
4. 保存后，再次 **上传并部署** 云函数使配置生效

![环境变量示意](环境变量在「云函数 → adjudication → 配置 → 环境变量」中添加)

---

## 三、调用方式（推荐：云函数直调）

**无需开启云函数 URL 化**。小游戏通过 `wx.cloud.callFunction` 直接调用云函数。

### 配置环境 ID

在 `src/config/index.ts` 或构建时设置 `CLOUD_ENV` 为你的云开发环境 ID（在云开发控制台标题栏可见，如 `cloud1-3gfb9ep2701c4857`）：

```bash
CLOUD_ENV=cloud1-xxxx npm run build
```

小游戏启动时会自动 `wx.cloud.init({ env: CLOUD_ENV })`，裁决请求会走云函数，不再使用 `ADJUDICATION_API`。

### 可选：HTTP 模式（URL 化）

若需通过 HTTP 调用（如 Web 端或非微信环境），可开启云函数 URL 化后配置 `ADJUDICATION_API`。大部分场景下使用云函数直调即可。

---

## 三之一、ADJUDICATION_API 从哪里获取？（本地体验测试用）

跑 **体验测试**（`npm run playtest`）或非微信环境时，需要把裁决接口写成 HTTP 地址填到 `ADJUDICATION_API`。有两种常见方式：

### 方式 A：本地起裁决服务（推荐，无需云开发 URL 化）

项目里提供了本地裁决服务脚本，用你本机的 Node 直接跑云函数逻辑，API Key 用 `.env` 里的即可：

1. 在项目根目录已配置 `.env`，且其中包含 `DEEPSEEK_API_KEY`（或 `HUNYUAN_API_KEY`）。
2. 在一个终端里启动本地裁决服务：
   ```bash
   npm run adjudication-server
   ```
   服务会在 **http://localhost:3000** 监听，提供 `POST /intent/resolve`。
3. 在 `.env` 中设置：
   ```
   ADJUDICATION_API=http://localhost:3000/intent/resolve
   ```
4. 保持该终端运行，在另一个终端执行 `npm run playtest` 即可。

这样无需在微信云开发里开启 URL 化，也不用 access_token，适合本地开发与体验测试。

### 方式 B：微信云函数 HTTP 触发 / URL 化

若你希望体验测试直接请求云端（不跑本地服务），可给云函数开启 HTTP 触发：

1. 登录 [微信公众平台](https://mp.weixin.qq.com/) → 进入你的小游戏
2. 打开 **云开发** → 选择对应环境 → **云函数** → 点击 **adjudication**
3. 在 **配置** 或 **详情** 中查找 **「HTTP 触发」** / **「URL 化」** 等选项（不同版本入口可能不同）
4. 开启后，控制台会生成一个可公网访问的 URL（形如 `https://xxx.service.weixin.qq.com/...`）
5. 将该 URL 填到 `.env` 的 `ADJUDICATION_API` 中

注意：部分微信云开发环境可能未开放 HTTP 触发或需单独开通；若找不到该选项，用 **方式 A 本地裁决服务** 即可。

---

## 四、验证部署

1. 确保 `CLOUD_ENV` 已配置为你的环境 ID，构建并预览
2. 在游戏中输入任意意图（如「前往洛阳」），点击发送
3. 若返回剧情叙述，说明云函数裁决 API 已正常工作

---

## 五、安全注意事项

| 事项 | 说明 |
|------|------|
| **API 密钥** | 仅存放在云函数环境变量中，不要提交到 Git、不要写在代码里 |
| **环境变量** | 云开发控制台中的环境变量会加密存储，只有云函数运行时可读取 |
| **密钥泄露** | 若曾误发密钥，请立即在 DeepSeek 控制台撤销并重新生成 |
| **请求域名** | 微信小游戏的 `wx.request` 需在后台配置合法域名，云函数 URL 的域名 `*.service.weixin.qq.com` 通常已内置为合法 |

---

## 六、常见问题

### Q1：云函数返回「裁决服务配置异常」

- 检查是否已配置 `HUNYUAN_API_KEY` 或 `DEEPSEEK_API_KEY` 任一环境变量
- 确认添加后已重新部署云函数

### Q2：云函数调用失败

- 确认小游戏已开通云开发、环境 ID 正确
- 检查 `wx.cloud.init` 是否在 `initGame` 之前执行

### Q3：报错 `-504003 Invoking task timed out after 3 seconds`（超时）

- **原因**：云函数默认超时仅 3 秒，调用大模型需要更长时间
- **解决**：在云开发控制台 → 云函数 → adjudication → **配置** → 将 **超时时间** 改为 **20 秒** 或 **30 秒**，保存后重新部署

### Q4：显示「天有不测风云，你的举动暂时未能得到回应」

- 表示云函数已调用，但**大模型 API 请求失败**。页面会显示具体失败原因（如 API 密钥无效、超时等）
- 查看详细日志：云开发控制台 → 云函数 → adjudication → **日志**，可看到 `裁决失败:` 后的完整报错
- 常见原因：API 密钥错误、混元/DeepSeek 服务异常、云函数超时仍为 3 秒

### Q5：DeepSeek/混元 API 超时或 5xx

- 大模型首次请求可能较慢，建议云函数超时至少 20 秒

---

## 七、目录结构

```
caozei/
├── cloudfunctions/
│   └── adjudication/
│       ├── index.js      # 云函数入口
│       └── package.json
├── docs/
│   └── 云开发_裁决API部署指南.md  # 本文档
└── ...
```
