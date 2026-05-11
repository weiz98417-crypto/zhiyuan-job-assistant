## ADDED Requirements

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
