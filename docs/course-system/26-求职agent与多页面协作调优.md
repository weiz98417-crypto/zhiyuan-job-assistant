# 求职agent与多页面协作调优

本篇进入产品化后的页面协作阶段。Agent Chat 是主入口，但用户完成求职任务时会在 Agent、CV、Reports、Offer、Interview、Profile、Admin 之间来回切换。调优目标是让这些页面围绕同一个用户、同一个业务对象和同一个任务状态连续工作。

## 协作原则

```text
Agent 负责理解任务
页面负责呈现和确认对象
工具负责真实读写
PostgreSQL + pgvector 负责当前事实源
read-back/verifier 负责成功判定
```

页面联动不靠“最近打开过什么”猜对象，而靠稳定 id：

- `sessionId`
- `jdId`
- `reportId/reportNum`
- `proposalId`
- `offerId/offerReportId`
- `interviewSessionId`
- `profileId`
- `memoryItemId`
- `runId`

## 用户连续路径

| 路径 | 用户意图 | 关键对象 | 成功体验 |
|---|---|---|---|
| Agent -> Reports | 从聊天里查看 JD 评估结果 | `reportId`、`jdId` | Reports 打开同一报告 |
| Reports -> Agent | 追问某份报告 | `reportId` | Agent 不重新猜报告 |
| Agent -> CV | 查看或应用简历 proposal | `proposalId`、section id | CV 定位到对应段落 |
| CV -> Agent | 针对某段继续优化 | section id、当前内容 hash | Agent 保持目标段落 |
| Agent -> Offer | 查看 Offer 分析和谈判建议 | `offerReportId` | Offer 页面使用同一对象 |
| Offer -> Agent | 追问谈薪策略 | `offerId` | Agent 引用同一 Offer |
| Agent -> Interview | 继续当前面试 | `interviewSessionId` | 当前题和材料不丢 |
| Interview -> Agent | 请求解释评分 | question id、answer id | Agent 回到同一题 |
| Agent -> Profile | 继续自我定位 | `profileId`、signal id | 画像状态一致 |
| Admin -> Agent/Memory | 审阅记忆或运行证据 | `memoryItemId`、`runId` | 状态变更可读回 |

## Agent 到页面

Agent 发起页面跳转时，应携带：

- 目标页面。
- 稳定对象 id。
- 当前 user scope。
- pending action。
- 可展示摘要。
- 返回 Agent 后要恢复的 task contract 摘要。

例如：

```text
targetPage: /evaluate/reports
targetRefs: { reportId, jdId }
pendingAction: "view_report"
returnTo: { sessionId, taskType: "jd_report_query" }
```

页面打开后先按 id 读对象，再展示动作按钮。读不到对象时，页面应提示用户重新选择，而不是另找一个相似对象。

## 页面到 Agent

页面发起 Agent 任务时，不能只传一段文本。它要传对象 id 和快照：

| 页面 | 传给 Agent 的上下文 |
|---|---|
| CV | section id、当前内容、hash、proposalId |
| Reports | reportId、jdId、报告摘要 |
| Offer | offerId、offerReportId、薪资字段摘要 |
| Interview | interviewSessionId、currentQuestion、answer snapshot |
| Profile | profileId、signal id、定位阶段 |
| Admin | runId、memoryItemId、当前状态 |

Agent 收到页面上下文后，由 Orchestrator 生成新的 task contract，而不是让页面直接指定工具。

## 状态恢复

跨页协作要恢复四类状态：

1. 会话状态：`sessionId`、消息、active task。
2. 业务对象：JD、报告、proposal、Offer、面试、画像、记忆。
3. 动作状态：pending confirmation、apply、export、Admin action。
4. 验证状态：read-back/verifier、tool card、run step。

恢复优先级：

```text
URL stable id
  -> session persisted state
  -> PostgreSQL + pgvector read-back
  -> 用户明确选择
```

前端内存只能提升体验，不能作为唯一事实源。

## 调优重点

| 调优点 | 目标 |
|---|---|
| 工具卡片 | 显示工具名、对象 id、状态、验证结果和下一步 |
| 长内容展示 | 报告、简历 diff、JSON、URL 不挤压布局 |
| 返回 Agent | 页面动作完成后能回到同一 session |
| 确认动作 | 简历 apply、画像写入、Admin 状态变更都可确认 |
| 错误表达 | 区分未登录、无权限、对象不存在、读回未验证 |
| Admin 反馈 | 状态变更后立即读回并刷新 |

## 调优完成标准

完成本阶段时，应能证明：

- Agent 和页面围绕同一稳定 id 协作。
- 页面不重复实现业务路由。
- 页面发起 Agent 任务时带完整上下文。
- Agent 写入后页面能读到同一结果。
- 切页、刷新、返回后 active task 不丢。
- Admin 动作有 role 校验和 read-back/verifier。
- 跨页链路进入页面联动测试矩阵。

## 协作调优记录样例

| 场景 | 原始体验 | 调优后体验 | 判断标准 |
|---|---|---|---|
| Reports -> Agent | 用户回到 Agent 后要重新解释 JD | 带 `reportId` 回到同一任务 | Agent 能引用正确报告 |
| Agent -> CV | 生成建议后用户不知道去哪确认 | 自动展示 CV proposal 卡片和入口 | CV 页面有 pending proposal |
| CV -> Agent | 用户想继续问“为什么这样改” | Agent 带 proposalId 解释理由 | 不重新生成无关提案 |
| Interview -> Agent | 用户刷新后说“继续” | 恢复 currentQuestion | 不把“继续”当成回答 |
| Compare -> Tracker | 用户决定接受 Offer 后想记录状态 | Offer 进入投递/决策记录 | 不泄露薪资到公共区域 |

协作调优不是让页面跳转更炫，而是减少用户重复解释、对象丢失和状态错配。

## handoff payload 样例

页面回到 Agent Chat 时，应传递结构化上下文。

```json
{
  "sourcePage": "reports",
  "intent": "resume_edit_from_report",
  "userIdScope": "current_user",
  "objects": {
    "reportId": "rpt_1024",
    "jdId": "jd_7788"
  },
  "displaySummary": "AI 产品经理 JD 报告，匹配度较高，需强化 Agent 项目表达",
  "allowedNextTasks": ["resume_edit", "interview_practice", "offer_compare"]
}
```

有了这个 payload，Agent 不需要猜“刚才那个报告”是谁，也不会把当前用户的任务串到别的对象上。
