# 14 Agent 系统 Demo 验证

本篇定义首版 Agent 系统 Demo 要验证什么。Demo 的目的不是展示模型会聊天，而是证明 Zhiyuan 的产品故事成立：用户可以从 Agent Chat 进入求职任务，系统能选择合适的业务 agent，调用受约束的工具，把结果落到多页面业务资产中，并用 read-back/verifier 证明关键写入。

## Demo 要回答的问题

| 问题 | 判断方式 |
|---|---|
| 产品故事是否清楚 | 用户是否理解“一个 Agent Chat 主入口 + 多页面工作台”的价值 |
| 任务入口是否自然 | 用户是否能用自然语言发起 JD、简历、Offer、面试、自我定位任务 |
| Agent 分工是否清晰 | 6 个业务 agent 是否分别承担正确业务 |
| Orchestrator 是否定位准确 | 只作为内部编排，不对外成为第 7 个业务 agent |
| 工具是否可控 | 48 个工具是否受 taskType、agentAllowlist、effect、read-back 约束 |
| 页面是否承接结果 | Reports、CV、Compare、Interview、Profile、Admin 是否有明确资产 |
| 数据是否可信 | PostgreSQL + pgvector 当前 runtime 能读回关键对象 |

## Demo 主故事

```text
求职者打开 Agent Chat
  -> 输入一个目标岗位 JD
  -> evaluate agent 生成并保存 JD 评估报告
  -> Reports 页面展示报告
  -> 用户要求基于报告优化简历
  -> resume agent 创建简历 proposal
  -> CV 页面展示差异并等待确认
  -> 用户继续准备面试
  -> interview agent 绑定 JD 与简历快照
  -> Profile 页面沉淀可追溯的自我定位信号
  -> Admin 页面能查看关键记录和记忆管理状态
```

这条故事线把 JD、简历、面试、自我定位、记忆和 Admin 串起来。Offer 可以作为第二条分支故事，用于证明 Offer 不会被当成 JD。

## Demo 场景组

| 场景 | 用户输入 | 目标 agent | 页面承接 | 核心证据 |
|---|---|---|---|---|
| JD 评估 | “帮我评估这份 AI 产品经理 JD” | `evaluate` | `/evaluate/reports` | report/JD read-back |
| 简历查询 | “我现在的简历是什么？” | `resume` | `/cv` | 只读当前简历，无 proposal |
| 简历草稿 | “基于这份 JD 优化个人概述，先给草稿” | `resume` | `/cv` | proposal、差异、确认入口 |
| Offer 分析 | “这个 Offer 怎么谈？” | `offer` | `/compare` | offerReportId read-back |
| 面试准备 | “基于这个 JD 开始面试准备” | `interview` | `/interview` | 绑定材料与 currentQuestion |
| 自我定位 | “我不知道适合什么方向” | `profile` | `/profile` | guided state 与画像信号候选 |
| Admin 管理 | 管理记忆或查看运行记录 | `general` 或 Admin API | `/admin/*` | 状态读回和权限边界 |

## Demo 输入准备

Demo 输入要覆盖真实求职材料，而不是只准备简短提示词。

| 材料 | 用途 |
|---|---|
| 一份完整 JD | 验证 `evaluate` agent、报告保存和 Reports 页面 |
| 当前用户简历 | 验证 `resume_query` 与 `resume_edit` 分离 |
| 一份 Offer 文本或截图 | 验证 `offer` agent 与 Compare 页面 |
| 面试准备目标 | 验证 `interview_state_json` 与一题一答 |
| 自我定位对话 | 验证 `profile` agent 的连续引导 |
| Admin 账号 | 验证记忆、用户和关键记录的管理入口 |

## 通过标准

| 标准 | 说明 |
|---|---|
| 入口成立 | 用户从 `/agent` 发起任务，不需要记内部工具名 |
| 分工成立 | `general/evaluate/resume/interview/profile/offer` 分别处理对应场景 |
| 编排成立 | Orchestrator 只在内部选择 agent、taskType 和工具范围 |
| 页面成立 | 结果能在对应页面复查和继续 |
| 数据成立 | PostgreSQL + pgvector 当前路径能读回关键对象 |
| 写入成立 | 高价值写入有 read-back/verifier |
| 备用定位清楚 | SQLite 只作 fallback/archive/migration |

Demo 不要求所有边缘场景都成熟，但必须证明首版产品故事能被连贯讲清，并能用实际页面和数据证据支撑。

## Demo 记录格式

| 字段 | 内容 |
|---|---|
| Demo ID | 稳定编号 |
| 用户目标 | 用户想完成的求职任务 |
| 输入材料 | 原始文本、图片或页面对象 |
| 目标 agent | 6 个业务 agent 之一 |
| taskType | 本次任务类型 |
| 工具调用 | 使用的工具名称、effect、目标对象 |
| 页面承接 | 结果进入哪个页面 |
| 数据证据 | read-back/verifier、对象 ID、状态 |
| 结论 | 成立、部分成立、待补证据 |

## Demo 的阶段产物

首版 Agent 系统 Demo 结束后，应得到：

1. 一条可复述的产品故事线。
2. 一组能覆盖 JD、简历、Offer、面试、自我定位、记忆、Admin 的 Demo 记录。
3. 6 个业务 agent 的职责证明。
4. Orchestrator 内部编排定位说明。
5. 48 个工具的受控调用证据。
6. PostgreSQL + pgvector 当前 runtime 的读回证据。
7. 进入 15-16 的可行性判断材料。

## Demo 讲述脚本

首版 Demo 应按“用户目标 -> 系统判断 -> 页面证据”展开。

```text
1. 用户打开 Agent Chat，输入一份 AI 产品经理 JD。
2. 系统识别为 JD 评估，选择 evaluate agent。
3. evaluate 生成报告摘要，并保存完整 report。
4. 打开 Reports，展示 reportId、匹配点、差距、风险和准备路径。
5. 用户继续说：基于这份 JD 改一下个人概述。
6. 系统选择 resume agent，读取当前 CV 和 report 上下文。
7. CV 页面出现 pending proposal，而不是直接覆盖简历。
8. 用户确认后 apply，目标 section read-back。
9. 用户说：基于这份 JD 开始面试准备。
10. interview agent 绑定 JD 与简历快照，一次提出一个问题。
```

Demo 过程中每一步都要能指向一个对象：`reportId`、`proposalId`、`sectionId`、`interviewSessionId`。没有对象的 Demo 只是在展示模型回答。

## Demo 现场检查表

| 检查点 | 现场要看到什么 |
|---|---|
| 主入口 | 用户从 Agent Chat 输入材料，不需要先找具体工具 |
| 路由 | JD 进入 `evaluate`，简历进入 `resume`，Offer 进入 `offer` |
| 工具卡片 | 显示动作、目标对象、状态和证据 |
| 页面承接 | Reports/CV/Compare/Interview/Profile 至少各有清晰承接位置 |
| 待确认 | 简历改写不直接覆盖，必须先出现 proposal |
| 读回 | 保存或应用后能看到对象 ID 或 section 结果 |
| 扩展 | Offer 和 Interview 能作为自然分支，而不是硬切页面 |

Demo 讲到最后，要让人相信 Zhiyuan 是“能连续处理求职任务的产品”，不是一个会回答求职问题的聊天框。

## Demo 材料包

| 材料 | 准备方式 | 用途 |
|---|---|---|
| JD 文本 | 选择 AI 产品经理或 Agent 产品岗位 | 触发 `evaluate` |
| 当前简历 | 使用包含 C 端、海外、AI 应用经历的简历 | 触发 `resume_query` 和 `resume_edit` |
| Offer 文本 | 准备薪资、试用期、福利字段 | 触发 `offer` |
| 面试目标 | 绑定同一 JD 和简历 | 触发 `interview` |
| 定位问题 | “我适合什么方向” | 触发 `profile` |
| Admin 账号 | 已登录 active/admin | 展示治理边界 |

材料包越真实，Demo 越能证明产品而不是证明提示词。
