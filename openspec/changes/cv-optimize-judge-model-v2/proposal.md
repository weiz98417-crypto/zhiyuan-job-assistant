# Proposal: CV AI 优化 — 四维评判模型与交互升级

## Why

当前简历 AI 优化的核心问题：双滑条（激进程度 + 关键词密度）的 10 级分段在后端仅映射为 3 档，调节不同等级几乎没有感知差异；同时 prompt 中「不编造原文中没有的事实」一刀切约束，导致 AI 只能做表面措辞润色，无法真正丰富简历内容。用户选择高激进程度期望得到深度改写，实际只得到换了个说法的原文。

## What Changes

- **双滑条 → 4 操作按钮 + 5 档 Effort 强度**：用户先选「做什么」（STAR重组/量化增强/关键词注入/全面优化），再调「做多深」（1-5 档），两维正交控制，每档之间有明确的改写策略差异
- **引入 XX 占位符机制**：替代「禁止编造」一刀切。AI 大胆推断量化维度，用 `[XX]` 占位符标注，用户点击即可替换为真实数据。用户自己把握尺度
- **新增追问交互模式**：Effort 4-5 时可开启。AI 生成方案前先返回 2-4 个信息补充问题，用户回答后融合到方案中
- **四维评判模型**：明确 Operation > JD ≈ Reference > Effort 优先级。JD 定位为「内容滤网」（决定看什么），Reference 定位为「风格范本」（决定写成什么味），Operation 为最高意志不可被覆盖
- **模型升级**：`deepseek-v4-flash` → `deepseek-v4-pro`，Temperature 按 Effort 动态调整（0.3/0.7/0.9）
- **OptimizePanel UI 重构**：操作按钮组 + 5 档强度选择器 + JD/Reference 上下文卡片 + 占位符高亮渲染 + 追问卡片组件

## Capabilities

### New Capabilities

- `cv-optimize-judge-engine`: 四维优先级评判模型的核心逻辑。包含 Operation × Effort × JD × Reference 的 prompt 构建流水线、XX 占位符推断策略、追问模式的问题生成与答案融合、偏好历史的学习应用、Temperature 动态调整规则

### Modified Capabilities

- `cv-optimization-ui`: OptimizePanel 交互从双滑条变更为操作按钮 + 5 档强度选择器；新增 JD/Reference 上下文展示区域；新增 XX 占位符黄色高亮渲染；新增追问卡片组件；方案对比从 3 方案调整为 2-3 方案（有 JD 时 2 个，无 JD 时 1 个）；新增机制开关（占位符/追问）

## Impact

- **前端**：`frontend/src/app/cv/optimize-panel.tsx`（重写）、`frontend/src/app/cv/page.tsx`（传入新参数）、`frontend/src/types/index.ts`（新增类型）
- **新增文件**：`frontend/src/app/cv/optimize-questions.tsx`（追问卡片）、`frontend/src/app/api/cv/optimize-section/ask/route.ts`（追问 API）
- **后端**：`frontend/src/app/api/cv/optimize-section/route.ts`（Prompt 架构重写）
- **配置**：环境变量中的模型名更新、Temperature 策略调整
- **无 BREAKING 变更**：API 路径保持不变，新增字段为 optional，前端向后兼容
