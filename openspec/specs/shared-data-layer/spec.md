## ADDED Requirements

### Requirement: 前端和 CLI 共享 SQLite

前端和 CLI SHALL 共享同一 SQLite 数据库，不再各自维护独立数据层。

#### Scenario: CLI 写入前端可见

- **WHEN** CLI 脚本写入 SQLite
- **THEN** 前端 API 立即能读到最新数据
