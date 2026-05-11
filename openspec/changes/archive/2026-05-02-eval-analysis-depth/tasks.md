## 1. 类型扩展

- [x] 1.1 在 `types/index.ts` 的 `EvaluationReport` 中新增 `keywordCoverage`、`skillGaps`、`levelMatch`、`differentiationTips` 字段及其 interface 定义
- [x] 1.2 在 `types/index.ts` 中新增 `EvaluateRequest` 类型，包含 `jdText`、`language`、`userProfile?` 字段

## 2. API 增强

- [x] 2.1 扩展 `/api/evaluate` prompt，新增 4 个分析维度的输出要求（关键词覆盖率、技能缺口、职级匹配、差异化提示）
- [x] 2.2 API 接收前端传入的 `userProfile` 并拼入 prompt，`max_tokens` 提升至 12000
- [x] 2.3 API 响应解析新增 4 个字段，并在 JSON 解析失败时返回合理默认值

## 3. 前端 UI

- [x] 3.1 评估报告新增"关键词覆盖率"可视化区块（进度条 + 绿色/红色/黄色标签列表）
- [x] 3.2 评估报告新增"技能缺口"表格区块（技能名 / 重要程度 / 可替代性）
- [x] 3.3 评估报告头部新增"职级匹配"标签（颜色编码：绿/黄/红/灰）
- [x] 3.4 评估报告新增"投递前重点关注"卡片列表（差异化提示）
- [x] 3.5 无此 4 项数据时对应区块不渲染
- [x] 3.6 前端 `handleSubmit` 从 localStorage 读取 `lingji-ai-profile` 并传入 API

## 4. 集成验证

- [x] 4.1 TypeScript 类型检查通过
- [ ] 4.2 手动测试：粘贴一条 JD，验证报告中 4 个新区块均正确展示
