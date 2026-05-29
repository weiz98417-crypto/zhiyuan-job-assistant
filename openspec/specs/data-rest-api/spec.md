## ADDED Requirements

### Requirement: /api/data REST 端点

系统 SHALL 提供 `/api/data/applications`、`/api/data/reports`、`/api/data/jds`、`/api/data/profile` 四个 REST 端点。

#### Scenario: GET applications

- **WHEN** 前端请求 GET /api/data/applications
- **THEN** 系统 SHALL 从 SQLite 查询并返回投递记录列表
