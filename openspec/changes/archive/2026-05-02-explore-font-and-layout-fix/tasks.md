## 1. AppShell 高度链修复

- [x] 1.1 AppShell `<motion.div>` 类名添加 `h-full flex flex-col`，打通高度传递
- [x] 1.2 Root layout `<body>` 从 `min-h-full` 改为 `h-full`，建立确定高度链

## 2. 面板宽度 + 字体升级

- [x] 2.1 桌面面板和移动面板宽度 `w-96` → `w-[420px]`，motion animate `width: 384` → `width: 420`
- [x] 2.2 面板标题 `text-base` → `text-lg`
- [x] 2.3 Section 标题 `text-sm` → `text-base`
- [x] 2.4 内容文本 `text-sm` → `text-base`
- [x] 2.5 标签/辅助文本 `text-xs` → `text-sm`
- [x] 2.6 Icon 尺寸上调：标题 icon 16→18，section icon 14→16

## 3. 聊天气泡字体

- [x] 3.1 MessageBubble `text-sm` → `text-base`

## 4. 验证

- [x] 4.1 TypeScript 编译零错误
- [x] 4.2 输入框在页面底部，下方无留白（gap: 62px = padding/natural spacing）
- [x] 4.3 1920px / 1280px 无水平滚动条
- [x] 4.4 其他页面（evaluate, cv, jds, reports）布局未受影响
