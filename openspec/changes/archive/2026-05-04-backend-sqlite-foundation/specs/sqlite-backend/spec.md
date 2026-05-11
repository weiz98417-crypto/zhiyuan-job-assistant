## ADDED Requirements

### Requirement: SQLite 后端数据库

系统 SHALL 使用 SQLite 作为后端唯一数据库，存储 applications/reports/jds/profiles。

#### Scenario: 数据库初始化

- **WHEN** 系统首次启动且 data/career-ops.db 不存在
- **THEN** 系统 SHALL 自动建库建表
- **AND** 从现有 Markdown/TSV 文件迁移历史数据

### Requirement: Node.js 访问层

dashboard/db.ts SHALL 导出同步 SQLite 接口，供 API routes 和 CLI 脚本调用。
