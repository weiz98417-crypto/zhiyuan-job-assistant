# 16 Demo 验证

本篇把首版 Demo 验证沉淀为可复查的产品记录。14 说明 Agent 系统 Demo 验证什么，15 判断 Agent-first 是否可行，16 负责把 Demo 过程整理成产品决策依据：哪些故事已经成立，哪些链路有证据，哪些内容进入后续 Agent-first 设计。

## Demo 验证对象

| 对象 | 验证重点 |
|---|---|
| 产品故事 | 用户是否理解 Agent Chat 主入口和多页面工作台的关系 |
| 关键链路 | JD、简历、Offer、面试、自我定位、记忆、Admin 是否能串起来 |
| Agent 分工 | 6 个业务 agent 是否承担正确职责 |
| 内部编排 | Orchestrator 是否只做内部选择和约束 |
| 工具调用 | 48 个工具是否按任务边界使用 |
| 数据证据 | PostgreSQL + pgvector 是否能读回关键对象 |
| 写入可信 | read-back/verifier 是否覆盖高价值动作 |

## Demo 前置准备

| 准备项 | 要求 |
|---|---|
| 账号 | 至少包含 member、pending、admin、第二个 member |
| 数据 | 当前简历、JD、Offer、面试材料、自我定位初始信息、记忆样本 |
| 页面 | Agent、CV、Reports、Compare、Interview、Profile、Admin |
| runtime | PostgreSQL + pgvector；SQLite 只用于 fallback/archive/migration 说明 |
| 记录 | 每个 Demo 场景都记录输入、agent、taskType、工具、页面、read-back/verifier |

## 核心 Demo 路径

### 路径 A：JD 到报告

```text
用户在 Agent Chat 输入 JD
  -> `evaluate` agent
  -> JD 评估工具
  -> report/JD 写入
  -> read-back
  -> Reports 页面展示
```

通过标准：

| 项目 | 要求 |
|---|---|
| taskType | `jd_evaluation` |
| 页面 | `/evaluate/reports` 可见 |
| 数据 | `reportId`、`jdId` 可读回 |
| 继续 | 从报告回到 Agent Chat 能继续追问 |

### 路径 B：报告到简历 proposal

```text
用户基于某个 JD 报告要求优化简历
  -> `resume` agent
  -> 创建 resume proposal
  -> CV 页面展示差异
  -> 用户确认
  -> 目标 section read-back
```

通过标准：

| 项目 | 要求 |
|---|---|
| 查询和修改分离 | 简历查询不创建 proposal |
| 草稿 | proposal 包含目标 section、原文、建议文案和理由 |
| 写入 | 用户确认后才 apply |
| 证据 | 目标 section hash 或内容等价读回 |

### 路径 C：Offer 分析

```text
用户输入 Offer 文本或截图
  -> `offer` agent
  -> Offer report
  -> Compare 页面展示
  -> 用户继续询问谈判策略
```

通过标准：

| 项目 | 要求 |
|---|---|
| agent | `offer` |
| 对象 | `offerId` 或 `offerReportId` |
| 页面 | `/compare` 可见 |
| 隐私 | 不读取其他用户 Offer |

### 路径 D：面试准备

```text
用户要求基于 JD 和简历准备面试
  -> `interview` agent
  -> 绑定材料快照
  -> 生成当前题目
  -> Interview 页面继续一题一答
```

通过标准：

| 项目 | 要求 |
|---|---|
| 状态 | `interview_state_json` 保存当前题目和材料 |
| 推进 | 每次只推进一个问题或一个追问 |
| 恢复 | 切页后可以继续同一面试任务 |

### 路径 E：自我定位与记忆

```text
用户表达方向不确定
  -> `profile` agent
  -> 连续问题梳理目标、偏好、优势
  -> 形成画像信号候选
  -> Admin 或用户确认后进入记忆
```

通过标准：

| 项目 | 要求 |
|---|---|
| 信号来源 | 用户事实、偏好、岗位要求、模型推测要区分 |
| 记忆 | 只写稳定、可追溯、可撤回的信息 |
| 可见性 | private、team_pending、team 明确 |
| 证据 | 写入后可 read-back |

## Demo 记录模板

| 字段 | 内容 |
|---|---|
| Demo ID | 如 `DEMO-JD-REPORT-01` |
| 用户角色 | member、admin、pending、userA/userB |
| 用户输入 | 原话、材料、入口页面 |
| 目标故事 | 本次要证明的产品价值 |
| agent 与 taskType | 6 个业务 agent 之一和对应任务类型 |
| 工具 | 工具名称、effect、目标对象 |
| 页面承接 | 结果进入哪个页面 |
| read-back/verifier | 对象 ID、hash、文件、状态或页面证据 |
| 结论 | 成立、部分成立、待补证据 |
| 后续输入 | 进入 17-20 的设计事项 |

## Demo 结论写法

Demo 结论要面向产品生命周期，而不是面向单点修补。

| 结论类型 | 写法 |
|---|---|
| 产品故事成立 | 用户可以从 Agent Chat 完成某条求职工作流，并在页面复查结果 |
| 关键链路成立 | 输入、agent、工具、数据、页面、read-back 全部连通 |
| 部分成立 | 页面或数据证据不足，需要在后续设计中补齐 |
| 待补证据 | 尚未获得可复查记录，不能写成已证明 |

## 输出到后续阶段

Demo 验证结束后，进入 17-20 的输入包括：

1. 产品故事主线。
2. 已验证的 Agent Chat 到页面链路。
3. 6 个业务 agent 的职责边界。
4. Orchestrator 内部编排定位。
5. 48 个工具的约束字段和 read-back/verifier 要求。
6. 记忆写入、可见性和 Admin 管理需求。
7. PostgreSQL + pgvector 当前 runtime 与 SQLite fallback/archive/migration 边界。

## Demo 证据包

Demo 结束后，应整理一个证据包，而不是只保留现场印象。

| 证据项 | 示例内容 | 作用 |
|---|---|---|
| 输入材料 | JD 文本、简历 section、Offer 文本、面试目标 | 证明 Demo 不是空提示词 |
| 路由记录 | taskType、agentId、confidence、clarification | 证明任务进入正确 agent |
| 工具记录 | toolName、effect、targetObject、requiresConfirmation | 证明工具受控 |
| 页面截图或状态 | Reports、CV、Compare、Interview、Profile | 证明业务资产被承接 |
| 数据读回 | reportId、proposalId、section hash、offerReportId | 证明成功态可信 |
| 风险记录 | 低置信图片、未确认写入、跨用户读取 | 证明边界被挡住 |

这份证据包会直接输入后续 Agent 系统设计：哪些任务边界已经成立，哪些需要在编排器、工具或页面联动里加强。
