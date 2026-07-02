# 多agent系统与编排器开发

本篇定位在 Zhiyuan 从 Agent-first 产品设计进入 runtime 开发的第一步：把 Agent Chat 作为主入口，把用户的求职表达转成可执行、可验证、可恢复的任务链路。这里的多 agent 不是把页面聊天化，也不是研发任务分发系统，而是面向 JD、简历、Offer、面试、自我定位、记忆和 Admin 的求职产品运行时。

当前业务 agent 口径固定为 6 个：`general`、`evaluate`、`resume`、`interview`、`profile`、`offer`。Orchestrator 只做内部编排，不作为第 7 个对外业务 agent。48 个工具必须经过 task contract、工具范围和写入验证后才能参与执行。

## 为什么需要编排器

Agent Chat 是主入口，但用户说的一句话经常同时包含多个产品意图：

- “帮我看看这份 JD，我的简历哪里要改？”
- “刚才那个 Offer 值不值得接？”
- “继续面试，按刚才的岗位问我。”
- “把这段经历写进简历，但先让我确认。”

如果没有编排器，模型很容易把“回答得像对”误当成“产品动作正确”。编排器要解决的是确定性问题：

| 问题 | 编排器负责给出的答案 |
|---|---|
| 谁处理 | 选择 6 个业务 agent 中的一个 |
| 做什么 | 生成明确 `taskType` |
| 能用什么 | 计算 `allowedTools` |
| 是否要确认 | 判断高风险动作和澄清状态 |
| 怎样算成功 | 写入后必须 read-back 或 verifier 通过 |
| 页面如何承接 | 输出稳定对象 id 和下一步动作 |

## Runtime 主链路

```text
Agent Chat 收到输入
  -> Orchestrator 识别意图和上下文
  -> 选择业务 agent
  -> 生成 task contract
  -> 限定 allowedTools
  -> 业务 agent 生成计划或工具调用
  -> 工具执行真实读写
  -> read-back/verifier 判定成功
  -> Agent UI 和业务页面同步展示
  -> run ledger 留下可审计证据
```

这条链路的关键不是“模型能不能说出答案”，而是产品是否能证明每一步都发生在正确对象、正确用户、正确权限和正确数据源上。

## Task Contract 设计

task contract 是 Agent runtime 的执行合同。它把自然语言输入约束成产品可以判断的结构。

| 字段 | 含义 |
|---|---|
| `taskType` | 本轮任务类型，例如 `resume_query`、`resume_edit`、`jd_evaluation` |
| `agentId` | 负责本轮任务的业务 agent |
| `contractPolicy` | 只读、引导、可验证写入、高风险可验证写入、导出、Admin |
| `allowedTools` | 本轮允许调用的工具集合 |
| `targetRefs` | JD、report、proposal、offer、session、profile 等稳定对象引用 |
| `requiresClarification` | 是否必须先问清楚 |
| `clarificationQuestion` | 只问一个明确问题 |
| `successCriteria` | 成功需要满足的读回或 verifier 条件 |
| `blockedReason` | 阻断原因，给 UI 和日志使用 |

task contract 的价值在于把“应该帮用户”拆成“能不能做、做哪个对象、做到什么程度”。prompt 只能影响表达，contract 才能约束执行。

## 6 个业务 Agent 的边界

| agent | 产品职责 | 边界 |
|---|---|---|
| `general` | 兜底问答、导航、轻量解释 | 不获得高风险写入权 |
| `evaluate` | JD 解析、岗位匹配、评估报告 | 不处理 Offer 谈判，不直接改简历 |
| `resume` | 简历查询、修改建议、proposal、apply | 查询和写入分开，写入前确认 |
| `interview` | 面试准备、单题推进、回答评分 | 一次推进一个面试上下文 |
| `profile` | 自我定位、画像信号、长期偏好 | 画像写入需要来源和质量判断 |
| `offer` | Offer 解析、对比、谈判建议 | 不把 Offer 当成 JD 报告 |

业务 agent 只说明“谁最适合处理”。真正能调用什么工具，仍由 task contract 与工具治理共同决定。

## 工具接入原则

48 个工具接入 runtime 时必须具备治理元数据：

- 中文名称和用户可读描述。
- effect：只读、写入、导出、Admin 等。
- `allowedTaskTypes`。
- `agentAllowlist`。
- 是否需要用户确认。
- 是否需要 read-back。
- `successContract` 或 verifier。
- 错误和阻断信息。

写入工具不能只返回 `success: true`。JD 报告、简历 section、Offer 报告、profile signal、memory item、Admin 状态变更，都必须从 PostgreSQL + pgvector 当前 runtime 读回，或由 verifier 给出可检查证据。SQLite 只用于 fallback、archive、migration，不作为当前 runtime 的成功依据。

## 状态与数据

Agent runtime 要保存的不只是聊天文本，还包括产品状态：

- `sessionId` 与当前消息。
- active task 与 task contract 摘要。
- pending confirmation。
- resume proposal。
- interview currentQuestion。
- JD/report/offer/profile/memory 的目标引用。
- tool result 与 read-back 结果。
- run ledger 中的 step、状态、耗时和异常信息。

这些状态让用户在 Agent、CV、Reports、Offer、Interview、Profile、Admin 之间切换时仍能回到同一个业务对象。

## 阶段完成标准

完成本阶段时，应能证明：

- Agent Chat 是主入口，业务页面承接对象而不是重新猜测意图。
- Orchestrator 是内部编排器，对外业务 agent 仍为 6 个。
- 常见输入能生成稳定 `taskType`。
- 只读任务不会获得写入工具。
- 高风险写入先确认，并在写入后 read-back/verifier。
- 48 个工具的治理元数据可审阅。
- PostgreSQL + pgvector 是当前 runtime，SQLite 只用于 fallback/archive/migration。
- 页面能展示工具状态、目标对象、异常原因和下一步。

这一阶段的目标是搭出可运行、可约束、可验证的 Agent runtime，为后续 evals、多页面联动、登录权限和全量测试打底。

## runtime 执行链路样例

下面以“基于刚才 JD 改个人概述”为例，展示多 agent runtime 需要完成的实际动作。

| 顺序 | runtime 动作 | 关键字段 |
|---|---|---|
| 1 | 接收 Agent Chat 输入 | `sessionId`、`userId`、message |
| 2 | 读取页面上下文 | `reportId`、current route、active task |
| 3 | 编排器判断 taskType | `resume_edit` |
| 4 | 选择业务 agent | `resume` |
| 5 | 生成任务合同 | allowed tools、requiresConfirmation、successCriteria |
| 6 | 读取当前 CV 和 report | 当前 userId scope |
| 7 | 创建 proposal | `resume_edit_proposal` |
| 8 | 读回 proposal | `proposalId`、status、target section |
| 9 | 页面展示待确认动作 | CV diff |
| 10 | 用户确认后 apply | section read-back/hash |

这条链路说明：runtime 的价值是把一句自然语言变成可追踪的产品动作，而不是让模型直接输出一段建议。
