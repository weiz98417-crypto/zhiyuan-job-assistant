## ADDED Requirements

### Requirement: CLI 脚本写 SQLite

scan.mjs 等 CLI 脚本 SHALL 直接写 SQLite 而非 Markdown/TSV 文件。

#### Scenario: 扫描结果写入

- **WHEN** scan.mjs 扫描到新岗位
- **THEN** 结果 SHALL 写入 SQLite applications 表
