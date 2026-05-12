## Why

现有面试功能只能出题+评分，没有多轮对话能力。面试模拟应该是连续对话：自我介绍 → 技术面 → 行为面 → 反问 → 总结。需要会话状态机和自由追问能力。

## What Changes

- 新建 `interview/engine.ts`：面试会话状态机，管理阶段流转和追问逻辑
- 新建 `/api/agent/coach/session`：面试会话 CRUD 端点
- 修改 `generate-questions` 和 `score-answer` 路由：支持追问模式和结构化输出
- `prepare-interview-full` 工具加面试启动入口
- AgentChat 组件加面试模式 UI

## Capabilities

- `interview-session-engine`: 面试状态机——intro → tech(3题) → behavioral(2题) → reverse → summary
- `interview-followup`: 追问模式——每题根据用户回答深度可触发 1-2 次追问

## Impact

- **新建**: `frontend/src/lib/agent/interview/engine.ts`
- **新建**: `frontend/src/app/api/agent/coach/session/route.ts`
- **修改**: `frontend/src/app/api/agent/coach/generate-questions/route.ts`
- **修改**: `frontend/src/app/api/agent/coach/score-answer/route.ts`
- **修改**: `frontend/src/lib/agent/tools/action/prepare-interview-full.ts`
