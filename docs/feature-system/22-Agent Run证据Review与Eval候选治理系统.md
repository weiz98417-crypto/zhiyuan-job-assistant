# 纸鸢求职助手 Agent Run 证据、Review 与 Eval 候选治理系统的产品构造

纸鸢求职助手的 Agent Run 监控和 Agent Review，不应该拆成两个系统。真实产品链路是：每次 Agent 执行都会留下运行记录和步骤证据；管理员可以在后台查看最近运行、失败运行和步骤摘要；Review 会把运行证据转成 pass/warning/fail、失败类型、修复建议和 Eval 候选；Eval 候选再进入接受、拒绝或提升流程。

这套系统的产品目标是把“AI 这次有没有真的干活、哪里失败、失败能否沉淀成回归用例”变成可审计的后台能力。

## 1. 产品定位

纸鸢的 Agent 能做很多高风险任务：保存简历提案、评估 JD、保存 Offer 报告、导出文件、写入画像、处理图片。只看用户前台最终回复是不够的，因为模型可能：

- 没有调用工具却声称完成。
- 工具失败了但助手说成功。
- 工具成功了但最后给用户错误提示。
- 写入了部分数据但没有读回验证。
- 图片识别失败却继续评估。
- 输出里泄露邮箱、手机号或 base64 图片。
- 同一类失败反复出现，却没有进入 eval。

Agent Run 证据系统负责记录发生了什么；Review 系统负责判断这次运行是否合格；Eval 候选系统负责把可复现失败沉淀下来。

```text
Agent run
  -> run ledger
  -> step evidence
  -> Admin run dashboard
  -> deterministic review / LLM judge
  -> failure type
  -> repair suggestion
  -> eval candidate
  -> accepted / rejected / promoted
```

## 2. 为什么不能只看前台对话

前台对话只能看到“助手说了什么”。但 AI 产品真正需要知道的是：

- 工具是否被调用。
- 工具输入输出是什么摘要。
- 是否有 read-back。
- 任务契约是否满足。
- 错误发生在路由、工具、写入、图片、输出还是系统层。
- 是否有用户隐私泄露风险。

如果没有运行证据，问题只能靠人工猜。纸鸢把 Agent run 变成可查询记录，就是为了把偶发错误变成可定位、可修复、可回归的工程资产。

## 3. 核心代码边界

| 能力 | 项目文件 | 产品含义 |
|---|---|---|
| Run ledger | `src/lib/agent/run-ledger.ts` | 记录 Agent run、步骤、状态和结果 |
| Run API | `src/app/api/agent/runs/route.ts`、`src/app/api/agent/runs/[id]/route.ts`、`src/app/api/agent/runs/[id]/steps/route.ts` | 前台或运行时写入 run 与 step |
| Admin runs API | `src/app/api/admin/agent-runs/route.ts` | 后台查询最近运行和失败运行 |
| Admin runs 页面 | `src/app/admin/agent-runs/page.tsx` | 展示运行统计、状态筛选和步骤摘要 |
| Run review | `src/lib/agent/run-review.ts` | 判断运行质量、失败类型、证据和候选 |
| Review API | `src/app/api/admin/agent-reviews/route.ts`、`summary/route.ts`、`[id]/route.ts` | 后台查看 review 和摘要 |
| Eval candidate API | `src/app/api/admin/agent-eval-candidates/[id]/route.ts` | 接受、拒绝、提升 eval 候选 |
| Repair planner | `src/lib/agent/repair-planner.ts` | 根据失败类型生成修复方向 |

这些文件形成一条审计闭环，而不是两个后台页面。

## 4. Agent Run 记录

Agent run 记录的核心字段包括：

- `id`
- `user_id`
- `session_id`
- `task_type`
- `agent_id`
- `status`
- `contract_json`
- `result_json`
- `error_json`
- `created_at`
- `updated_at`
- `recent_steps`

状态包括：

- `planned`
- `running`
- `waiting_user`
- `verifying`
- `repairing`
- `succeeded`
- `failed`
- `rolled_back`
- `cancelled`

这些状态让后台能区分：任务是还在跑、等待用户、验证中、修复中、成功、失败、已回滚还是已取消。

## 5. Step 证据

每个 run 会有 steps。后台展示时会把 step 转成摘要：

- `phase`
- `toolName`
- `status`
- `inputSummary`
- `outputSummary`
- `verifier`
- `error`
- `createdAt`

这类 step 是排查问题的最小证据单元。例如一次 JD 截图评估失败，可能要看：

- 图片 intake 是否执行。
- OCR 是否有正文。
- 路由是否选了 JD 评估。
- `evaluate_jd_full` 是否调用。
- 报告是否保存。
- read-back 是否成功。

没有 step，后台只能看到“失败”；有 step，才能知道失败点在哪里。

## 6. 隐私脱敏

`/api/admin/agent-runs` 不是把原始输入输出直接暴露给管理员页面。它会做脱敏：

- base64 图片替换成 `[image]`。
- 邮箱替换成 `[email]`。
- 手机号替换成 `[phone]`。
- 文本长度截断到安全摘要。

`admin-agent-runs.test.ts` 明确验证：

- 序列化结果不包含 `data:image/png;base64`。
- 邮箱被替换成 `[email]`。
- 手机号被替换成 `[phone]`。

这很重要：后台要能排查问题，但不应该把用户完整简历、截图、联系方式无限制展示出来。

## 7. Admin Runs 页面

`src/app/admin/agent-runs/page.tsx` 提供后台可视化。

页面展示：

- 最近运行数量。
- 运行中数量。
- 成功数量。
- 失败/回滚数量。
- 状态筛选。
- 每个 run 的 task type、agent id、contract、routing、result、error 和 recent steps。

这不是给普通用户看的功能，而是产品运营和工程治理入口：当用户反馈“Agent 卡住了”“图片识别失败”“报告没有保存”，管理员可以从 run 证据定位。

## 8. Review 判断

`run-review.ts` 会把 run 和 steps 转成结构化 review。

Review 输出包括：

- `verdict`
- `score`
- `primary_failure_type`
- `failure_types`
- `evidence_json`
- `suggested_fix`
- `eval_candidate_json`
- `reviewer_version`
- `reviewed_at`

`verdict` 有：

| verdict | 含义 |
|---|---|
| `pass` | 未发现关键问题 |
| `warning` | 有警告但不一定失败 |
| `fail` | 存在明确失败 |

这让后台能从“运行日志”升级到“质量判断”。

## 9. 失败类型

Review 里有明确的失败类型。项目中可识别的典型类型包括：

- `routing_error`
- `tool_contract_mismatch`
- `missing_run`
- `tool_failed_but_message_success`
- `tool_succeeded_but_message_failure`
- `missing_readback`
- `partial_write`
- `image_intake_failure`
- `image_intake_conflict_ignored`
- `bad_output_rendering`
- `profile_signal_noise`
- `memory_governance_failure`
- `user_intent_unresolved`
- `llm_judge_quality_warning`
- `system_error`

这些类型对应真实产品问题，而不是泛泛的“AI 出错”。例如：

- `missing_readback` 说明写入或导出缺少读回证据。
- `image_intake_failure` 说明图片没有先走 intake/classification/OCR。
- `tool_failed_but_message_success` 说明工具失败但助手说成功。
- `routing_error` 说明任务路由错。

## 10. 证据结构

每条 review evidence 会包含：

- `code`
- `failureType`
- `severity`
- `message`
- `snippet`
- `stepId`
- `toolName`
- `data`

`run-review.ts` 会对 evidence 做去重和脱敏，避免同一错误反复堆叠，也避免把敏感原文写进 review。

这让 Review 结果可以被管理员阅读，也能进入 eval 候选。

## 11. Eval 候选

当 review verdict 不是 pass 时，系统可以生成 eval candidate。

Eval 候选包含：

- `review_id`
- `run_id`
- `name`
- `task_type`
- `failure_type`
- `input_summary`
- `status`
- `dedupe_key`
- `metadata`

它的产品意义是：不是每个失败都立刻变成测试，但每个有价值的失败都可以成为候选，等待管理员接受、拒绝或提升。

## 12. 候选状态流转

候选状态包括：

- `candidate`
- `accepted`
- `rejected`
- `promoted`

`/api/admin/agent-eval-candidates/[id]` 支持 PATCH 更新状态。测试验证了：

- 管理员可以更新 eval candidate 状态。
- 提升为 `promoted` 时，会返回 promotion lifecycle draft。
- draft 里包含建议测试名，例如 `jd_evaluation_image_intake_failure_3_regression`。

文档必须写清：`promoted` 当前是生成草案和生命周期提示，不等于已经自动写入测试文件。

## 13. Repair planner

`repair-planner.ts` 根据 failure type 生成修复方向。

例如：

- 路由错误：检查 task routing 和 clarification gates。
- 工具契约不匹配：对齐 tool governance、task contract 和 allowed tools。
- 缺少 read-back：要求写入、导出、Admin 工具声明成功前必须有验证证据。
- 图片失败：先走 image intake、分类和 OCR。
- 输出渲染问题：移除内部工具 chatter，输出结构化用户摘要。

这让 Review 不只是“判失败”，还给出下一步修复方向。

## 14. 用户链路

这个系统的使用者主要是管理员和维护者。

```text
Agent 前台执行任务
  -> run ledger 记录 run 和 steps
  -> 用户反馈或后台巡检发现异常
  -> 管理员进入 Agent Runs 页面
  -> 查看状态、任务类型、工具步骤和脱敏摘要
  -> 触发或查看 Agent Review
  -> Review 给出 verdict、failure type、evidence、suggested fix
  -> 有价值的问题进入 Eval Candidate
  -> 管理员接受、拒绝或提升候选
```

## 15. 失败模式

| 失败点 | 典型表现 | 正确处理 |
|---|---|---|
| run 没有记录 | 只看到前台失败 | 创建 run 或 session anomaly |
| step 摘要泄露隐私 | 出现邮箱、手机号、base64 图片 | 脱敏和截断 |
| 工具失败但消息成功 | 用户被误导 | Review 标记失败类型 |
| 成功工具被总结成失败 | 用户以为没完成 | Review 标记输出不一致 |
| 写入缺 read-back | 无法证明真的保存 | 标记 `missing_readback` |
| 图片未分类就评估 | OCR 或业务错误 | 标记 `image_intake_failure` |
| Eval 候选重复 | 同类失败堆积 | 使用 dedupe key |
| promoted 被误解为已落测试 | 实际只是草案 | 明确显示 lifecycle draft |

## 16. 测试与证据

相关测试包括：

- `src/__tests__/admin-agent-runs.test.ts`：验证 Admin runs 返回脱敏摘要、统计和失败筛选。
- `src/__tests__/admin-agent-reviews.test.ts`：验证 review summaries、eval candidates 和候选状态更新。
- `src/__tests__/agent-run-review.test.ts`：验证 run review 的失败类型、证据和候选生成。
- `src/__tests__/agent-run-review-trigger.test.ts`：验证 review 触发链路。
- `src/__tests__/agent-review-ui.test.ts`：验证 review 后台 UI 关键展示。

这些测试说明系统已经不只是“记录日志”，而是在把 Agent 失败沉淀成可治理的产品质量资产。

## 17. 产品总结

Agent Run 证据、Review 与 Eval 候选治理系统可以分成五层：

```text
记录层：agent_runs、agent_run_steps
展示层：Admin Agent Runs 页面和 API
判断层：run-review verdict、failure type、evidence
修复层：suggested_fix、repair planner
沉淀层：agent_eval_candidates、candidate 状态流转
```

它的产品价值是让 AI Agent 的质量问题可以被看见、被分类、被修复、被回归。对一个需要持续迭代的求职助手来说，这比单次回答效果更重要。
