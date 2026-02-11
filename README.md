## 微信文字冒险小游戏（工程版）

基于微信小游戏 Canvas 能力的文字冒险体验，客户端负责渲染、交互和存档，服务端（DeepSeek + 事件引擎）提供裁决与剧情扩展。

### 项目结构

- `src/`：TypeScript 源码
  - `config/`：客户端常量与默认状态
  - `core/`：领域模型、内容注册表
  - `services/`：持久化、网络等服务
  - `ui/`：布局、渲染、输入层
  - `utils/`：微信 API 适配、对话缓冲等工具
- `dist/`：`npm run build` 后可直接导入微信开发者工具的产物
- `temp/`：esbuild 的中间文件
- `tests/`：Vitest 单元测试

### 快速开始

```bash
npm install
npm run build   # 生成 dist/ 目录和根目录下的 *.min.js
npm run dev     # 监听构建（需要本地 wx 调试环境）
```

> `ADJUDICATION_API`、`NODE_ENV` 等可通过环境变量注入，构建脚本会在 bundle 阶段写入常量。

### 单元测试

```bash
npm run test
```

- 当前覆盖 `SaveManager` 的核心流程（裁剪、事件去重等）
- 测试中自动使用内存模拟存储，避免依赖 `wx` 对象

### 手动打包 & 微信导入

1. `npm run build`
2. 将 `dist/` 内容（含 `game.min.js`, `main.min.js`, `save.min.js`, `config.min.js`, `game.json`）复制或压缩
3. 在微信开发者工具中导入 `dist/` 或整个仓库目录

### 内容 / 剧情协作者指南

- `docs/content_tasks.md`：列出内容侧待办
- `src/agents/prompts.ts` & `src/core/contentRegistry.ts`：提供 prompt 注册及事件 JSON 的占位接口
- 工程侧只依赖注册表返回的数据，内容侧可独立提交 `.json` 或 prompt 更新

如需手动同步包体，可参考 `temp_package/需求与框架/手动同步指南.md`。
