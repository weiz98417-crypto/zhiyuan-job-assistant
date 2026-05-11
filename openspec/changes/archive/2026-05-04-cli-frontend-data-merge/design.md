## Context

CLI（`.mjs` 脚本）写 Markdown/TSV 文件，前端写 IndexedDB。迁移到 SQLite 后两者共享同一数据库。

## Goals / Non-Goals

**Goals:** CLI 脚本直接读写 SQLite。废弃所有 Markdown/TSV 写入和合并脚本。
**Non-Goals:** 不改 modes 文件的 prompt 内容（评估逻辑不变），仅改"写文件"指令。

## Decisions

### Decision 1: CLI 直接调 db.ts

`dashboard/db.ts` 导出同步 SQLite 接口，CLI 脚本 `require("../dashboard/db")` 直接调用。不需要通过 HTTP API——CLI 和 Next.js 同进程时共享 DB。

### Decision 2: 废弃脚本

merge/dedup/verify/normalize 全部废弃。SQLite 自带 UNIQUE 约束去重，SELECT 校验替代脚本。
