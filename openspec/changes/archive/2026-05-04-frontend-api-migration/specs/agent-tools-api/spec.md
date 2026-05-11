## ADDED Requirements

### Requirement: Agent 工具通过 API 访问数据

Agent 的 query 工具 SHALL 通过 REST API 而非 IndexedDB 直接访问数据。

#### Scenario: search_applications 调 API

- **WHEN** Agent 调用 search_applications 工具
- **THEN** 工具 SHALL 通过 fetch("/api/data/applications") 获取数据
