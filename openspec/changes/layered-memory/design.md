## Context

`client-runner.ts` 的 `truncateContext()` 和 `orchestrator` 的 `getSessionContext()` 都在做同一件事：消息太多就截断。这丢失了早期对话的上下文。`agent-memory` 和 `agent-shared-memory` 已有部分记忆基础设施（CareerDNA、sessionContext、claudeAgentActivity），但没有结构化摘要和跨会话持久化。

## Goals / Non-Goals

**Goals:**
- 超过 15 轮对话时自动触发 LLM 摘要，不丢失早期上下文
- 从对话中结构化提取用户偏好（技能、薪资、行业等）并跨会话持久化
- 工作记忆窗口保持 10 轮，超出部分由摘要覆盖
- 摘要和提取结果存储到 SQLite `session_memory` 表

**Non-Goals:**
- 不实现向量数据库或 embedding 检索（本期不使用 RAG）
- 不修改 Dexie/IndexedDB 存储层（已有数据保持不动）
- 不实现实时记忆更新（摘要触发条件为 >15 轮用户消息）

## Decisions

### D1: 三层架构 → Working / Episodic / Semantic

| 层 | 生命周期 | 存储 | 触发条件 |
|----|---------|------|---------|
| Working | 当前对话 | 上下文 | 始终在上下文中（最近 10 轮） |
| Episodic | 当前对话 | SQLite `session_memory` | >15 轮用户消息时摘要前 N 轮 |
| Semantic | 跨会话 | SQLite `session_memory` | 每次对话结束或新会话开始时提取 |

**Why:** 三层分离让每层有独立的生命周期和存储策略。Working 层零延迟（直接上下文），Episodic 层按需计算（LLM 摘要），Semantic 层增量累积（跨会话永不丢失）。

### D2: 摘要策略 → 滑动窗口 LLM 摘要

当对话超过 15 轮用户消息时，取第 1-5 轮的用户+助手消息，调 DeepSeek 生成 200 字摘要。摘要以 `[摘要] 用户讨论了X，关注Y，决定了Z` 格式注入 system prompt。后续每新增 5 轮，再次摘要上一批过期消息。

**Why:** 滑动窗口防止单次摘要上下文过大。每次只摘要 5 轮，token 消耗可控（~500 tokens input → ~200 tokens output）。

### D3: 语义提取 → 对话结束时调 LLM 做结构化提取

在新会话开始或旧会话关闭时，取完整对话，调 DeepSeek 用 `response_format: { type: "json_object" }` 强转 JSON 输出，提取结构化字段：
```json
{ "skills": [...], "salary": {...}, "industry": [...], "dealbreakers": [...], "preferences": {...} }
```
写入 SQLite `session_memory`（`summary_type = 'semantic'`）。

**Why:** 复用 DeepSeek V4 的 Structured Outputs 能力，无需单独训练或调参。提取结果与 `profile_signals` 表（已有 63 条）互补——semantic 是原始提取，signals 是加权聚合。

## Risks / Trade-offs

- **[Risk] LLM 摘要可能遗漏关键信息** → 摘要标注 `[摘要]` 前缀，让后续 LLM 在需要更多细节时知道这是压缩信息。用户也可以说"回顾之前说的XXX"触发 LLM 查原始消息（如果仍在上下文中）
- **[Trade-off] 摘要调用增加延迟** → 摘要异步执行（不阻塞用户回复），在用户发送消息时检查是否需要摘要，如需要则在LLM调用前执行
