## 1. 对话区宽度约束

- [x] 1.1 在消息列表和输入区外层包裹 `max-w-2xl mx-auto w-full` 容器，约束对话区为 672px 居中
- [x] 1.2 消息气泡 `max-w-[80%]` 改为 `max-w-[90%]`
- [x] 1.3 移除页面外层 `h-[calc(100vh-var(--space-section)*2)] max-h-[800px]`，改为 `min-h-0 flex-1` 自然填充

## 2. 空状态引导卡片

- [x] 2.1 将空状态从"大空白 + 图标"改为紧凑卡片式（`py-8`）
- [x] 2.2 添加 3 个 prompt chips："我之前做过..."、"我想找钱多事少的..."、"转行有没有机会？"
- [x] 2.3 实现点击 chip 自动填入输入框 + 聚焦

## 3. 求职画像面板升级

- [x] 3.1 面板宽度从 320px (w-80) 改为 384px (w-96)
- [x] 3.2 面板在 XL 屏幕（≥1280px）上持久可见，不再仅在分析后出现
- [x] 3.3 面板分析前显示 placeholder："开始聊天后，AI 会在这里自动分析你的求职画像..."
- [x] 3.4 面板字体体系升级：标题 text-base font-bold，section 标题 text-sm font-medium，内容 text-sm，辅助 text-xs
- [x] 3.5 面板添加 `overflow-y-auto` 独立滚动
- [x] 3.6 面板添加关闭按钮（仅在 <1280px 时显示），XL 屏不可关闭

## 4. 响应式适配

- [x] 4.1 <1280px: 面板默认隐藏，保留当前 slide-in 行为（但使用新宽度和字体）
- [x] 4.2 1280px+: 面板持久可见（`hidden xl:block`），对话区居中在剩余空间
- [x] 4.3 Header（标题 + 操作按钮）在 max-w-2xl 容器内与对话区对齐

## 5. 输入区改造

- [x] 5.1 输入区宽度约束为 max-w-2xl 容器内，与消息区对齐
- [x] 5.2 空状态时输入区依然底部固定，不随引导卡片位置变化

## 6. 动画过渡

- [x] 6.1 Prompt chips 添加 hover/click 微交互（scale + 颜色变化）
- [x] 6.2 面板 placeholder → 分析完成的过渡动画（React 条件渲染自然过渡）
- [x] 6.3 确保 Framer Motion 动画在布局变更后正常工作（AppShell 动画未改动）

## 7. 验证

- [x] 7.1 TypeScript 编译零错误
- [x] 7.2 1280px / 1440px / 1920px 视口无水平滚动条 (Playwright verified)
- [x] 7.3 对话区消息行宽在 40-45 字范围内（中文）— 672px 容器, ~45 chars/line
- [x] 7.4 面板独立滚动正常 (overflow-y-auto applied to both desktop + mobile panel)
- [x] 7.5 移动端（375px / 768px）布局不变 (no scrollbars, panel hidden default)
