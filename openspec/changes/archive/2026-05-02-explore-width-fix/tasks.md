## 1. 移除对话区居中包裹

- [x] 1.1 移除 `flex justify-center min-w-0 overflow-hidden` 外层 wrapper
- [x] 1.2 移除 `max-w-2xl w-full` 内层 wrapper，对话区直接 `flex-1 flex flex-col min-w-0`
- [x] 1.3 确保消息气泡 `max-w-[90%]` 保持不变

## 2. 验证

- [x] 2.1 TypeScript 编译零错误
- [x] 2.2 1920px 下对话区宽度 1696px（无 page-level max-w），与其他页面一致
- [x] 2.3 1280px / 1440px / 1920px 无水平滚动条
- [x] 2.4 移动端（375px / 768px）布局不受影响
