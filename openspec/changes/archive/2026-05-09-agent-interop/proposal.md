## Why

筝筝纸鸢有两套 Agent 系统共享 SQLite 数据但不共享上下文。Claude Agent 通过 `db-write.mjs` 写入评估结果，Next.js Agent 通过 `orchestrator` 读取 IndexedDB，两套系统不知道彼此在做什么。

用户在 `/agent` 页面问"我上次评估的那个岗位怎么样"，Next.js Agent 不知道"上次"是哪个——Claude Agent 尽管 30 秒前刚写入 SQLite。

现有 `AgentPromptContext` 已注入 CareerDNA、SessionContext、AgentKnowledge 三种上下文。只缺一种：**Claude Agent 的最近活动**。

## What Changes

- `AgentPromptContext` 新增 `claudeAgentActivity: string` 字段
- `shared-memory.ts` 新增 `getClaudeAgentActivity()` 函数——查询 SQLite 最近 5 条评估和管道状态
- `orchestrator/index.ts` 调用新函数并注入到 context
- 所有 Next.js Agent 的 `buildSystemPrompt` 自动获得此上下文

## Capabilities

### New Capabilities
- `claude-agent-recent-activity`: Next.js Agent 获取 Claude Agent 最近评估记录和管道状态

### Modified Capabilities
<!-- 无现有 spec -->

## Impact

- `frontend/src/lib/agent/registry/types.ts`: +1 字段
- `frontend/src/lib/agent/shared-memory.ts`: +1 函数 (~30 行)
- `frontend/src/lib/agent/orchestrator/index.ts`: +1 行调用
- 零架构改动，零新依赖，纯加一个 SQLite 查询
