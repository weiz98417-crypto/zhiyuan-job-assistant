# 17 产品整体 agent 化重构规划

多页面产品化完成后，Zhiyuan 已经不再是一个单点工具，而是承接了 JD 评估、简历提案、Offer 判断、面试准备、自我定位、记忆和 Admin 管理的一组求职工作流。这个阶段的核心问题变成：用户不应该自己记住每个页面、每个入口、每种材料该放在哪里，系统需要用 Agent Chat 把这些能力串成一个连续产品。

因此，整体 agent 化不是“给页面套一个聊天框”，也不是把内部治理记录当成产品能力，而是把用户的自然语言目标转成明确任务，再由合适的业务 agent、工具、页面和数据对象共同完成。

## 重构动因

MVE 阶段证明了单条链路成立：

```text
输入 JD
  -> 生成评估报告
  -> 基于报告生成简历提案
  -> 用户确认
  -> 简历读回
```

多页面阶段证明了业务资产可以被承接：

```text
Reports 承接 JD 报告
CV 承接简历和提案
Compare 承接 Offer
Interview 承接面试状态
Profile 承接自我定位
Admin 承接治理动作
```

进入整体 agent 化后，要解决的不是“某个页面能不能用”，而是“用户能否只表达求职目标，系统自动选择正确路径”。

## 产品目标

整体 agent 化后的产品目标如下：

| 目标 | 含义 |
|---|---|
| 一个主入口 | Agent Chat 承接用户自然语言、文本材料、图片材料和跨页继续任务 |
| 六类业务能力 | `general`、`evaluate`、`resume`、`interview`、`profile`、`offer` 分别处理明确业务边界 |
| 内部编排 | Orchestrator 只做分类、路由、任务约束和工具范围控制，不作为第 7 个业务 agent |
| 页面承接 | Agent 的结果必须落到 Reports、CV、Compare、Interview、Profile、Admin 等页面 |
| 数据可信 | 当前运行事实源是 PostgreSQL + pgvector，SQLite 只保留 fallback/archive/migration 角色 |
| 成功可证 | 保存、应用、审批、导出等动作必须有 read-back 或 verifier |

一句话表达：

```text
Agent Chat 负责理解和推进任务，业务 agent 负责专业判断，页面负责复查和确认，数据库负责事实，read-back/verifier 负责证明。
```

## 用户任务如何推动 Agent 化

| 用户表达 | 背后任务 | 需要的 agent | 需要的页面 |
|---|---|---|---|
| “帮我看这个岗位能不能投” | JD 评估、匹配判断、风险识别 | `evaluate` | Reports |
| “我现在的简历是什么” | 只读查询当前简历 | `resume` | CV |
| “基于这份 JD 改一下个人概述” | 生成简历提案、等待确认 | `resume` | CV |
| “这个 Offer 怎么谈” | Offer 字段抽取、风险和谈判问题 | `offer` | Compare |
| “基于这个 JD 模拟面试” | 绑定 JD 和简历，进入一题一答 | `interview` | Interview |
| “我适合什么方向” | 连续追问、形成画像信号候选 | `profile` | Profile |
| “这个功能怎么用” | 通用说明、导航、低风险解释 | `general` | 对应页面 |

这里的关键不是模型会回答，而是系统能把“模糊目标”变成“可验证任务”。

## Agent 化边界

### 业务 agent

6 个业务 agent 是产品能力边界：

| agent | 业务职责 | 不能做什么 |
|---|---|---|
| `general` | 通用引导、导航、低风险解释、无法分类时澄清 | 不替代专业 agent 做高风险写入 |
| `evaluate` | JD 理解、匹配度、风险、投递建议、报告生成 | 不处理 Offer 薪资谈判，不修改简历 |
| `resume` | 简历查询、简历提案、差异说明、确认后应用 | 不编造经历，不绕过确认写入 |
| `interview` | 面试计划、一题一答、回答反馈、状态延续 | 不生成脱离 JD 和简历的泛题库作为主流程 |
| `profile` | 自我定位、经历梳理、偏好和画像信号候选 | 不把单次情绪或 JD 要求直接写成长期画像 |
| `offer` | Offer 字段抽取、风险、比较、谈判问题 | 不伪造公司政策或法律结论 |

### Orchestrator

Orchestrator 是内部能力，不是用户要学习的角色。它只负责：

- 判断用户意图属于哪个 taskType。
- 选择 6 个业务 agent 之一。
- 限定可调用工具范围。
- 判断是否需要澄清。
- 绑定目标对象 ID，例如 `reportId`、`proposalId`、`offerId`、`interviewSessionId`。
- 要求写入动作完成 read-back 或 verifier。

它不能被包装成第 7 个业务 agent，也不能把路由判断写成业务结论。

## 重构后的产品链路

```text
用户在 Agent Chat 输入目标或材料
  -> Orchestrator 判断 taskType
  -> 选择一个业务 agent
  -> agent 读取当前上下文和用户材料
  -> 在 48 个注册工具中选择允许工具
  -> 工具读写 PostgreSQL + pgvector 中的业务对象
  -> 高风险动作等待用户确认
  -> 写入后执行 read-back/verifier
  -> 页面展示结果、差异、状态和下一步
```

这条链路把“自然语言交互”和“产品事实”分开：用户可以用自然语言进入任务，但系统最终必须落到明确对象和页面。

## 重构范围

| 模块 | 重构内容 |
|---|---|
| Agent Chat | 作为统一入口，支持文本、图片、跨页继续和待确认动作 |
| Task Contract | 定义 taskType、目标对象、允许 agent、允许工具、成功证据 |
| Tool Registry | 维护 48 个注册工具的用途、effect、agentAllowlist、read-back 要求 |
| Page Handoff | 页面向 Agent Chat 传递稳定对象 ID，而不是只传自然语言描述 |
| Memory | 区分私有记忆、团队候选、审核状态、来源和撤回路径 |
| Admin | 管理用户、记忆、运行证据和评估候选，不替代用户业务页面 |
| Evals | 把关键产品链路沉淀成可复跑样本，服务后续质量稳定 |

## 阶段拆分

### 第一阶段：任务边界

先定义所有核心任务的边界：

- JD 评估和 Offer 分析不能混淆。
- 简历查询和简历修改必须分离。
- 自我定位需要追问，不直接给空泛结论。
- 面试准备必须绑定 JD 和简历。
- 图片材料先识别类型和置信度，再进入业务任务。

### 第二阶段：工具约束

48 个注册工具必须按任务约束使用。工具不能因为“模型想调用”就调用，而是要满足：

- taskType 匹配。
- agentAllowlist 匹配。
- effect 风险等级匹配。
- 高风险写入有用户确认。
- 完成后能 read-back 或 verifier。

### 第三阶段：页面承接

Agent 输出不只停在聊天里：

- JD 报告进入 Reports。
- 简历提案进入 CV。
- Offer 分析进入 Compare。
- 面试进度进入 Interview。
- 画像信号进入 Profile。
- 用户和记忆治理进入 Admin。

### 第四阶段：运行证据

每次关键任务都要留下可复查证据：

- 输入材料。
- 目标 agent。
- taskType。
- 使用工具。
- 目标对象 ID。
- 页面承接位置。
- read-back/verifier 结果。

这些证据服务于质量验收和后续 evals，不被夸大成自动处置能力。

## 完成状态

整体 agent 化规划完成后，Zhiyuan 的产品表达从“多个页面功能集合”升级为：

```text
一个以 Agent Chat 为主入口的 AI 求职工作台。
用户表达目标，系统选择业务 agent，页面承接结果，数据对象可复查，高风险动作可确认，成功态有证据。
```

这个结论会继续输入 18-20：整体 agent 系统设计、子 agent 体系、记忆与工具。

## 重构前后对照

Agent 化规划要让人看清楚产品形态发生了什么变化。

| 维度 | 多页面产品化阶段 | Agent 化后 |
|---|---|---|
| 用户入口 | 用户可能从不同页面进入 | Agent Chat 成为主入口 |
| 任务理解 | 页面入口暗含任务类型 | Orchestrator 明确 taskType |
| 能力边界 | 页面功能分散 | 6 个业务 agent 承担主责 |
| 工具调用 | 功能里直接执行动作 | 48 个工具受 task contract 约束 |
| 跨页上下文 | 依赖页面传参和用户记忆 | 稳定对象 ID + session state |
| 成功态 | 页面提示和接口返回 | read-back/verifier |
| 长期连续性 | 用户反复解释背景 | 记忆系统沉淀可追溯信号 |

这张对照能说明为什么 17 不是“换一种实现方式”，而是产品复杂度增长后必须出现的新组织方式。
