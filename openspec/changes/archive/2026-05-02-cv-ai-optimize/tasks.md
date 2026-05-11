## 1. 类型扩展

- [x] 1.1 在 `types/index.ts` 新增 `OptimizeSectionRequest` 和 `OptimizeSectionResponse` interface
- [x] 1.2 新增 `OptimizeVariant` interface（label, content, approach）

## 2. 优化 API 端点

- [x] 2.1 创建 `src/app/api/cv/optimize-section/route.ts`，实现 POST 端点
- [x] 2.2 编写优化 prompt（3 方案差异化生成、双滑块参数映射、UserProfile 注入、全量 CV 上下文）
- [x] 2.3 无 targetJD 时仅生成 A+B；API 异常时返回合理错误

## 3. 优化面板 UI 组件

- [x] 3.1 创建 `src/app/cv/optimize-panel.tsx` 组件（意图输入 + 双滑块 + 方案卡片列表 + 加载/错误状态）
- [x] 3.2 实现滑块组件（激进程度 1-10 + 关键词密度 1-10，动态标签根据值变化）
- [x] 3.3 实现方案卡片渲染（方案 A/B/C 卡片 + 「选用此方案」按钮 + scheme 标签颜色区分）

## 4. CV 页面集成优化面板

- [x] 4.1 每个 section 卡片右下角添加 `✨ AI 优化` 按钮（hover 显示）
- [x] 4.2 点击按钮展开优化面板（同一时间仅一个面板展开，用 `activeOptimizeSection` state 控制）
- [x] 4.3 实现方案选用逻辑：替换 section content → 绿闪动画 → 激活保存按钮
- [x] 4.4 实现放弃逻辑：关闭面板，原文不变
- [x] 4.5 实现「调整重新生成」：清空旧方案，用新参数重新请求
- [x] 4.6 有 JD 配对时自动提示并传 targetJD 生成方案 C

## 5. 上下文集成

- [x] 5.1 优化请求时从 localStorage 读取 UserProfile 传入 API
- [x] 5.2 当前版本 5 个 section 全量拼接为 fullCV 传入 API
- [x] 5.3 无 UserProfile 时正常降级

## 6. 存储联动

- [x] 6.1 优化选用后保存时自动标记 source 为 "optimized"
- [x] 6.2 版本下拉菜单中显示「已优化」标识

## 7. 集成验证

- [x] 7.1 TypeScript 类型检查通过
- [ ] 7.2 手动测试：打开优化面板、调整滑块、生成方案、选用、放弃、重新生成
- [ ] 7.3 手动测试：有 JD 配对时生成 3 个方案（含方案 C）
- [ ] 7.4 手动测试：优化后保存，版本标记为「已优化」
