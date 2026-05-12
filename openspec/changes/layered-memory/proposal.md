## Why

当前记忆策略是简单截断：`client-runner.ts` 的 `MAX_CONTEXT_TOKENS = 24000` / `MAX_MESSAGES = 30`，超出就 `slice(-15)`。这导致 30 轮对话后 Agent 忘记最初讨论的所有内容。跨会话更无记忆——每次新对话从零开始。分层记忆（工作→情景→语义）让 Agent 在长对话和跨会话中保持上下文连贯。

## What Changes

- 新建三层记忆系统：`working.ts`（最近 10 轮工作记忆）、`episodic.ts`（超 15 轮触发 LLM 摘要）、`semantic.ts`（结构化提取技能/偏好/底线，跨会话持久化）
- 新建 `coordinator.ts`：记忆协调器，在 orchestrator 中替代当前的 `memoryDigest` 和简单截断
- 修改 `orchestrator/index.ts`：集成 MemoryCoordinator，替代当前的 `getSessionContext()` 截断
- 新建 SQLite 表 `session_memory`：存储情景摘要和语义提取结果

## Capabilities

### New Capabilities

- `layered-memory-system`: 三层记忆——工作记忆（10 轮窗口）、情景记忆（超 15 轮触发摘要）、语义记忆（跨会话结构化事实提取）
- `memory-coordinator`: 记忆协调——在 orchestrator 上下文中协调三层记忆的读取和更新

### Modified Capabilities

- `agent-memory`: 当前 Dexie 单层存储 → 新增跨会话语义提取和摘要能力。原 `memoryDigest` 机制被 MemoryCoordinator 替代
- `agent-shared-memory`: Career DNA + session context 构建逻辑 → 由 MemoryCoordinator 统一管理

## Impact

- **新建**: `frontend/src/lib/agent/memory/working.ts`
- **新建**: `frontend/src/lib/agent/memory/episodic.ts`
- **新建**: `frontend/src/lib/agent/memory/semantic.ts`
- **新建**: `frontend/src/lib/agent/memory/coordinator.ts`
- **修改**: `frontend/src/lib/agent/orchestrator/index.ts`（集成 MemoryCoordinator）
- **依赖**: `server-side-agent-loop`（change 4），记忆系统在服务端运行
