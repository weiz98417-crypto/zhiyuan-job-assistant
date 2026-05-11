## Why

前端有两个独立质量问题：(1) Go TUI 仪表盘的 `UpdateApplicationStatus` 用大小写不敏感的字符串替换来更新 Markdown 表格行中的状态。如果状态词出现在公司名或备注中（如 company="Applied Materials"），会把公司名中的 "Applied" 替换掉。没有文件锁，与 Claude Agent 并发写入会损坏数据。(2) Next.js Web 前端的 `agent/page.tsx` (34,055 行) 和 `analytics/page.tsx` (25,024 行) 是单文件巨型组件，业务逻辑、状态管理、UI 渲染混在一起，不可维护。

## What Changes

- `dashboard/internal/data/career.go:545-583`: `UpdateApplicationStatus` 改为解析 Markdown 表格列，只替换第 6 列（Status 列），或直接走 SQLite API 更新
- `frontend/src/app/agent/`: 拆分为 `_components/` 目录 —— ChatPanel, ToolCallLog, AgentSelector, SessionMemory, useAgentChat hook
- `frontend/src/app/analytics/`: 拆分为 `_components/` 目录 —— ScoreDistribution, FunnelChart, WeeklyActivity, ConversionRate
- 两个前端统一从 SQLite 读取（Go TUI 通过 `server-db.ts` API 或直接 SQLite），不再直接解析 `applications.md`

## Capabilities

### New Capabilities
- `go-tui-safe-status-update`: Go TUI 状态更新走 SQLite 或列级精确替换，消除字符串替换的误伤风险
- `frontend-component-split`: agent + analytics 页面拆分为可维护的组件目录结构

### Modified Capabilities
<!-- 无 -->

## Impact

- `dashboard/internal/data/career.go`: 重写 UpdateApplicationStatus，移除 applications.md 直接写入
- `frontend/src/app/agent/`: 新建 _components/ 目录，拆分巨型组件
- `frontend/src/app/analytics/`: 同上
- `dashboard/internal/data/career.go`: 数据源从 applications.md 切换到 SQLite
