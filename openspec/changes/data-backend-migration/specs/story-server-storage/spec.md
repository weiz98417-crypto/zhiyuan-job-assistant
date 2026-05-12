## ADDED Requirements

### Requirement: STAR stories SHALL be stored server-side via API

面试 STAR 故事库 SHALL 通过 API 读写 SQLite。

#### Scenario: 保存故事

- **WHEN** 用户在面试准备页添加/编辑故事
- **THEN** `POST/PUT /api/stories` 写入 SQLite

#### Scenario: 加载故事

- **WHEN** Agent 准备面试方案
- **THEN** `GET /api/stories` 返回所有故事供匹配
