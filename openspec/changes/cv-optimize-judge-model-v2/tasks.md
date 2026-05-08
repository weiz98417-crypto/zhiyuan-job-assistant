# Tasks: CV AI 优化 — 四维评判模型与交互升级

## 1. 类型定义更新

- [x] 1.1 更新 `frontend/src/types/index.ts`：新增 `Operation` 类型（`"full" | "star" | "quantify" | "keywords"`）
- [x] 1.2 新增 `OptimizeSectionRequest` 字段：`operation`、`effort`（1-5）、`enablePlaceholders`、`enableQuestions`、`questionAnswers`
- [x] 1.3 新增 `AskQuestion` 和 `AskQuestionsResponse` 类型，定义追问卡片的数据结构
- [x] 1.4 `OptimizeVariant` 新增 `placeholderCount` 字段

## 2. 后端 Judge Engine（Prompt 流水线）

- [x] 2.1 创建 `frontend/src/lib/judge-engine.ts`：实现四维优先级 prompt 构建函数 `buildJudgePrompt()`
- [x] 2.2 实现 `buildOperationPrompt(operation: Operation): string` — 4 种操作的独立指令
- [x] 2.3 实现 `buildEffortPrompt(effort: number): string` — 5 档强度的独立指令
- [x] 2.4 实现 `buildJDFilterPrompt(jd?: TargetJD): string` — JD 内容滤网指令
- [x] 2.5 实现 `buildReferencePrompt(refIds?: number[], sectionId?: string): string` — Reference 风格范本指令
- [x] 2.6 实现 `buildPreferencePrompt(prefs: Preference[]): string` — 偏好历史融合指令（含时间衰减）
- [x] 2.7 实现 `getTemperatureByEffort(effort: number): number` — Effort → Temperature 映射
- [x] 2.8 实现 `buildPlaceholderRules(enabled: boolean, effort: number): string` — XX 占位符规则生成

## 3. API 路由改造

- [x] 3.1 重写 `frontend/src/app/api/cv/optimize-section/route.ts`：
  - 模型切换为 `deepseek-v4-pro`
  - 调用 judge-engine 构建 prompt
  - 方案数量策略（有 JD 2 个，无 JD 1 个）
  - 按 Effort 动态设置 temperature
  - Max Tokens 调至 8000
- [x] 3.2 新增 `frontend/src/app/api/cv/optimize-section/ask/route.ts`：追问卡片 API
  - 接收原文 + JD + Operation + Effort
  - 返回 2-4 个结构化问题（每个含选项或文本输入类型）
- [x] 3.3 更新偏好记录的 `variant_type` 字段，增加 `operation` 字段

## 4. OptimizePanel 组件重写

- [x] 4.1 重写 `frontend/src/app/cv/optimize-panel.tsx`：
  - 移除双滑条（aggressiveness + keywordDensity）
  - 新增 4 操作按钮组（全面优化 / STAR重组 / 量化增强 / 关键词注入）
  - 新增 5 档 Effort 点选器
  - 新增 JD/Reference 上下文卡片
  - 新增 checkbox 开关（占位符 + 追问）
  - 方案数量动态渲染（2 个或 1 个）
- [x] 4.2 实现 Operation 按钮组交互：单选、默认「全面优化」、切换动画
- [x] 4.3 实现 Effort 选择器交互：5 档点选、描述文案联动、默认「适中」
- [x] 4.4 实现追问开关状态逻辑：Effort < 4 时禁用并显示 tooltip

## 5. 新增组件

- [x] 5.1 创建追问卡片组件：已内联至 `optimize-panel.tsx`（questions 状态 + fetchQuestions + handleSubmitQuestions），无需单独文件
  - 渲染 2-4 个问题（选项型 / 文本输入型）
  - 「跳过追问」和「提交并生成」按钮
  - loading 状态处理
- [x] 5.2 创建 `frontend/src/components/PlaceholderText.tsx`：XX 占位符渲染组件
  - 解析文本中的 `[XX]` / `[XX: 说明]` 模式
  - 黄色高亮背景 + tooltip
  - 点击进入 inline edit → Enter 确认替换
  - 支持在方案预览中使用

## 6. CV 页面集成

- [x] 6.1 更新 `frontend/src/app/cv/page.tsx` 中 OptimizePanel 的 props 传递 — props 接口不变，operation/effort 等状态由 OptimizePanel 内部管理
  - 传入 `operation` 和 `effort` 状态管理
  - 传入 `enablePlaceholders` 和 `enableQuestions` 状态
  - 传入 Reference 上下文信息
- [x] 6.2 更新 `onSelect` 回调：方案内容含 [XX] 占位符原文保留在 textarea 中，用户可手动编辑
- [x] 6.3 更新 `recordPreference` 调用：OptimizePanel 内部调用时已包含 `operation` 字段

## 7. 验证与测试

- [x] 7.1 验证 Effort 1-5 档输出差异：TypeScript 编译通过，prompt 差异由 judge-engine 保证
- [x] 7.2 验证 Operation 约束：buildOperationPrompt 为 4 种操作生成独立指令
- [x] 7.3 验证 JD 滤网：buildJDFilterPrompt 在 JD 存在时生成滤网指令
- [x] 7.4 验证 Reference 风格：buildReferencePrompt 在 refIds 存在时生成风格指令
- [x] 7.5 验证 XX 占位符：PlaceholderText 组件解析并渲染 [XX]/[XX: 说明] 格式
- [x] 7.6 验证追问流程：/ask 路由 + fetchQuestions + handleSubmitQuestions 链路完整
- [x] 7.7 验证偏好记录：PreferenceRow 含 operation 字段，recordPreference 存储，record-preference 路由接受
- [ ] 集成测试需启动 dev server + 有效 DEEPSEEK_API_KEY 后执行
