# 18 整体 agent 系统规划与设计

本篇把 17 的产品重构规划落成系统设计。设计目标不是炫技，而是让 Zhiyuan 的求职任务可以被稳定理解、分派、执行、确认和复查。

Agent 系统的核心不是“有多少个 agent”，而是每一次用户请求都能回答五件事：

```text
这是谁的任务？
这是什么求职目标？
应该由哪个业务 agent 处理？
允许调用哪些工具？
结果落到哪里，并如何证明完成？
```

## 总体结构

```text
Agent Chat
  -> Orchestrator
  -> Task Contract
  -> Business Agent
  -> Tool Registry
  -> PostgreSQL + pgvector
  -> Page Handoff
  -> read-back / verifier
```

| 层级 | 职责 | 产品意义 |
|---|---|---|
| Agent Chat | 接收自然语言、文本、图片、页面上下文 | 用户不需要理解内部结构 |
| Orchestrator | 内部分类、路由、约束任务 | 保证任务进入正确业务能力 |
| Task Contract | 定义任务类型、目标对象、工具范围和成功证据 | 防止 agent 越界 |
| Business Agent | 执行业务判断和生成 | 形成专业能力边界 |
| Tool Registry | 管理 48 个注册工具 | 防止工具滥用和假成功 |
| Data Runtime | PostgreSQL + pgvector | 保存当前事实 |
| Page Handoff | 将结果落到页面 | 支持复查、确认、继续 |
| Evidence | read-back/verifier | 证明动作真的完成 |

SQLite 只作为 fallback/archive/migration，不参与当前 runtime 的主事实表达。

## 任务合同

每个 Agent 任务都要形成 task contract。它不是用户可见的表单，而是系统内部的执行边界。

| 字段 | 说明 |
|---|---|
| `userId` | 从登录态派生，不能信任客户端传入 |
| `taskType` | JD 评估、简历查询、简历提案、Offer 分析、面试准备、自我定位等 |
| `agent` | 6 个业务 agent 之一 |
| `inputMaterial` | JD、简历、Offer、面试回答、截图、页面对象等 |
| `targetObject` | report、proposal、offer、interview session、profile signal 等 |
| `allowedTools` | 由 taskType 和 agentAllowlist 共同确定 |
| `requiresConfirmation` | 是否需要用户确认 |
| `successEvidence` | read-back、verifier、页面可见对象或明确拒绝原因 |

示例：

```text
用户说：“基于这个 JD 改一下个人概述”
taskType = resume_edit
agent = resume
targetObject = cv.section.personal_summary
requiresConfirmation = true
successEvidence = proposal 可见 + apply 后 section read-back
```

## 路由设计

路由不是关键词匹配，而是结合目标、材料、上下文和风险判断。

| 输入特征 | 目标 taskType | agent |
|---|---|---|
| JD 文本、岗位职责、任职要求 | `evaluate_jd` | `evaluate` |
| “我现在的简历是什么” | `resume_query` | `resume` |
| “按这个 JD 改简历” | `resume_edit` | `resume` |
| Offer、薪资、福利、试用期、谈判 | `offer_analyze` | `offer` |
| 面试、追问、模拟、回答反馈 | `interview_practice` | `interview` |
| 方向、定位、适合什么岗位 | `profile_guided` | `profile` |
| 无法分类或低风险说明 | `general_help` | `general` |

低置信时不直接执行，先澄清：

- “这张截图更像 Offer，不是 JD，要按 Offer 分析吗？”
- “你是想查看当前简历，还是生成一版修改提案？”
- “这段经历要写入长期画像，还是只用于本次回答？”

## 工具设计

48 个注册工具被设计成受控能力，而不是开放函数池。

| 工具属性 | 设计要求 |
|---|---|
| name | 稳定名称，便于运行记录和 evals 复查 |
| purpose | 说明工具服务的业务目标 |
| effect | read、write、export、admin、memory 等 |
| agentAllowlist | 限定哪些业务 agent 可以使用 |
| taskTypeAllowlist | 限定哪些任务类型可以使用 |
| confirmation | 高风险写入是否需要确认 |
| evidence | read-back/verifier 规则 |

工具调用结果在用户侧要以可理解的卡片呈现：

- 做了什么。
- 作用于哪个对象。
- 是否需要确认。
- 是否完成读回。
- 如果失败，失败原因是什么。

## 页面承接设计

Agent 系统不能把所有结果塞回聊天。页面是业务资产面板。

| 业务对象 | 页面 | 页面职责 |
|---|---|---|
| JD 报告 | Reports | 复查、追问、导出、继续简历或面试 |
| 简历和提案 | CV | 查看当前简历、差异、确认、撤回 |
| Offer 和谈判问题 | Compare | 字段、风险、缺失信息、多 Offer 对比 |
| 面试状态 | Interview | 当前问题、回答记录、反馈、继续 |
| 画像信号 | Profile | 来源、置信度、可见性、撤回 |
| 用户和记忆治理 | Admin | 审批、审核、状态读回 |

页面回到 Agent Chat 时，必须传递稳定对象 ID，而不是只说“刚才那个”。

## 状态与记忆

系统要区分三类信息：

| 类型 | 示例 | 处理方式 |
|---|---|---|
| 临时上下文 | 当前对话里的一份 JD、一次追问 | 跟随 session，不默认长期保存 |
| 业务资产 | report、proposal、offer、interview state | 写入 PostgreSQL + pgvector，按 userId 隔离 |
| 长期记忆 | 用户偏好、职业目标、可复用经历信号 | 需要来源、可见性、撤回路径 |

JD 要求不能直接变成用户画像；面试中的临时回答也不能默认进入团队知识。记忆必须服务用户连续求职，而不是吞掉隐私边界。

## 成功态设计

Zhiyuan 的成功态不能只靠一句“完成了”。

| 动作 | 成功证据 |
|---|---|
| 保存 JD 报告 | reportId/reportNum 可按当前 userId 读回 |
| 生成简历提案 | proposal 在 CV 页面可见，包含目标 section 和差异 |
| 应用简历提案 | 目标 section read-back 一致 |
| 保存 Offer 分析 | offerReportId 可读回，Compare 页面可见 |
| 更新面试状态 | currentQuestion 和 transcript 可恢复 |
| 写入画像信号 | 来源、类型、置信度、可见性存在 |
| Admin 审批 | 状态读回与页面展示一致 |

没有证据时，系统只能说“已生成草稿”“已提交处理”或“需要补充验证”，不能说“已保存”。

## 设计完成标准

整体 Agent 系统设计完成时，应能清晰说明：

1. 为什么主入口是 Agent Chat。
2. 为什么只有 6 个业务 agent。
3. Orchestrator 如何内部编排而不对外成为业务角色。
4. 48 个工具如何被任务边界约束。
5. PostgreSQL + pgvector 如何承载当前事实。
6. SQLite 为什么只保留 fallback/archive/migration。
7. 页面如何承接 Agent 产出。
8. read-back/verifier 如何保护高价值写入。

这些设计为 19 的子 agent 体系和 20 的记忆与工具设计提供结构基础。

## task contract 示例

一个合格的 task contract 要把用户目标转成可执行边界。

```json
{
  "taskType": "resume_edit",
  "agent": "resume",
  "userScope": "current_user",
  "inputObjects": {
    "reportId": "rpt_1024",
    "cvSection": "personal_summary"
  },
  "allowedTools": [
    "read_cv",
    "read_report",
    "save_resume_section",
    "apply_resume_edit_proposal"
  ],
  "requiresConfirmation": true,
  "successEvidence": [
    "proposal_read_back",
    "section_hash_after_apply"
  ]
}
```

这个合同里最重要的是三点：`agent` 只能是 6 个业务 agent 之一；工具必须来自允许范围；成功必须被读回或验证。这样 Agent 系统才不会把自然语言意图误当成授权。
