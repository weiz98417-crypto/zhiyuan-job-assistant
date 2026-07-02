# 08 -- Agent 互通机制

所属阶段：Phase 2-3 持续演进  
当前状态：Agent 互通基于 repository 事实源、PostgreSQL run ledger、三层/向量记忆和 API 边界；SQLite 仅保留 fallback/archive 角色。

---

## 1. 问题

筝筝纸鸢同时存在几类智能入口：

| 入口 | 做什么 | 当前事实源 |
|------|--------|------------|
| Agent Chat | 对话、图片识别、JD/Offer/简历/面试/画像任务 | repository；LAN 为 Postgres |
| Claude/Codex 开发侧 | 开发、排查、文档和脚本治理 | 代码、脚本、数据库检查 |
| Mode 文件系统 | JD/Offer/风险/PDF 等领域指令 | `modes/`、`modes/zh/` |
| 管理后台 | 用户、run、review、memory 治理 | Postgres |

早期问题是“Web Agent 不知道 CLI/Claude Agent 刚刚写了什么”。现在更大的问题是：不同 Agent 不仅要共享结果，还要共享任务状态、写入证据、失败复盘和长期记忆，避免“聊天里说成功，但数据库没写对”。

---

## 2. 当前互通层级

```text
Layer 5: Admin governance
  -> /admin/agent-runs / /admin/agent-reviews / /admin/memory
  -> 运行台账、复盘、eval 候选、记忆治理

Layer 4: Agent Run ledger
  -> agent_runs / agent_run_steps
  -> 每次高风险任务的 phase、tool、contract、verifier、error

Layer 3: Long-term memory
  -> memory_items / memory_chunks / reference_resume_chunks
  -> pgvector 检索、优秀简历、候选记忆、反馈晋升

Layer 2: Repository-backed business data
  -> applications / reports / jds / cv_data / offers / profile_signals
  -> getDataRepositories() 屏蔽 Postgres/SQLite 差异

Layer 1: Prompt context bridge
  -> getClaudeAgentActivity()
  -> Career DNA / CV summary / recent JD / memory digest
```

---

## 3. Repository 事实源

当前所有服务端路由和工具都应尽量通过：

```typescript
const repos = getDataRepositories();
```

读取和写入业务数据。这样 Web Agent、后台管理页、评估页、追踪页和 Analytics 看到的是同一套事实。

典型共享数据：

- 最近投递与评估：`applications`
- 完整 A-G 报告：`reports`
- 最近 JD 上下文：`jds`
- 当前简历：`cv_data`
- 求职画像：`profiles` / `profile_signals`
- Offer：`offers` / `offer_reports`
- 会话：`sessions`

当前局域网 `DB_DRIVER=postgres`，这些数据由 PostgreSQL 承载。SQLite 仍可在本地 fallback 或归档读取下使用，但不应作为当前 LAN 的主互通桥。

---

## 4. Prompt Context Bridge

`getClaudeAgentActivity()` 仍然存在，但它现在通过 repository 读取数据，而不是假设底层一定是 SQLite。

```text
applications/reports
  -> /api/agent/claude-activity
  -> getClaudeAgentActivity()
  -> orchestrator promptCtx
  -> 子 Agent system prompt
```

注入内容示例：

```text
[最近求职活动]
最近评估:
• 深圳华启数智科技有限公司 | 数据产品经理 | 1.9/5 | 不建议投递
管道状态: 已评估 10 条 | 面试中 2 条 | Offer 1 条
```

这个桥只负责“让当前对话知道最近活动”。它不是写入校验，也不是任务成功判断。

---

## 5. Agent Run Ledger

高风险任务启动后，PostgreSQL 会记录 run 和 step。

```text
用户请求
  -> task-routing 生成 contract
  -> createAgentRun()
  -> 每个 phase/tool 写 agent_run_steps
  -> 工具结果记录 verifier/read-back 摘要
  -> terminal status
  -> trigger run-review
```

run 状态：

```text
planned -> running -> waiting_user -> verifying -> repairing
terminal: succeeded / failed / recovered / needs_engineering / rolled_back / cancelled
```

可视化入口：

- Agent Chat 顶部活动 run 条。
- `/admin/agent-runs` 管理员调试页。

这解决的是“Agent 说自己在干活，但到底调用了什么、有没有读回证据、为什么失败”不可见的问题。

---

## 6. Run Review 与 Eval 候选

终态 run 会触发 `run-review.ts` 做确定性复盘。

复盘关注：

- 上传图片后是否真的调用了 `image-intake`。
- JD/Offer 评估是否完成读回校验。
- 自我定位、面试等 guided task 是否漂移。
- 工具是否违反 task contract。
- 简历写入是否污染正文。
- 画像信号是否是低质碎片。

复盘输出：

- `agent_run_reviews`
- `agent_eval_candidates`

管理员在 `/admin/agent-reviews` 可以接受、拒绝或提升候选。接受/提升不会自动改代码，它只是把失败转成后续可落地的回归测试草案。

---

## 7. 记忆互通

当前记忆分两类：

### 7.1 会话上下文

```text
sessions.messages_json
sessions.memory_digest
session_memory
working / episodic / semantic context
```

用途：

- 保持当前对话上下文。
- 长会话触发 `compressing_context` 时生成摘要。
- 让 Agent 在后续回复中知道用户刚刚聊过什么。

### 7.2 长期向量记忆

```text
reference_resumes
reference_resume_chunks
memory_items
memory_evidence
memory_chunks
```

用途：

- 优秀简历按岗位方向沉淀为可检索参考。
- 用户偏好、可复用模式、反馈可以进入候选记忆。
- 管理员治理团队共享材料。

长期记忆是增强层，不代表系统会自动修改代码或自动修复 bug。

---

## 8. API 边界

关键互通 API：

| API | 用途 |
|-----|------|
| `/api/agent/run` | 服务端 Agent Loop |
| `/api/agent/image-intake` | 图片识别与文档类型判断 |
| `/api/agent/claude-activity` | 最近业务活动摘要 |
| `/api/agent/runs` | 当前用户活动 run |
| `/api/agent/session-review` | 会话复盘 |
| `/api/agent/persist-eval` | JD 评估持久化与读回 |
| `/api/agent/memory-writeback` | 长期记忆候选写入 |
| `/api/agent/memory-index` | 向量索引 |
| `/api/data/*` | 应用、报告、JD、画像等业务数据 |
| `/api/cv/edit-proposals/*` | 简历修改 proposal 生命周期 |
| `/api/admin/agent-runs` | 管理员运行台账 |
| `/api/admin/agent-reviews` | 管理员复盘与 eval 候选 |
| `/api/admin/memory` | 管理员记忆治理 |

---

## 9. 当前边界

- 互通不等于无边界共享。用户私有简历、私有记忆和团队共享材料需要权限与治理。
- Eval 候选不会自动变成代码修复。
- SQLite 不是当前 LAN 的主互通桥，但仍不能删除。
- Prompt context bridge 只提供上下文，不证明任务完成。
- 真正的任务完成以 task contract 和 read-back verification 为准。

---

## 10. 相关文件

- `src/lib/data-repositories.ts`
- `src/lib/agent/orchestrator/index.ts`
- `src/lib/agent/context.ts`
- `src/lib/agent/task-routing.ts`
- `src/lib/agent/task-contract.ts`
- `src/lib/agent/tool-governance.ts`
- `src/lib/agent/run-ledger.ts`
- `src/lib/agent/run-review.ts`
- `src/lib/agent/memory-context.ts`
- `src/lib/memory/postgres-memory.ts`
- `src/app/api/agent/claude-activity/route.ts`
- `src/app/api/agent/runs/route.ts`
- `src/app/admin/agent-runs/page.tsx`
- `src/app/admin/agent-reviews/page.tsx`
