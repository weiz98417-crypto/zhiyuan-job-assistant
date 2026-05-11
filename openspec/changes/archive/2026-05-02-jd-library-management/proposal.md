## Why

当前的 JD 评估页面（`/evaluate`）仅支持"粘贴文本"和"输入 URL"两种即时评估模式，没有 JD 存储和回顾能力。用户每次评估都是孤立的——无法浏览历史 JD、无法复用已评估的 JD、无法在投递决策前对比多个 JD。我们已经在 IndexedDB 中存了 `reports` 表（评估报告），但缺少独立的 JD 库来管理 JD 内容本身。

## What Changes

- 新增 **JD 库（JD Library）** 作为 IndexedDB 新表，独立存储每一条 JD 记录
- 新增 **JD 管理页面**（`/evaluate/jds`），以卡片列表形式展示所有已录入的 JD
- 支持搜索（公司名、职位名、关键词）和筛选（来源类型、是否有报告关联）
- 支持 JD 卡片点击查看详情、编辑、删除
- URL 输入降级为可选"来源链接"字段，不再自动抓取（国内反爬严重）
- JD 记录与评估报告（`reports` 表）通过 `reportId` 字段关联
- 从评估结果页可直接"保存到 JD 库"

## Capabilities

### New Capabilities

- `jd-library-storage`: IndexedDB 新表 `jds`，存储 JD 元数据和正文，支持与 reports 表关联
- `jd-library-ui`: JD 卡片列表页（`/evaluate/jds`），搜索、筛选、详情、编辑、删除

### Modified Capabilities

- `jd-evaluation-ui`: 评估结果页新增"保存到 JD 库"按钮，评估时若 JD 来自 OCR 或手动粘贴则自动写入 JD 库

## Impact

- 新增 IndexedDB schema migration（Dexie.js version 2）：`jds` 表
- 新增页面路由：`/evaluate/jds`
- 新增类型定义：`JDRecord`
- 不影响现有评估流程，作为增强
