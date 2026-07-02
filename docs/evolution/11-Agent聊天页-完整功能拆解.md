# 11 -- Agent 聊天页完整功能拆解

页面：`src/app/agent/page.tsx`  
核心模块：`src/lib/agent/`、`src/app/api/agent/*`  
当前运行态：局域网环境已切到 PostgreSQL/pgvector；SQLite 仍保留为本地 fallback、迁移源和归档读取路径。

---

## 1. 页面定位

Agent 聊天页已经不是一个普通的“把用户消息发给模型”的聊天框。它现在承担四件事：

1. 接收用户文本、图片和会话上下文。
2. 在模型自由发挥前，先做图片识别、任务路由、任务锁和工具治理。
3. 通过 client/server Agent Loop 执行工具，并把 phase、tool、read-back 状态实时渲染出来。
4. 把高风险任务写入 PostgreSQL run ledger，供管理员在运行台和复盘治理页查看。

当前页面必须优先保证“真实完成”而不是“看起来回答了”。JD/Offer 评估、简历修改、优秀简历保存、文件导出等写入类动作，只有通过读回校验后才能显示为成功。

---

## 2. 当前架构

```text
用户输入
  -> AgentChat UI
  -> 图片/文件预处理
  -> /api/agent/image-intake
  -> image-intake-router 判断 JD / Offer / 简历 / 无关图 / 冲突图
  -> guided-session-state 判断是否已有进行中的自我定位/面试/简历保存等任务
  -> task-routing 生成 AgentTaskContract
  -> orchestrator 选择 6 个子 Agent 之一
  -> tool-governance 校验工具是否允许在当前任务里执行
  -> client-runner 或 server-runner 执行 ReAct loop
  -> read-back verification 校验写入/导出结果
  -> PostgreSQL agent_runs / agent_run_steps 记录过程
  -> run-review 复盘终态 run 并生成 eval 候选
```

```text
┌─────────────────────────────────────────────────────────────┐
│ Agent Chat UI                                                │
│ - 会话列表固定在左侧                                         │
│ - 聊天主区域独立滚动                                         │
│ - 图片 + 文本作为同一条用户消息渲染                          │
│ - phase、工具卡、活动 run、上下文压缩状态可见                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 前置路由与治理                                               │
│ image-intake / guided-session-state / task-routing            │
│ task-contract / tool-governance / readback-verification       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ Agent 执行层                                                 │
│ 6 子 Agent：general / evaluate / resume / interview / profile │
│ / offer                                                      │
│ 48 工具：15 query + 26 action + 2 interview + 5 MCP shim      │
│ 双 runner：server-runner 为生产主路径，client-runner 为兼容路径 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 数据与治理层                                                 │
│ repository-backed data layer                                 │
│ 当前 LAN：PostgreSQL + pgvector                              │
│ SQLite：legacy fallback / migration source / archive readonly │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 功能清单

| # | 功能 | 当前实现 | 事实源 |
|---|------|----------|--------|
| 1 | 会话管理 | `/api/sessions` + Dexie 缓存 | repository；当前 LAN 为 Postgres |
| 2 | 历史对话栏 | 独立固定侧栏、置顶、删除、恢复 | sessions |
| 3 | 图片上传 | 文本与图片同条消息渲染，发送前保留原始文件 payload | AgentChat state |
| 4 | 图片识别入口 | `/api/agent/image-intake` + `server-image-variants.ts` | OCR/多模态识别结果 |
| 5 | 图片业务路由 | `image-intake-router.ts` 判断 JD/Offer/简历/冲突/无关图 | `ImageIntakeResult` |
| 6 | 任务锁 | `guided-session-state.ts` 防止自我定位、面试等流程被普通回复带偏 | 当前会话状态 |
| 7 | 意图路由 | `orchestrator/classifyIntent()` + `task-routing.ts` | 用户文本 + 图片路由 |
| 8 | 子 Agent | 6 个子 Agent，按优先级和显式切换匹配 | Agent registry |
| 9 | 工具体系 | `ToolRegistry` 注册 48 个工具 | `src/lib/agent/tools/index.ts` |
| 10 | 工具治理 | `tool-governance.ts` 声明工具副作用、允许任务、读回要求 | governance metadata |
| 11 | 读回校验 | `readback-verification.ts` 阻止写入类工具无证据成功 | verifiedAction / uiPayload |
| 12 | Agent Loop | `server-runner.ts` 生产主路径，`client-runner.ts` 兼容路径 | SSE events |
| 13 | 活动 run 条 | `/api/agent/runs` 展示 running/waiting/verifying 等状态 | Postgres agent_runs |
| 14 | 管理员调试 | `/admin/agent-runs`、`/admin/agent-reviews`、`/admin/memory` | Postgres governance tables |
| 15 | 上下文压缩 | `compressing_context` 状态 + `generateMemoryDigest()` | sessions.memory_digest |
| 16 | 长期记忆 | pgvector 优秀简历、候选记忆、反馈晋升 | memory/reference tables |
| 17 | 信号提取 | profile signals 过滤、读回校验、低质信号拒绝 | profile_signals/profile |
| 18 | 简历修改 | proposal -> confirm -> apply/rollback，禁止直接污染简历正文 | resume_edit_proposals/cv_data |

---

## 4. 图片入口逻辑

图片入口现在遵循“先识别，再路由，再执行”的规则。

| 用户输入 | 系统行为 |
|----------|----------|
| 只上传图片 | 调用 `image-intake` 识别图片类型，再询问用户要评估、保存还是只分析 |
| 文本要求评估 JD + JD 图片 | 提取 JD 文本，进入 `jd_evaluation` 任务，调用 `evaluate_jd_full` |
| 文本要求评估 Offer + Offer 图片 | 提取 Offer 信息，进入 `offer_evaluation` 任务，调用 `evaluate_offer` |
| 文本说 JD 但图片像 Offer | 不执行业务工具，先要求用户确认到底评估哪个对象 |
| 图片是简历 | 识别为 resume；若用户要求保存优秀简历，先确认岗位方向和可见性 |
| 图片无关求职 | 可以描述图片，但不进入 JD/Offer/简历写入流程 |
| OCR 超时、缩略图、置信度低 | 返回 `retry_image`，不把任务标记完成 |

关键文件：

- `src/app/api/agent/image-intake/route.ts`
- `src/lib/server-image-intake.ts`
- `src/lib/server-image-variants.ts`
- `src/lib/agent/image-intake.ts`
- `src/lib/agent/image-intake-router.ts`
- `src/lib/agent/task-routing.ts`

长截图会生成候选版本和切片，避免只把聊天窗口中的缩略图送进识别模型。但如果浏览器实际上传的文件本身就是缩略图，系统只能识别缩略图内容，不能凭空恢复原图。

---

## 5. 任务契约与防跑偏

`AgentTaskContract` 是当前 Agent Chat 的核心安全层。它描述一次任务的类型、目标、允许工具、成功条件和校验器。

典型任务：

| 任务类型 | 关键成功条件 |
|----------|--------------|
| `jd_evaluation` | 已提取 JD 内容、A-G 报告生成、报告/JD 保存、读回校验通过 |
| `offer_evaluation` | 已提取 Offer 内容、评估报告保存、Offer/报告读回校验通过 |
| `resume_edit` | 草稿创建、用户确认、应用后目标 section hash 匹配 |
| `reference_resume_save` | 岗位方向已确认、参考简历保存、向量索引尽力执行、读回通过 |
| `self_positioning` | 保持四阶段引导，不漂移到 JD/Offer/简历写入任务 |
| `interview_session` | 一次只问一道题，题目绑定 JD/简历上下文，回答后再推进 |

`guided-session-state.ts` 负责记住正在进行的引导任务。例如用户正在做自我定位时，普通回答不会让系统突然跳到 Offer 评估；但用户明确说“现在评估这个 JD”时，任务路由可以解锁并切换。

---

## 6. 工具体系

工具注册源头是 `src/lib/agent/tools/index.ts`，当前实际注册 48 个工具：

| 类别 | 数量 | 说明 |
|------|------|------|
| Query | 15 | 只读查询，如读取画像、报告、投递、JD 上下文 |
| Action | 26 | 会写入、导出或推进流程，如 JD/Offer 评估、简历草稿、保存优秀简历 |
| Interview | 2 | 面试出题与回答评分 |
| MCP shim | 5 | Web 搜索、天气、地点、路线、职位搜索 |

高风险工具必须在 `tool-governance.ts` 里声明：

- 允许哪些任务调用。
- 允许哪些子 Agent 调用。
- 是否需要用户确认。
- 是否需要读回校验。
- 成功结果必须包含哪些证据。

如果工具返回 `success: true` 但缺少读回证据，`enforceReadBackSuccessGate()` 会把它改成失败，前端也会显示“未完成可靠落库校验”。

---

## 7. Agent Loop

Agent Chat 保留两条 loop：

| Loop | 当前定位 | 入口 |
|------|----------|------|
| `server-runner.ts` | 生产主路径；服务端持有 API key；服务端执行工具；SSE 输出 | `/api/agent/run` |
| `client-runner.ts` | 兼容和部分前端流式场景；仍包含图片入口、治理和读回 gate | 组件内调用 |

Loop 的可见 phase：

```text
understanding
  -> extracting_ocr / image-intake
  -> executing
  -> verifying
  -> reflecting
  -> responding
  -> done
```

长会话压缩时会出现：

```text
compressing_context
```

模型调用仍有降级链，但业务正确性不能依赖模型自觉。路由、工具许可、读回校验和任务完成判断都在代码层执行。

---

## 8. 会话、记忆与数据层

当前数据层通过 `getDataRepositories()` 抽象访问。局域网部署已配置：

```text
DB_DRIVER=postgres
DATABASE_URL=<configured>
```

因此当前 LAN 的权威事实源是 PostgreSQL。SQLite 的角色是：

- 本地轻量 fallback。
- 旧数据迁移源。
- `ALLOW_SQLITE_LEGACY=readonly` 下的归档读取。
- 部分脚本和历史文档的兼容路径。

会话路径：

```text
AgentChat
  -> /api/sessions
  -> getDataRepositories().sessions
  -> Postgres sessions（当前 LAN）
  -> Dexie 作为浏览器缓存和离线 fallback
```

记忆路径：

```text
短期上下文：recent messages + memory_digest
会话摘要：sessions.memory_digest / session_memory
长期记忆：memory_items / memory_evidence / memory_chunks
优秀简历：reference_resumes / reference_resume_chunks / reference_resume_usage
向量检索：pgvector
治理入口：/admin/memory
```

---

## 9. 前端渲染规则

聊天页当前需要满足几个 UI 约束：

- 历史对话栏和聊天主区域独立，不允许底部横向滚动条把两者一起拖动。
- AI 长文本、表格、代码块必须在消息容器内换行或局部横滚，不能撑开整个页面。
- 用户上传文本 + 图片时，应在同一条用户消息里按“文字在上、图片在下”渲染。
- 工具卡片显示中文名称、状态、摘要和可展开详情。
- 活动 run、上下文压缩、图片识别和读回校验状态都要可见。

相关实现集中在 `src/app/agent/page.tsx` 和 `src/components/shell/AppShell.tsx`。

---

## 10. 管理员可视化

| 页面 | 用途 |
|------|------|
| `/admin/agent-runs` | 查看 Agent run、step、phase、工具输入输出、错误、契约状态 |
| `/admin/agent-reviews` | 查看 run 复盘、失败类型、Eval 候选队列 |
| `/admin/memory` | 查看优秀简历、候选记忆、团队共享、索引和反馈治理 |

这些页面依赖 PostgreSQL。未切到 Postgres 时，run/review/eval candidate 不会完整沉淀。

---

## 11. API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/agent/run` | POST | 服务端 Agent Loop 入口，返回 SSE |
| `/api/agent/image-intake` | POST | 图片 OCR/多模态识别与文档类型判断 |
| `/api/agent/runs` | GET | 当前用户活动 run |
| `/api/agent/runs/[id]` | GET/PATCH | 查看或取消单个 run |
| `/api/agent/session-review` | POST | 对会话触发复盘 |
| `/api/agent/persist-eval` | POST | JD 评估报告/JD/投递记录持久化，含读回校验 |
| `/api/agent/memory-writeback` | POST | 长期记忆候选写入 |
| `/api/agent/memory-index` | POST | 长期记忆向量索引 |
| `/api/sessions` | GET/POST/PATCH/DELETE | 会话 CRUD |
| `/api/data/jds` | GET/POST/PATCH/DELETE | JD 库 |
| `/api/data/reports` | GET | 报告库 |
| `/api/cv/edit-proposals/*` | GET/POST/PATCH | 简历修改草稿、应用、丢弃、回滚 |
| `/api/admin/agent-runs` | GET | 管理员 run 调试 |
| `/api/admin/agent-reviews` | GET/PATCH | 管理员复盘治理 |
| `/api/admin/memory` | GET/PATCH | 管理员记忆治理 |

---

## 12. 当前边界

- Eval 候选不会自动改代码、自动加测试或自动部署；它只是把失败结构化沉淀。
- Agent Loop 可以重试、降级、阻止错误成功态，但不是完全自主工程师。
- 图片识别失败时不能伪造 JD/Offer 内容；必须要求用户重传、裁剪或粘贴文本。
- 简历修改必须先生成 proposal，再由用户确认应用，不能让模型直接把 Markdown 解释文本写进简历。
- SQLite 还不能从代码中删除；迁移、fallback 和归档路径仍依赖它。

---

## 13. 相关文档

- [07-数据层设计](./07-数据层设计.md)
- [08-Agent互通机制](./08-Agent互通机制.md)
- [17-Agent工具生态](./17-Agent工具生态.md)
- [18-服务端Agent-Loop](./18-服务端Agent-Loop.md)
- [19-分层记忆系统](./19-分层记忆系统.md)
- [22-当前系统状态与治理闭环](./22-当前系统状态与治理闭环.md)
- [23-Postgres向量记忆与数据治理](./23-Postgres向量记忆与数据治理.md)
