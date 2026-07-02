# agent与页面联动调优

本篇聚焦 Agent runtime 和业务页面之间的体验调优。26 已定义协作方式，27 已定义测试矩阵，本篇解决产品化后的细节：如何让用户在聊天、报告、简历、Offer、面试、画像和 Admin 管理之间自然接续。

## 调优目标

| 目标 | 说明 |
|---|---|
| 上下文明确 | Agent 和页面都知道当前对象是什么 |
| 动作可确认 | 高风险写入前给用户明确选择 |
| 结果可验证 | 写入后显示 read-back/verifier 证据 |
| 跳转可恢复 | 切页、刷新、返回后任务不丢 |
| 权限一致 | 页面、API、工具都遵守同一身份和角色 |
| 反馈可理解 | 用户知道现在能继续、取消、重试或查看结果 |

调优不是给页面堆提示文案，而是让状态和对象流动更清楚。

## Context Payload

页面和 Agent 之间传递的上下文建议统一成：

```text
{
  sourcePage,
  sessionId,
  taskType,
  targetRefs,
  snapshot,
  pendingAction,
  returnPath,
  userFacingLabel
}
```

字段要求：

- `targetRefs` 放稳定 id，不放“刚才那个”。
- `snapshot` 放必要快照，防止对象变化后无法解释。
- `pendingAction` 只表示待用户确认的动作，不直接执行工具。
- `returnPath` 让用户回到同一 Agent session。

## Tool Card 调优

工具卡片是 Agent 和页面联动的锚点。卡片应包含：

| 信息 | 用途 |
|---|---|
| 工具中文名 | 让用户知道系统做了什么 |
| 目标对象 | `reportId/proposalId/offerId/sessionId` |
| 状态 | pending、running、verified、needs-confirmation、not-verified |
| 摘要 | 对用户有意义的结果 |
| 验证证据 | read-back hash、id、verifier message |
| 下一步 | 查看页面、确认、取消、继续 |

卡片不要只显示“完成”。写入类动作必须把验证状态展示出来。

## 页面入口调优

每个页面都要有清晰的 Agent 入口：

- CV：针对某段简历继续优化。
- Reports：围绕当前报告追问。
- Offer：围绕当前 Offer 生成谈判策略。
- Interview：解释当前评分或继续下一题。
- Profile：继续自我定位或调整信号。
- Admin：围绕某条 run、memory item 或用户状态请求说明。

入口应传对象 id 和快照。页面不把业务判断写死在按钮里，只把上下文交给 Agent runtime。

## 确认与撤销

需要确认的动作：

- 应用简历 proposal。
- 覆盖简历 section。
- 写入画像 signal。
- 写入或共享 memory。
- 导出文件。
- Admin approve/reject/reset/delete。

确认界面要说明：

- 目标对象。
- 即将改变的字段。
- 是否可撤销。
- 写入后如何验证。

撤销或取消也要写入状态，避免 Agent 下一轮仍以为动作待处理。

## 刷新与返回

刷新页面或返回 Agent 后，系统应按以下顺序恢复：

1. URL 中的稳定对象 id。
2. session 中的 active task。
3. PostgreSQL + pgvector 当前 runtime 读回对象。
4. 用户选择新的目标对象。

如果对象不存在、无权限或验证未完成，页面应给出明确状态，并阻止后续高风险动作。

## Admin 联动

Admin 是上线前的管理入口，但它不应成为任意查看用户私有资产的入口。调优重点：

- 用户审批后立即读回 status、role、token_version。
- 记忆候选显示来源、owner、visibility、状态。
- run 证据默认摘要化，敏感内容最小展示。
- Admin 操作结果回到 Agent 或 Memory 页面时状态一致。
- member 角色无法通过跳转进入 Admin 动作。

## 调优优先级

| 优先级 | 内容 |
|---|---|
| P0 | 登录权限、用户隔离、写入 read-back、对象 id 一致 |
| P1 | Agent 与 CV/Reports/Offer/Interview 的连续路径 |
| P2 | Profile、Memory、Admin 的状态细节和展示密度 |
| P3 | 文案、布局、长内容折叠和辅助说明 |

先保证对象正确和权限正确，再优化流畅度。

## 完成标志

完成本阶段后，用户应能：

- 从 Agent 评估 JD，并在 Reports 继续追问同一报告。
- 从 Agent 生成简历 proposal，在 CV 确认后回到 Agent。
- 从 Agent 分析 Offer，在 Offer 页面继续谈判策略。
- 从 Interview 页面回 Agent 解释当前题和评分。
- 从 Profile 继续自我定位，并让信号状态可见。
- 让 Admin 管理用户、记忆和运行证据，并看到 read-back 结果。

这些链路稳定后，产品才能进入登录、权限、隔离和上线前测试阶段。

## 联动调优决策清单

| 决策 | 选择 | 原因 |
|---|---|---|
| 页面回 Agent 传什么 | 稳定对象 ID + 摘要 | 只传自然语言会导致上下文错配 |
| Agent 生成页面入口时机 | 业务对象创建并读回后 | 避免给用户无效链接 |
| 工具卡片展示粒度 | 摘要 + 目标对象 + 证据 | 不暴露复杂 JSON，又能让用户信任 |
| 待确认动作位置 | Agent Chat 和目标页面都可见 | 用户可能在任一入口继续 |
| 页面刷新后的状态 | 从 PostgreSQL + pgvector 读回 | 不依赖前端临时状态 |
| 错误提示 | 说明对象、原因、下一步 | 不把权限、读回、低置信混成同一种失败 |

这些决策让 Agent 和页面像同一个产品，而不是两个互相跳转的系统。
