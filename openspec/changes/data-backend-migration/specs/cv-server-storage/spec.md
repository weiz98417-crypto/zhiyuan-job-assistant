## ADDED Requirements

### Requirement: CV data SHALL be stored server-side via API

简历编辑器保存的 CV 数据 SHALL 写入 SQLite，不再仅存 localStorage。

#### Scenario: 保存 CV

- **WHEN** 用户在 CV 编辑器点击保存
- **THEN** `PUT /api/cv/data` 将完整 CV JSON 写入 SQLite `cv_data` 表
- **AND** 同时更新 localStorage 缓存

#### Scenario: 加载 CV

- **WHEN** 用户打开 CV 编辑页
- **THEN** `GET /api/cv/data` 从 SQLite 读取最新版本
- **AND** 若 API 不可用，降级读 localStorage

#### Scenario: 跨设备

- **WHEN** 用户在新浏览器打开 CV 页面
- **THEN** CV 数据从服务器加载（非空模板）
