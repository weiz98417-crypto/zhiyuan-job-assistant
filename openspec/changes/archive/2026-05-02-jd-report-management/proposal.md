## Why

评估报告（`reports` 表）是系统的核心产出，但当前缺少报告管理界面。用户只能在评估结果页查看单份报告，无法回顾历史报告、无法搜索对比、无法查看 JD↔报告的关联关系。虽然 IndexedDB 已经存储了所有报告数据，但没有一个集中的"报告列表"页面来浏览和管理这些资产。

## What Changes

- 在 `/evaluate` 下新增报告列表子页面（`/evaluate/reports`），以卡片列表展示所有评估报告
- 支持按公司名、职位名、报告关键词搜索
- 支持按评分范围、时间范围、archetype 筛选和排序
- 报告卡片显示：公司、职位、评分、日期、archetype 标签、关联 JD 状态
- 点击报告卡片可查看完整报告（复用现有 A-G 报告渲染逻辑）
- 支持删除报告（级联更新关联 JD 的 `reportId`）
- JD 与 Report 双向关联：从报告可跳转到关联 JD，从 JD 可跳转到关联报告

## Capabilities

### New Capabilities

- `report-browsing-ui`: 报告列表浏览页（`/evaluate/reports`），搜索、筛选、排序、查看、删除
- `jd-report-association`: JD 与 Report 双向关联导航，从报告卡片可跳转到关联 JD，从 JD 详情可跳转到报告

### Modified Capabilities

（无修改现有 capability — 报告存储和评估流程不变）

## Impact

- 新增页面路由：`/evaluate/reports`
- 新增自定义 hook：`useReports()` 封装报告查询逻辑
- 不影响现有评估流程和报告存储结构
