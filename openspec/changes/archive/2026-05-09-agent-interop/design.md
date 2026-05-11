## Context

Next.js Agent 的 orchestrator 在每次对话时构建 `AgentPromptContext`，包含三种上下文：

1. **CareerDNA** — 用户画像（技能、目标、薪资、底线）
2. **SessionContext** — 当前会话最近消息摘要
3. **AgentKnowledge** — Agent 特定的知识注入（薪资基准、面试风格等）

缺失：**Claude Agent 最近在做什么。** Claude 通过 `db-write.mjs` 写入 SQLite 的数据对 Next.js Agent 不可见。

## Goals / Non-Goals

**Goals:**
- 注入 Claude Agent 最近 5 条评估记录到 Next.js Agent context
- 注入管道状态摘要（待处理/已处理数量）
- 零架构改动

**Non-Goals:**
- 不改变 Claude Agent 的行为
- 不改变 Next.js Agent 的 agent 定义
- 不新增 API 端点

## Decisions

### Decision: 注入到 AgentPromptContext 而非单独 API

`AgentPromptContext` 已有三个字符串字段，加第四个。每个 agent 的 `buildSystemPrompt` 自行决定是否使用。

格式设计——紧凑、信息密度高：

```
[Claude Agent 最近活动]
最近评估:
• 字节跳动 | AI产品经理 | 4.2/5 🔴高风险 | 2026-05-09
• 美团 | AI运营 | 3.8/5 🟢低风险 | 2026-05-08
管道: 3条待处理 | 2条已处理 | 最近更新时间 2026-05-09
```

### Decision: 查 SQLite 而非 IndexedDB

`shared-memory.ts` 中 CareerDNA 查 IndexedDB，但 Claude 活动数据在 SQLite。直接查 SQLite (`better-sqlite3`) 不需要新 API。

查询逻辑：
```sql
SELECT company, role, score, status, pdf_generated, report_path, date, notes
FROM applications
ORDER BY num DESC LIMIT 5
```

管道状态：
```sql
SELECT status, COUNT(*) FROM applications GROUP BY status
```

汇总 pending URLs from `data/pipeline.md`（或直接查 SQLite 的评估状态分布）。

## Risks / Trade-offs

- **[R] `better-sqlite3` 在浏览器端不可用** → `shared-memory.ts` 当前在服务端（API route）和客户端都可能被调用。
  → **缓解:** `getClaudeAgentActivity()` 只在服务端调用。在 orchestrator 中添加 try/catch，静默失败（返回空字符串）而非崩溃。
