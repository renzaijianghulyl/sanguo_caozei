# 弈笔草莽 · 框架与 UI 优化分析

> 基于当前代码库的全面审视，提出游戏框架与 UI 页面的优化与重构建议。

---

## 一、游戏框架优化建议

### 1.1 当前架构概览

| 模块 | 行数 | 职责 | 现状评估 |
|------|------|------|----------|
| gameApp.ts | ~1032 | 初始化、触摸、输入、裁决、渲染触发 | ⚠️ 体量过大，职责混杂 |
| renderer.ts | ~709 | Canvas 绘制（状态栏、对话、输入、行动槽） | ⚠️ 单文件过长，颜色/常量分散 |
| saveManager.ts | ~556 | 存档读写、裁剪、版本迁移 | ✅ 结构清晰 |
| preAdjudicator.ts | ~320 | 时间推进、逻辑约束、叙事等级 | ✅ 职责明确 |
| characterCreation.ts | ~413 | 角色创建布局与绘制 | ⚠️ 与 renderer 色彩/圆角重复 |
| splash.ts | ~157 | 启动页 | ✅ 精简 |

### 1.2 框架层可优化点

#### （1）gameApp.ts 过重，建议拆分

**问题**：1032 行集中了生命周期、触摸路由、本地指令、裁决流程、打字机、存档、UI 状态等，难以维护与单测。

**建议**：
```
src/app/
├── gameApp.ts          # 薄壳：初始化、render 调度、导出
├── touchRouter.ts      # 触摸分发、hit 检测（pointInRect 等）
├── inputHandler.ts     # submitInput、本地指令、裁决调用
├── typewriter.ts       # startTypewriter、finishTypewriter、skipTypewriter
└── phaseManager.ts     # phase 切换（splash/creation/playing）、updateGameDataFromSave
```

**优先级**：中（不影响功能，提升可维护性）

---

#### （2）Runtime 状态集中管理

**问题**：`GameRuntime` 对象包含 20+ 字段，散落在 gameApp 各处读写，难以追踪变更来源。

**建议**：
- 引入轻量状态聚合：`runtime.phase`、`runtime.ui`、`runtime.adjudication` 分子对象
- 或使用「事件/命令」模式：状态变更通过 `dispatch(action)` 统一入口，便于调试与回放

**优先级**：低（当前可工作，长期可考虑）

---

#### （3）配置与文案抽离

**问题**：
- `config/index.ts` 混合了 DEFAULT 状态、AMBITION 文案、ClientConfig、HEAVEN_REVELATION 等，体量偏大
- `agents/prompts.ts` 与云函数内 `SYSTEM_PROMPT` 未打通，存在重复

**建议**：
- `config/` 拆为 `defaults.ts`、`intro.ts`、`client.ts`
- Prompt 统一来源：云函数从 `@config/prompts` 或 contentRegistry 读取，避免双写

**优先级**：中

---

#### （4）桥接层 (bridge) 未完全落地

**问题**：`.cursorrules` 要求「禁止直接使用 wx.xxx，必须通过 bridge」，但 `gameApp`、`saveManager` 等仍有 `typeof wx !== 'undefined'` 判断，未完全经由 `@utils/bridge`。

**建议**：
- 将 `wxHelpers` 扩展为完整 bridge，封装 `wx.request`、`wx.getStorageSync`、`wx.showToast` 等
- 业务代码只依赖 `bridge.xxx`，便于 Web 仿真与单测

**优先级**：低（微信环境当前可用）

---

### 1.3 是否需要重构？

| 维度 | 结论 |
|------|------|
| 功能完整性 | ✅ 核心流程贯通，暂不必大动 |
| 可维护性 | ⚠️ gameApp 过长，建议按「输入/触摸/打字机」拆分 |
| 可测试性 | ✅ 已有 50+ 单测，覆盖核心链路 |
| 扩展性 | ⚠️ 新增 phase（如设置页、存档选择）需改多处 |

**总体**：**渐进式重构** 即可。优先拆分 `gameApp` 与 UI 常量，不必推倒重来。

---

## 二、UI 页面优化建议

### 2.1 当前 UI 结构

```
Splash（开始页）
    ↓ 点击
CharacterCreation（角色创建：姓名、性别、志向、属性）
    ↓ 确认
Playing（主游戏：状态栏 + 对话区 + 行动槽 + 输入区）
```

### 2.2 UI 层可优化点

#### （1）颜色与主题未统一

**问题**：
- `renderer.ts`、`splash.ts`、`characterCreation.ts` 各自定义 `colors`，存在重复与细微差异
- 如 `panelBorder` 在 renderer 为 `0.12`，在 characterCreation 为 `0.15`

**建议**：
```
src/ui/
├── theme.ts       # 统一 colors、fonts、radius
├── renderer.ts    # 只负责绘制，从 theme 导入
├── splash.ts
└── characterCreation.ts
```

**优先级**：高（改动小，收益明显）

---

#### （2）renderer.ts 职责过重

**问题**：709 行包含背景、状态栏、对话区、行动槽、输入区、气泡、加载动画、圆角矩形、文字换行等，单文件难以定位修改点。

**建议**：
```
src/ui/
├── theme.ts
├── primitives.ts     # drawRoundedRect、wrapText、measureBubble
├── statusPanel.ts    # drawStatusPanel、getRestartButtonRect、getAttrHelpButtonRect
├── dialogueArea.ts   # drawDialogueArea、drawBubble、drawLoadingIndicator
├── actionGuideSlot.ts
├── inputArea.ts
└── renderer.ts       # 仅 compose 上述模块
```

**优先级**：中

---

#### （3）布局常量重复

**问题**：`RESTART_BTN_WIDTH`、`ATTR_HELP_ICON_SIZE`、`ACTION_CHIP_GAP`、`SEND_BTN_WIDTH` 分散在 renderer，部分与 layout 计算耦合。

**建议**：
- 在 `layout.ts` 或 `theme.ts` 中集中定义「组件尺寸常量」
- renderer 的 hit 检测与 layout 使用同一套数值

**优先级**：低

---

#### （4）对话区体验

| 项目 | 现状 | 建议 |
|------|------|------|
| 滚动提示 | 底部「下滑查看更多」 | 首次可滚动时加一次高亮或动画 |
| 打字机跳过 | 底部「点击屏幕跳过」 | ✅ 已实现 |
| 气泡样式 | 系统/玩家两种 | 可增加「系统提示」第三种样式（如存档成功） |
| 长文案 | 自动换行 | ✅ 已有 wrapText |

---

#### （5）状态栏信息密度

**现状**：年份·季节 | 体 | 金 粮 + 地点 + 五维属性 + ? + 重新开始

**建议**：
- 小屏下五维可考虑折叠为「武智魅运传」缩写或横向滚动
- 资源行与地点行可合并为一行（若空间紧张）

**优先级**：低（当前可读性尚可）

---

#### （6）角色创建页

**现状**：姓名、性别、志向、四维属性、开始按钮

**建议**：
- 志向选项与 INITIAL_DIALOGUE / HEAVEN_REVELATION 的衔接可更明确（若志向影响开场文案）
- 属性分配的可视化反馈：如进度条或已用点数/总点数更突出

**优先级**：低

---

#### （7）开始页 (Splash)

**现状**：标题、副标题、玩法指南卡片、点击开始

**建议**：
- 玩法指南在超小屏（如 320px）可能换行，可加 `measureText` 动态拆行
- 点击区域全屏，无死区 ✅

**优先级**：低

---

### 2.3 UI 重构优先级汇总

| 项目 | 优先级 | 工作量 |
|------|--------|--------|
| 统一 theme（colors/fonts） | 高 | 小 |
| 拆分 renderer 为多模块 | 中 | 中 |
| 布局常量集中 | 低 | 小 |
| 对话区滚动首次提示 | 低 | 小 |
| 状态栏小屏适配 | 低 | 中 |

---

## 三、推荐实施顺序

### 阶段 1（低成本高收益）✅ 已完成
1. 新建 `src/ui/theme.ts`，抽离 colors、fonts、radius、sizes
2. 三处 UI（renderer、splash、characterCreation）改为从 theme 导入
3. 新建 `src/ui/primitives.ts`，抽离 drawRoundedRect、wrapText

### 阶段 2（提升可维护性）✅ 已完成
4. 从 gameApp 拆出 `src/app/typewriter.ts`（打字机逻辑独立）

### 阶段 3（按需）
5. 继续拆 gameApp 的 touchRouter、inputHandler
6. 继续拆 renderer 的 statusPanel、dialogueArea 等子模块

---

## 四、附录：当前文件依赖关系（简化）

```
game.ts
  └── app.ts
        └── gameApp.ts
              ├── snapshot, preAdjudicator, actionProcessor
              ├── saveManager, adjudication, contentGuard, rewardedAd
              ├── layout, renderer, splash, characterCreation, input
              └── wxHelpers
```

UI 模块间无循环依赖，renderer 与 characterCreation 都依赖 layout。抽离 theme 后，二者共同依赖 theme，结构更清晰。
