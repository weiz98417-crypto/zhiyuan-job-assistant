## Context

当前 explore 页面结构为一个 `flex` 容器：左侧 `flex-1` 聊天区 + 右侧 320px 侧栏（仅分析后显示）。聊天区没有 max-width 约束，空状态仅有一个图标浮在大片空白中。参考 ChatGPT（居中 ~700px）、Perplexity（对话 + 右侧结果面板）、DeepSeek（居中对话 + prompt chips）的实际布局后重新设计。

AppShell 已在 desktop-layout-optimization 中改为流体布局（无 max-width），explore 页面继承流体宽度，在页面内部自行约束对话区宽度。

## Goals / Non-Goals

**Goals:**
- 对话区 max-w-2xl (672px) 居中，匹配行业标准阅读宽度
- 空状态改为紧凑卡片 + 引导性 prompt chips
- "求职画像"升级为 360-400px 持久右侧面板，字体提升至 text-sm/text-base
- 分析前显示 placeholder 而非完全隐藏
- 高度自然填充（去掉 max-h-[800px]）
- 面板独立滚动，不跟对话区一起滚动

**Non-Goals:**
- 不改变对话逻辑（stream API、summarize API 调用）
- 不改变 localStorage 持久化机制
- 不影响移动端布局（<1024px 保持当前行为）
- 不新增 npm 依赖

## Decisions

### Decision 1: 对话区宽度约束 — max-w-2xl 居中

```
当前: flex-1 (无约束, 1920px下消息 ~1305px)
改为: max-w-2xl mx-auto (672px, 中文约 40-45 字/行)
```

**Why 672px**: ChatGPT 和 DeepSeek 对话区均约 700px。中文单字宽于英文（~14px vs ~8px），672px 约 40-45 个中文字/行，符合 65-75ch 最佳阅读范围。Perplexity 同样使用 max-width 约束。

**气泡宽度**: `max-w-[80%]` → `max-w-[90%]`，在 672px 容器内约 605px，用户消息更充分地利用空间。

### Decision 2: 页面整体布局 — 居中对话 + 右侧面板

```
┌──────────────────────────────────────────────────┐
│                  Header (全宽)                    │
├────────────────────────┬─────────────────────────┤
│  spacer │ chat(672px)  │  求职画像 (384px)        │
│  (flex) │  (max-w-2xl) │  (w-96, 持久可见)       │
│         │              │                         │
│         │  空状态/消息  │  独立 overflow-y-auto   │
│         │              │                         │
│         │  [输入框]    │  [保存到档案]           │
└────────────────────────┴─────────────────────────┘
```

**Why 384px (w-96)**: 384px 比当前的 320px 宽 20%，为 text-sm (14px) 字体提供足够空间展示推荐方向卡片、技能标签、偏好文本。Perplexity 的 Sidecar 也约此宽度。

**Why 持久可见**: Perplexity 的 Sidecar 和 ChatGPT 的 Canvas 都是持久面板。求职画像是该页面的核心产出，不应只在手动点击"帮我总结"后才出现。分析前显示 placeholder 状态："开始聊天后，AI 会在这里自动分析你的求职画像..."。

### Decision 3: 空状态 — 紧凑卡片 + Prompt Chips

```
当前:
  py-12 空白区
  一个 🧭 Compass 图标 (40px)
  两行文字

改为:
  紧凑卡片 (max-w-sm, py-6)
  🧭 + "开始聊起来吧"
  "不需要有答案，想到什么说什么"
  3-4 个 prompt chips:
    [💬 我之前做过...]
    [💡 我想找钱多事少的...]
    [🔄 转行有没有机会？]
```

**Why prompt chips**: DeepSeek 在空状态使用 "推荐提示词" chips 填充首屏，ChatGPT 也有类似引导。点击 chip 自动填入输入框，降低用户开始对话的摩擦。

### Decision 4: 面板字体体系

| 层级 | 当前 | 改为 | 用途 |
|------|------|------|------|
| 面板标题 | `text-sm` | `text-base font-bold` | "求职画像" |
| Section 标题 | `text-xs` | `text-sm font-medium` | "推荐方向"、"技能清单" |
| 内容文本 | `text-xs` / `text-[10px]` | `text-sm` | 角色名、偏好、约束 |
| 辅助文本 | `text-[10px]` | `text-xs` | 标签、置信度百分比 |
| 标签/chip | `text-xs` | `text-xs` (不变) | 技能标签 |

### Decision 5: 高度策略 — 自然填充代替固定高度

去掉 `h-[calc(100vh-var(--space-section)*2)] max-h-[800px]`，让聊天区自然填充 AppShell 内容区高度。消息区使用 `flex-1 overflow-y-auto`，面板使用 `h-full overflow-y-auto` 独立滚动。

**Why**: ChatGPT、Perplexity、DeepSeek 的对话区都自然填充视口高度。固定 max-h 在长对话时会导致过早出现滚动区域，在短对话时浪费上方空间。

### Decision 6: 响应式策略

| 断点 | 布局 |
|------|------|
| <1024px (移动端) | 保持当前单栏布局，面板以 bottom sheet 形式出现 |
| 1024-1279px (lg) | 单栏居中 + 面板可切换显示 |
| 1280px+ (xl) | 居中对话 + 右侧持久面板 |

**Why lg 以下走单栏**: 672px 对话 + 384px 面板 = 1056px，加上间距超过 1024px。lg 以下面板可收起到右下角浮动按钮，点击展开。

## Risks / Trade-offs

- **[Risk] 面板持久可见增加视觉噪音** → 分析前显示极简 placeholder（仅图标 + 一行文字），信息密度远低于分析后状态
- **[Risk] 672px 对话区在 lg 断点(1024px)略窄** → 1024px 下：384px 面板需收起，对话区可用 1024-224(侧栏)-64(padding)=736px，672px 仍 OK
- **[Risk] Prompt chips 点击后可能需要处理输入框聚焦** → 使用 ref.focus() 简单处理
- **[Trade-off] 面板从 320px 扩大到 384px** → 在 1280px 屏幕上，对话区 672px + 面板 384px = 1056px，扣除侧栏 224px 后约 1280-224=1056px 刚好。1440px+ 更舒适
