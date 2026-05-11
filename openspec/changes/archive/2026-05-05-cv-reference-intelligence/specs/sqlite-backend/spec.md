## ADDED Requirements

### Requirement: Reference Resumes 数据表

SQLite schema SHALL 新增 `reference_resumes` 表，用于存储用户导入的优秀参考简历。

#### Scenario: 建表

- **WHEN** 系统启动并执行 schema migration
- **THEN** `reference_resumes` 表 SHALL 被创建，包含字段：id（自增主键）、name（TEXT NOT NULL，用户命名）、source（TEXT NOT NULL，值为 "upload" 或 "paste"）、sections_json（TEXT NOT NULL DEFAULT '[]'，CVSection[] JSON）、raw_text（TEXT NOT NULL DEFAULT ''，全文拼接供 FTS5 索引）、tags（TEXT NOT NULL DEFAULT '[]'，JSON 标签数组）、notes（TEXT NOT NULL DEFAULT ''）、created_at（TEXT NOT NULL DEFAULT datetime('now')）

#### Scenario: FTS5 全文索引

- **WHEN** reference_resumes 表被创建
- **THEN** 系统 SHALL 创建 FTS5 虚拟表 `reference_resumes_fts`，对 `raw_text` 列建立全文索引
- **AND** 使用 `unicode61` tokenizer
- **AND** 通过触发器保持与 reference_resumes 表的数据同步（INSERT/UPDATE/DELETE）

### Requirement: Optimization Preferences 数据表

SQLite schema SHALL 新增 `optimization_preferences` 表，用于记录用户的优化 accept/reject 偏好。

#### Scenario: 建表

- **WHEN** 系统启动并执行 schema migration
- **THEN** `optimization_preferences` 表 SHALL 被创建，包含字段：id（自增主键）、section_id（TEXT NOT NULL）、variant_type（TEXT NOT NULL，"激进"/"保守"/"定向"）、action（TEXT NOT NULL，"accept"/"reject"）、original_text（TEXT）、optimized_text（TEXT）、created_at（TEXT NOT NULL DEFAULT datetime('now')）

#### Scenario: 查询偏好历史

- **WHEN** 系统需要构造优化 prompt
- **THEN** 系统 SHALL 查询最近 10 条偏好记录（按 created_at 降序）
- **AND** 格式化为用户偏好摘要拼入 prompt
