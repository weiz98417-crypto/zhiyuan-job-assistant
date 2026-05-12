## ADDED Requirements

### Requirement: Offer data SHALL be stored server-side via API

Offer 对比数据 SHALL 通过 API 读写 SQLite。

#### Scenario: 保存 Offer

- **WHEN** 用户在对比页添加 Offer
- **THEN** `POST /api/offers` 写入 SQLite `offers` 表

#### Scenario: 加载 Offer 列表

- **WHEN** 用户打开 Offer 对比页
- **THEN** `GET /api/offers` 返回所有 Offer
