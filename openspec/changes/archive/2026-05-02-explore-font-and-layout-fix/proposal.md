## Why

explore 页面存在三个体验问题：
1. **输入框不在页面底部** — AppShell 的 `<motion.div>` 缺少高度传递，导致 explore 页面的 flex 布局无法将输入框推到底部，下方留白
2. **求职画像面板太小** — 384px 宽度 + 14px 字体在大屏上显得逼仄
3. **聊天字体偏小** — 14px 的聊天文字在大屏上阅读不够舒适

## What Changes

- AppShell `<motion.div>` 添加 `h-full flex flex-col`，打通高度链，让子页面可以使用 flex-1 填满高度
- 求职画像面板宽度 384px → 420px
- 面板字体体系全部上调一级：标题 16→18px，内容 14→16px，标签 12→14px
- 聊天气泡字体 14px → 16px

## Capabilities

### Modified Capabilities
- `frontend-shell`: AppShell motion.div 添加高度传递能力
- `explore-chat-ui`: 面板宽度 + 全局字体上调

## Impact

- `src/components/shell/AppShell.tsx` — 1 个 class 改动
- `src/app/explore/page.tsx` — 面板宽度 + 字体值更新
