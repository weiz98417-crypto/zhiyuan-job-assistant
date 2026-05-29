## ADDED Requirements

### Requirement: SQLite 后端数据库

系统 SHALL 使用 SQLite 作为后端唯一数据库，存储 applications/reports/jds/profiles。

#### Scenario: 数据库初始化

- **WHEN** 系统首次启动且 data/career-ops.db 不存在
- **THEN** 系统 SHALL 自动建库建表
- **AND** 从现有 Markdown/TSV 文件迁移历史数据

### Requirement: Node.js 访问层

dashboard/db.ts SHALL 导出同步 SQLite 接口，供 API routes 和 CLI 脚本调用。

### Requirement: Profile Signals 数据表

SQLite schema SHALL 新增 `profile_signals` 表，用于存储从对话、评估、面试中提取的画像信号。

#### Scenario: 建表

- **WHEN** 系统启动并执行 schema 迁移
- **THEN** `profile_signals` 表 SHALL 被创建，包含字段：id（自增主键）、source（信号来源）、signal_type（信号类型）、content_json（信号内容 JSON）、session_id（关联会话 ID）、created_at（创建时间）

#### Scenario: 信号写入和查询

- **WHEN** dingwei 对话或其他来源提取到画像信号
- **THEN** 系统 SHALL 支持通过 API 写入和按 signal_type 查询 signal
- **AND** 查询 SHALL 支持时间范围过滤（默认最近 30 天）

### Requirement: Profiles 表 goals 分离

`profiles` 表 SHALL 扩展 `goals_json` 字段，将用户目标与通用画像数据分离存储。

#### Scenario: goals 独立列

- **WHEN** profiles 表被创建或迁移
- **THEN** 表 SHALL 包含 `goals_json TEXT NOT NULL DEFAULT '{}'` 列
- **AND** `data_json` 列 SHALL 不再包含 goals 数据

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

### Requirement: News Cache 数据表

SQLite schema SHALL 新增 `news_cache` 表，用于缓存行业快讯和企业快讯。

#### Scenario: 建表

- **WHEN** 系统启动并执行 schema migration
- **THEN** `news_cache` 表 SHALL 被创建，包含字段：id（自增主键）、source（TEXT NOT NULL，'industry' 或 'company'）、source_name（TEXT，来源标识如 'anthropic'/'qbitai'/'bytedance'）、title（TEXT NOT NULL）、summary（TEXT，AI 摘要）、url（TEXT）、published_at（TEXT）、cached_at（TEXT NOT NULL DEFAULT datetime('now')）
- **AND** 对 `source` 和 `cached_at` 列建立索引

#### Scenario: 缓存写入与查询

- **WHEN** 快讯 API 拉取到新内容
- **THEN** 系统 SHALL 先删除同 `source` + `source_name` 的旧缓存
- **AND** 再插入新快讯记录
- **AND** 查询时按 `source` 过滤，按 `cached_at` 降序，限制条数

#### Scenario: 缓存过期清理

- **WHEN** 快讯 API 请求新数据
- **THEN** 系统 SHALL 先清理超过 24 小时的旧缓存
- **AND** 再检查是否有有效缓存（6 小时内）
