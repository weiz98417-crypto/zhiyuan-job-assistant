## ADDED Requirements

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
