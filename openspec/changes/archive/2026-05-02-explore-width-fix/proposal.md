## Why

explore-chat-layout-optimization 中错误地照搬了 ChatGPT 的"居中窄对话"模式（max-w-2xl 672px 居中），导致 explore 页面在 1920px 屏幕上仅使用 672px 宽度，而其他所有页面都填满 AppShell 的 1696px 可用空间。用户反馈"其他界面都匹配上了，就这个不匹配"。

## What Changes

- 移除对话区的 `flex justify-center` + `max-w-2xl` 包裹层
- 对话区改为 `flex-1 flex flex-col`，填满面板左侧的全部可用空间
- 消息气泡保持 `max-w-[90%]` 确保可读性
- 其他布局（面板 384px 持久可见、空状态 prompt chips、字体体系）保持不变

## Capabilities

### Modified Capabilities
- `explore-chat-ui`: 对话区从居中窄列改为左对齐填满可用宽度，与 AppShell 流体布局一致

## Impact

- `src/app/explore/page.tsx` — 移除 2 个 wrapper class
