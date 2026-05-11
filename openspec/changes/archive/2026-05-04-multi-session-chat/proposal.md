## Why

当前 Agent 聊天只有一个会话窗口，"重新开始"按钮会丢弃所有历史对话。用户无法保留多个独立的对话上下文（例如：一个会话分析 JD、一个会话准备面试、一个会话闲聊职业规划）。参照 WorkBuddy/Claude Desktop 的多会话模式，需要支持多会话管理，每个会话消息和记忆独立隔离，旧内容手动删除。

## What Changes

- 新增 `ChatSession` 数据模型：id、自动生成标题、消息列表、记忆摘要、时间戳、置顶标记
- DexieDB v6 schema 新增 `chatSessions` 表
- 新建 `sessions.ts` — 会话 CRUD 操作（create/list/delete/update/pin/search）
- **BREAKING**: 移除"重新开始"按钮，替换为"新建对话"（+ 按钮）
- 新建 `SessionList.tsx` — 左侧会话列表侧边栏
- `page.tsx` 增加会话管理状态：当前 sessionId、会话切换、记忆隔离
- 自动标题生成：从首条用户消息或 assistant 首句回复提取会话标题
- 软删除 + 撤回：删除会话后 5 秒 toast 允许撤回
- 会话搜索：全文本搜索会话标题和消息内容
- 记忆隔离：切换会话时清空 agent 上下文，每会话独立 `memoryDigest`

## Capabilities

### New Capabilities
- `chat-session-model`: 会话数据模型与 DexieDB 持久化 — ChatSession 表、CRUD 操作、自动标题生成
- `session-management-ui`: 会话管理界面 — SessionList 侧边栏、新建/切换/删除/置顶/搜索
- `session-memory-isolation`: 会话记忆隔离 — 每会话独立上下文，切换时注入 `memoryDigest` 到 system prompt

### Modified Capabilities
- `agent-loop-frontend`: page.tsx 从单会话状态改为多会话管理；AgentChat 移除"重新开始"按钮

## Impact

- `src/types/index.ts` — 新增 `ChatSession` 类型
- `src/lib/db.ts` — DexieDB v6 schema
- `src/lib/agent/sessions.ts` — **新建** 会话 CRUD
- `src/components/agent/SessionList.tsx` — **新建** 会话侧边栏
- `src/components/agent/AgentChat.tsx` — 移除重置按钮，接收 sessionId
- `src/app/agent/page.tsx` — 会话管理逻辑
