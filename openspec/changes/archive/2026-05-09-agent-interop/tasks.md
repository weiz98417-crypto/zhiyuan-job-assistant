## 1. 类型与数据层

- [x] 1.1 `types.ts`: AgentPromptContext 新增 `claudeAgentActivity?: string` 字段
- [x] 1.2 `shared-memory.ts`: `getClaudeAgentActivity()` 调用 `/api/agent/claude-activity`
- [x] 1.3 管道状态查询：API route 统计各状态数量，汇总 pending/processed

## 2. 编排器集成

- [x] 2.1 `orchestrator/index.ts`: 调用 `getClaudeAgentActivity()` 并注入到 `promptCtx`

## 3. 验证

- [x] 3.1 `npm run build` ✓ Compiled successfully
- [x] 3.2 模拟场景：API route 查询 SQLite → orchestrator 注入 → Agent 可获得最近活动
