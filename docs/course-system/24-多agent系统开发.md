# 多agent系统开发

本篇进入 Agent runtime 的主体开发：把 Orchestrator、6 个业务 agent、48 个工具、runner、状态和页面反馈连接成一个求职产品系统。目标不是让多个 agent 自由聊天，而是让 Agent Chat 能稳定推进 JD、简历、Offer、面试、自我定位、记忆和 Admin 相关任务。

## 系统组成

```text
Agent Chat
  -> Orchestrator
  -> business agent registry
  -> task contract
  -> tool governance
  -> tool handlers
  -> PostgreSQL + pgvector runtime
  -> read-back/verifier
  -> Agent UI / business pages / Admin
```

其中 Orchestrator 内部编排，业务 agent 对外提供产品能力。工具执行真实读写，数据事实以 PostgreSQL + pgvector 当前 runtime 为准。SQLite 只用于 fallback、archive、migration。

## Agent Registry

registry 要集中维护 6 个业务 agent：

| agent | 主要产品能力 | 常见页面承接 |
|---|---|---|
| `general` | 导航、解释、兜底问答 | Agent |
| `evaluate` | JD 分析、匹配度、报告 | Agent、Reports |
| `resume` | 简历查询、proposal、apply、rollback | Agent、CV |
| `interview` | 面试准备、继续、评分 | Agent、Interview |
| `profile` | 自我定位、画像信号、记忆候选 | Agent、Profile、Admin |
| `offer` | Offer 分析、对比、谈判建议 | Agent、Offer |

registry 不把 Orchestrator 当业务 agent 计数。Orchestrator 可以在内部注册，但对外口径仍是 6 个业务 agent。

## Agent Definition

每个 agent definition 至少包含：

- `id`、`name`、`description`。
- 业务边界。
- intent patterns。
- explicit switch patterns。
- 候选 tool names。
- prompt 约束。
- 输出结构要求。
- 典型 targetRefs。

definition 只解决“谁处理”。“能不能调用工具”由 task contract 与工具治理决定。

## Prompt 边界

业务 prompt 要把产品边界写清：

- `resume`：查询不写入；修改先生成 proposal；apply 后读回 section hash。
- `evaluate`：JD 报告保存后按当前 userId 读回。
- `offer`：区分事实、假设和谈判建议，不进入 JD 报告链路。
- `interview`：保持一个面试 session，一次推进一个问题。
- `profile`：画像信号需要来源、置信度和可撤销状态。
- `general`：可解释和导航，不承诺高风险写入。

prompt 不替代代码 gate。高风险写入必须由 contract、工具治理和 verifier 共同约束。

## Runner 开发

runner 把编排结果变成真实执行。

| runner 侧重点 | 内容 |
|---|---|
| client runner | 流式输出、阶段提示、工具卡片、确认按钮、取消和继续 |
| server runner | 工具调用、权限判断、数据读写、read-back、run ledger |

一次执行的核心步骤：

```text
保存用户消息
  -> 加载 session 与 activeTask
  -> 调用 Orchestrator
  -> 设置 activeAgentTools
  -> 调用业务 agent
  -> 执行工具
  -> read-back/verifier
  -> 记录 run step
  -> 输出消息和页面动作
```

## 48 个工具接入

工具需要按产品动作分组：

| 工具方向 | 示例能力 |
|---|---|
| JD | 评估、保存报告、读取报告 |
| 简历 | 查询、生成 proposal、apply、rollback、导出 |
| Offer | 解析、评估、对比、谈判建议 |
| 面试 | 创建 session、出题、评分、继续 |
| Profile | 定位引导、信号写入、画像读取 |
| Memory | 写入候选、检索、审批状态 |
| Admin | 用户审批、状态变更、审阅队列 |
| 通用 | 文件导出、图片处理、辅助读取 |

每个工具都要声明 effect、taskType 范围、agent 范围、确认要求和 successContract。写入类工具缺少 read-back/verifier 时不能进入稳定链路。

## 状态持久化

多 agent 系统必须把关键状态放到服务端可恢复位置：

- Agent session 和消息。
- active task。
- pending confirmation。
- resume proposal。
- interview currentQuestion。
- JD/report/offer/profile/memory 的 targetRef。
- 工具执行摘要。
- run ledger 和 step。

这样用户从 Agent 跳到 CV、Reports、Offer、Interview、Profile、Admin 后，再回到 Agent 也不会丢对象。

## UI 反馈

Agent UI 不只展示自然语言，还要展示产品动作：

- 当前 agent 和任务状态。
- 工具卡片：工具名、目标对象、状态、摘要。
- 需要确认的动作。
- read-back/verifier 结果。
- 可跳转页面。
- 异常原因和下一步。

页面侧不重新做业务路由，只承接稳定对象 id，并在用户确认后把结果回传给 Agent runtime。

## 阶段交付

本阶段结束时，应形成：

- 6 个业务 agent 的 registry 快照。
- Orchestrator 内部编排说明。
- 48 个工具的治理元数据表。
- taskType 与 allowedTools 映射。
- runner 链路说明。
- 状态持久化字段说明。
- Agent UI 工具卡片规范。
- evals 覆盖的核心契约清单。

完成这一步后，产品具备从 Agent Chat 发起任务、调用业务 agent、执行工具、验证写入、联动页面的 runtime 基础。

## agent 运行事件序列

多 agent 系统开发完成后，每次任务都应能还原成事件序列。

```text
message.received
  -> route.started
  -> route.completed
  -> contract.created
  -> agent.selected
  -> tool.requested
  -> tool.completed
  -> verifier.completed
  -> page.handoff.created
  -> user.confirmation.waiting
  -> action.applied
  -> readback.completed
```

事件序列的价值在于：用户看到的是流畅体验，产品团队看到的是可复查证据。比如简历提案没有进入 CV 页面时，可以从事件中判断是 `tool.completed` 缺失，还是 `page.handoff.created` 缺失。

## agent 开发边界

| 边界 | 开发要求 |
|---|---|
| 业务边界 | 每次任务只有一个主责 agent |
| 工具边界 | 工具必须在 allowlist 内 |
| 状态边界 | session state、agent state、interview state 分开保存 |
| 页面边界 | 业务对象落到对应页面 |
| 成功边界 | 写入类工具必须 read-back/verifier |
| 隐私边界 | run 记录默认摘要化，不裸露高敏原文 |
