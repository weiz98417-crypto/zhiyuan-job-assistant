## Why

当前 CLI（`.mjs` 脚本 + modes 体系）和前端（Next.js + Agent Chat）共享 modes 文件但数据层完全割裂。CLI 写 Markdown/TSV，前端写 IndexedDB。迁移到 SQLite 后，CLI 和前端应共享同一数据库，实现真正的"一套数据，两个界面"。

## What Changes

- CLI 脚本（scan.mjs、check-liveness.mjs 等）从写 Markdown/TSV 改为写 SQLite
- `modes/zh/jianzhi.md` 和 `modes/zh/auto-pipeline.md` 中的"写文件"指令改为"写 SQLite"（或通过 API 间接写入）
- `merge-tracker.mjs`、`dedup-tracker.mjs`、`verify-pipeline.mjs`、`normalize-statuses.mjs` 废弃——SQLite 自带去重和校验
- Go Dashboard 从读 Markdown 改为读 SQLite
- DATA_CONTRACT.md 更新：User Layer 不再包含 Markdown 文件，数据归 SQLite

## Capabilities

### New Capabilities

- `cli-sqlite-write`: CLI 脚本直接写 SQLite（通过 dashboard/db.ts）
- `shared-data-layer`: 前端和 CLI 共享同一 SQLite 数据库，一个入口，两个界面

### Modified Capabilities

- 所有 modes 文件中的"写文件"指令改为"写 SQLite 或调 API"

## Impact

- 改造：`scan.mjs`、`check-liveness.mjs`、`liveness-core.mjs`、`generate-pdf.mjs`、`analyze-patterns.mjs`、`followup-cadence.mjs`、`cv-sync-check.mjs`、Go Dashboard
- 废弃：`merge-tracker.mjs`、`dedup-tracker.mjs`、`verify-pipeline.mjs`、`normalize-statuses.mjs`
- 保留：`modes/zh/*.md`（Skill 文件）、PDF 模板、字体
- 依赖：backend-sqlite-foundation（Change 1）
