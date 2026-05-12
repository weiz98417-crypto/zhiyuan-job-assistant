## 1. 数据层 — SQLite session_memory 表

- [x] 1.1 新建 SQLite 表 `session_memory(id, session_id, summary_type, content, created_at)`
- [x] 1.2 在 `scripts/db-write.mjs` 中新增 upsert 逻辑或新建独立迁移脚本

## 2. Working Memory

- [x] 2.1 新建 `frontend/src/lib/agent/memory/working.ts`
- [x] 2.2 实现 `buildWorkingContext(messages, keepLast=10)` → 返回最近 N 轮消息

## 3. Episodic Memory

- [x] 3.1 新建 `frontend/src/lib/agent/memory/episodic.ts`
- [x] 3.2 实现 `shouldSummarize(messages)` → 用户消息 > 15 返回 true
- [x] 3.3 实现 `generateSummary(messages)` → 调 DeepSeek 生成 ≤200 字摘要
- [x] 3.4 实现 `saveSummary(sessionId, summary)` → 写入 SQLite

## 4. Semantic Memory

- [x] 4.1 新建 `frontend/src/lib/agent/memory/semantic.ts`
- [x] 4.2 实现 `extractFacts(messages)` → 调 DeepSeek + `response_format: json_object` → 结构化提取
- [x] 4.3 实现 `loadSemanticContext(sessionId)` → 从 SQLite 加载历史语义记录

## 5. MemoryCoordinator

- [x] 5.1 新建 `frontend/src/lib/agent/memory/coordinator.ts`
- [x] 5.2 实现 `buildContext(sessionId, messages)` → 协调三层记忆
- [x] 5.3 摘要触发逻辑：检查消息数 → 生成摘要 → 异步写入 SQLite

## 6. Orchestrator 集成

- [x] 6.1 修改 `frontend/src/lib/agent/orchestrator/index.ts`
- [x] 6.2 替换 `getSessionContext(ctx.messages)` 为 `coordinator.buildContext(sessionId, messages)`
- [x] 6.3 将 `summaryInjection` + `semanticInjection` 追加到 system prompt

## 7. 验证

- [x] 7.1 30 轮对话后，前 20 轮被摘要替换，Agent 仍能准确回答关于早期讨论的问题
- [x] 7.2 新会话开始，Agent 自动提及上一会话中用户表达的偏好
- [x] 7.3 摘要 token 消耗 < 原截断方案（验证摘要比原始消息短）
- [x] 7.4 摘要不阻塞用户回复（异步执行）
