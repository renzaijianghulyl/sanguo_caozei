# 对话界面优化方案（Canvas 约束下）

## 现状与局限

- **平台**：微信小游戏仅提供 Canvas，无 WXML/scroll-view/rich-text，无法像豆包那样用原生长列表。
- **已有**：虚拟化绘制（只画可见气泡）、高度缓存、按需高频/低频 gameLoop。
- **可改进**：性能（减少重绘与重复计算）、交互（滚动体验、复制、自动滚底）。

---

## 关于「用 WXML + scroll-view 做对话层」

**结论：在当前小游戏项目里无法实现。**

- 微信**小游戏**（`project.config.json` 里 `compileType: "game"`）的运行时是**全屏 Canvas**，没有 DOM、没有 WXML/WXSS，所有界面只能通过 Canvas 或 WebGL 绘制。官方文档明确：小游戏不支持小程序的 WXML 组件（如 scroll-view、view、text）。
- 因此无法在现有工程中「加一层 WXML 对话层」而不改项目类型。

**若坚持要用 scroll-view，只有两条路：**

1. **改为小程序项目**  
   把 `compileType` 改为 `miniprogram`，入口改为小程序 App/Page，用 WXML 做整页（含 `scroll-view` 对话列表），游戏相关部分用小程序的 `<canvas>` 组件或分包小游戏再嵌进去。代价：入口、生命周期、包结构都要按小程序重做，工作量较大。

2. **小程序 + 小游戏混合**  
   主壳是**小程序**，对话/设置等用小程序页面（WXML + scroll-view）；只有「纯玩法」部分用分包小游戏或内嵌 game canvas。对话界面就是小程序页，天然有原生滚动和文字复制。代价：需要拆成两套（小程序壳 + 小游戏包），导航与数据同步要自己设计。

当前仓库是纯小游戏（无任何 .wxml/.wxss），所以**不改项目形态的话，只能继续在 Canvas 上做优化**（即本文档下文方案）。

---

## 一、性能优化

### 1. 分层 Canvas（高收益）

**思路**：把「很少变」和「经常变」分开画，对话区变化时只重绘对话层。

- **底层**：背景 + 状态栏（武力/智力等），只在进入游戏、读档、属性变化时重绘。
- **上层**：对话区 + 行动槽 + 输入区，打字机、滚动、新消息时重绘。

**实现要点**：
- 使用两个 Canvas（或离屏 Canvas 做底层缓存），`renderScreen` 里先画底层（或从缓存贴图），再画上层。
- 状态里加 `dialogueDirty: boolean`，只有对话/打字/滚动相关变化时设为 true；render 时若未 dirty 可跳过对话区重绘（或只重绘上层）。

### 2. 气泡「换行结果」缓存（中高收益）

**现状**：`measureBubble` 用 `wrapText` 算高度，`drawBubble` 又对同一段文字再调一次 `wrapText`，每条气泡换行算了两次。

**做法**：按 `(text, maxWidth)` 或 `(bubbleIndex)` 缓存 `wrapText` 的返回值 `lines: string[]`。
- 高度 = `lines.length * lineH + pad*2`，与测量一致。
- 绘制时直接用缓存的 `lines`，不再调 `wrapText`。
- 对话列表变化时清空或只失效新增/变更项。

可放在 `renderer.ts` 的 `dialogueHeightCache` 旁，增加 `linesCache: Map<string, string[]>`（key 可用 `text.slice(0,80)+maxWidth` 的简单 hash，或仅对当前可见气泡缓存）。

### 3. 打字机触发重绘节流（中收益）

**现状**：打字机每出一个字就 `onTick()` → `render()`，约 50ms 一次，整屏重绘。

**做法**：
- 方案 A：打字机 onTick 不直接 render，而是设 `dialogueDirty = true`，由 gameLoop 在下一帧统一 render（避免一帧内多次 render）。
- 方案 B：打字机每 N 个字（如 2～3 字）才触发一次 onTick，或每 2 帧触发一次，视觉上仍顺滑，但减少约一半重绘次数。

### 4. 对话区「脏区」精细控制（中收益）

- 只有以下情况标记对话区需要重绘：`dialogueHistory` 变化、`typingState` 变化、`dialogueScrollOffset` 变化、`isAdjudicating` 变化。
- `renderScreen` 内若 `!dialogueDirty` 且当前帧没有其他必须重绘的（如 splash 动画），可只重绘对话层或直接跳过对话区 draw，进一步省 CPU。

---

## 二、交互优化

### 1. 惯性滚动（高体验）

**现状**：手指拖多少就滚多少，松手即停。

**做法**：在 `handleTouchEnd` 里根据最后几帧的 `deltaY` 算一个速度，用 `requestAnimationFrame` 或 `setInterval` 做短时间的惯性位移（带衰减），使 `dialogueScrollOffset` 平滑变化，并 clamp 到 [0, maxScroll]。这样更接近豆包/原生列表的滑动感。

### 2. 长按复制单条（高体验）

**做法**：
- 在对话区 touch 时，根据 `dialogueScrollOffset` 和当前气泡的 startY/height 算当前触摸落在哪一条气泡上。
- 若长按超过约 400～500ms，则认为是「长按」，用 `wx.setClipboardData` 把该条内容（如 `bubbles[index]`）复制到剪贴板，并可选 `wx.showToast({ title: '已复制' })`。
- 需要区分「点击」与「长按」：短按不触发复制，可保留现有点击逻辑（如跳过打字机、点输入区等）。

### 3. 新消息自动滚到底并带平滑（中高体验）

**做法**：
- 当新增一条叙事（打字机开始或 onComplete 追加一条）时，若当前已在底部附近（如 `scroll >= maxScroll - 50`），则自动将 `dialogueScrollOffset` 设为 `maxScroll`。
- 若希望「平滑滚到底」，可用几帧线性插值：每帧 `scroll = scroll + (maxScroll - scroll) * 0.3` 直到接近 `maxScroll`，再设为 `maxScroll`，这样不会突然跳到底。

### 4. 滚动条/进度提示（可选）

在对话区右侧画一根细条，长度表示「当前可见内容在总内容中的位置」，例如：
- 条的总长固定，当前滚动对应条内一个「滑块」位置，使用户知道下面还有多少内容。
- 实现：用 `scroll / maxScroll` 和 `areaContentHeight / totalHeight` 算比例即可，纯绘制。

---

## 三、实施优先级建议

| 优先级 | 项           | 收益     | 实现难度 |
|--------|--------------|----------|----------|
| P0     | 气泡换行缓存 | 性能     | 低       |
| P0     | 惯性滚动     | 交互     | 中       |
| P1     | 分层 Canvas  | 性能     | 中       |
| P1     | 新消息自动滚底/平滑 | 交互 | 低       |
| P1     | 长按复制     | 交互     | 中       |
| P2     | 打字机节流   | 性能     | 低       |
| P2     | 脏区控制     | 性能     | 中       |
| P2     | 滚动条       | 交互     | 低       |

---

## 四、与豆包的差距说明

- **豆包等**：多为原生或 Web 的 DOM 长列表（虚拟列表 + 原生滚动），文字可选、可复制、惯性滚动由系统提供。
- **小游戏**：只有 Canvas，上述能力都需自绘、自己算触摸和滚动，因此无法「完全一致」，但通过以上优化可以明显缩小体验和性能差距。

若后续有「混合形态」（例如主流程仍小游戏，对话页用小程序里的 scroll-view 做一屏），可再单独做一版对话页的小程序组件，由小游戏跳转过去；当前方案仅针对纯 Canvas 小游戏。
