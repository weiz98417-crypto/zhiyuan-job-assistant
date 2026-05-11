## Context

explore 页面的输入框没有贴底，原因是 AppShell 中 `<motion.div>` 没有传递高度。其他页面的内容自然撑开不受影响，但 explore 依赖 flex-1 将输入框推到底部，需要完整的高度链。

面板和字体大小基于之前的设计决策，用户反馈在大屏上偏小。

## Goals / Non-Goals

**Goals:**
- 输入框始终在页面底部
- 面板更大、更易读
- 聊天文字更舒适
- 不影响其他页面的布局

**Non-Goals:**
- 不改变 AppShell 其他行为
- 不改变 explore 的对话逻辑
- 不改变移动端行为

## Decisions

### Decision 1: AppShell motion.div 加 `h-full flex flex-col`

`<main className="flex-1">` 在 `h-screen` flex 容器中有确定高度。子元素 `motion.div` 加 `h-full` 继承该高度，`flex flex-col` 让子页面可以使用 `flex-1`。

**Why 不会影响其他页面**: 其他页面（evaluate, cv, jds, reports）的内容自然流式布局，在 flex column 容器中不受影响。页面高度由内容决定，不会出现异常滚动或空白。

### Decision 2: 字体体系上调一级

| 位置 | 当前 | 改为 |
|------|------|------|
| 消息气泡 | `text-sm` (14px) | `text-base` (16px) |
| 面板标题 | `text-base` (16px) | `text-lg` (18px) |
| Section 标题 | `text-sm` (14px) | `text-base` (16px) |
| 内容文本 | `text-sm` (14px) | `text-base` (16px) |
| 标签/辅助 | `text-xs` (12px) | `text-sm` (14px) |

### Decision 3: 面板宽度 420px

`w-96` (384px) → `w-[420px]`。在 1440px 屏幕上：chat = 1440-224(sidebar)-420(panel)-64(padding) = 732px。在 1280px 屏幕上 chat = 592px。空间充足。
