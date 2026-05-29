# Spec: JD Library Storage

## ADDED Requirements

### Requirement: JD 数据模型

系统 SHALL 在 IndexedDB 中新增 `jds` 表，存储 JD 原文及元数据，字段包括：`id`（自增主键）、`company`（公司名）、`role`（职位名）、`sourceType`（来源类型：paste/ocr/url）、`sourceUrl`（可选来源链接）、`body`（JD 纯文本正文）、`keywords`（关键词数组）、`reportId`（可选关联报告 ID）、`createdAt`（创建时间）。

#### Scenario: 创建 JD 记录

- **WHEN** 用户通过粘贴、OCR 识别或手动输入提交一条 JD
- **THEN** 系统将 JD 数据写入 `jds` 表
- **AND** `createdAt` 自动设为当前时间
- **AND** 返回新记录的 `id`

#### Scenario: 查询所有 JD

- **WHEN** 系统查询所有 JD 记录
- **THEN** 返回按 `createdAt` 降序排列的 JD 列表

#### Scenario: 更新 JD 记录

- **WHEN** 用户编辑某条 JD 的公司名、职位名或正文
- **THEN** 系统更新 `jds` 表中对应记录
- **AND** 不改变 `createdAt` 时间戳

#### Scenario: 删除 JD 记录

- **WHEN** 用户删除某条 JD
- **THEN** 系统从 `jds` 表中移除该记录
- **AND** 关联的报告（`reports` 表）不受影响

### Requirement: JD 与 Report 关联

`jds.reportId` SHALL 为可选外键，指向 `reports.id`。当用户从评估报告保存 JD 到库时建立关联。一个 JD 可被多次评估，`reportId` 保留最近一次关联。

#### Scenario: 从评估报告保存 JD

- **WHEN** 用户在评估报告页点击"保存到 JD 库"
- **AND** 该 JD 尚未在库中
- **THEN** 创建新 JD 记录，`reportId` 设为当前报告的 `id`
- **AND** 提示"已保存到 JD 库"

#### Scenario: JD 已存在时更新关联

- **WHEN** 用户在评估报告页点击"保存到 JD 库"
- **AND** 该 JD 正文已在库中存在（body 前200字匹配）
- **THEN** 更新已有 JD 记录的 `reportId` 为当前报告的 `id`
- **AND** 提示"已更新 JD 库关联"

### Requirement: Dexie.js Schema Migration

系统 SHALL 通过 Dexie.js v2 schema migration 新增 `jds` 表，不影响现有 v1 表数据。

#### Scenario: 新用户首次创建

- **WHEN** 新用户首次访问应用
- **THEN** IndexedDB 创建包含 `jds` 表在内的完整 schema
- **AND** 所有表可正常读写

#### Scenario: 已有用户升级

- **WHEN** 已有 v1 schema 用户访问升级后的应用
- **THEN** Dexie.js 自动执行 migration，新增 `jds` 表
- **AND** 原有 `applications`、`reports` 等表数据不丢失
