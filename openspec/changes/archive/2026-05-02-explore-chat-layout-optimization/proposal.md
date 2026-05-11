## Why

需求探索页面（explore）是用户使用 AI 对话梳理职业方向的核心入口，但当前布局在桌面端存在三个严重影响体验的问题：聊天区无宽度约束导致消息行长达 1300px+、空状态在大片空白中只有一个图标、"求职画像"结果面板字体 10-12px 且只在手动总结后才出现。参考 ChatGPT、Perplexity、DeepSeek 三家产品的实际布局后，需要整体重构该页面的视觉结构。

## What Changes

- 对话区从 `flex-1` 无约束改为 `max-w-2xl` (672px) 居中布局，匹配行业标准的 ~700px 阅读宽度
- 空状态从"大空白 + 图标"改为紧凑卡片式引导，包含 3-4 个引导性 prompt chips
- "求职画像"面板从 320px 临时侧栏升级为 360-400px 持久右侧面板，字体从 10-12px 提升至 14-16px
- 分析前显示 placeholder 状态（"开始聊天后自动分析..."），不再完全隐藏
- 高度从固定 `max-h-[800px]` 改为自然填充，面板独立滚动
- 消息气泡 `max-w-[80%]` 改为 `max-w-[90%]`（在 672px 容器内约 605px，中文约 40 字/行）
- 输入框宽度跟随对话区约束

## Capabilities

### New Capabilities
- `explore-chat-ui`: 需求探索对话页面的布局与交互设计，包括对话区、求职画像面板、空状态引导

## Impact

- `src/app/explore/page.tsx` — 主要改动文件
- `src/components/design/` — 可能需要新增 PromptChip 或复用现有 WarmButton/PaperCard
- 不涉及 API、数据库、其他页面
