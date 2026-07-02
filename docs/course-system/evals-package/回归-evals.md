# 回归 evals

回归 evals 记录 Zhiyuan 项目里已经被 run review、专项脚本或 `.eval.test.ts` 固定下来的偏差。

## 简历 runtime 回归

`agent-runtime-regressions.eval.test.ts` 是简历链路最集中的回归文件。

| 回归点 | 项目里的真实场景 |
|---|---|
| 占位符保存 | 模型输出 `**Projects** -> replace with:` 这类半成品时，不能保存进简历 |
| 手工紧凑内容 | `SQL / RAG / Prompt Engineering / Agent design` 这种真实技能清单可以被接受 |
| 控制标记污染 | code fence 和 diff table 不能成为简历正文 |
| verifier 失败 | read-back mismatch 后，回答不能保留 “Successfully saved” |
| durable run 恢复 | 刷新后能读取当前 session 的 running run |
| run detail 恢复 | 能读取最新 step，知道当前卡在 verifying 或 waiting_user |
| owner-scoped cancel | 取消 run 走当前用户作用域 |
| rollback 控制 | Agent 页面保留撤销最近一次已应用简历修改的能力 |
| pending proposal 续接 | 刷新后还能应用或废弃同一个 proposal id |

这一组回归资产对应用户最容易感知的产品风险：简历没有真的保存、保存了半成品、刷新后丢提案、失败还说成功。

## 优秀简历记忆演进回归

`excellent-resume-memory-evolution.eval.test.ts` 把优秀简历记忆的演进固定下来。

| 回归点 | 项目里的真实场景 |
|---|---|
| 粘贴优秀简历保存 | 用户粘贴 AI 产品经理简历，系统能识别并保存为 private reference |
| 截图优秀简历保存 | 截图 OCR 后文本保留，岗位类别缺失时追问 |
| 非简历截图拦截 | JD、Offer、聊天截图不会进入优秀简历保存 |
| 私有召回隔离 | user-a 不能召回 user-b 的 private reference |
| 团队参考简历 | approved team references 可以共享 |
| 反馈影响排序 | accepted reference 排上去，rejected reference 排下去 |
| 抽象 pattern | pattern 不复制“李四”和完整业务成果句 |

这部分可以和第 20 章记忆与工具连起来讲：优秀简历记忆不是素材堆积，而是可保存、可召回、可治理、可抽象。

## JD 部分写入回归

`scripts/check-jd-eval-partials.mjs` 和 `jd-eval-partial-candidate.test.ts` 记录了 JD 评估链路里的部分写入问题：有报告，但找不到同用户、同公司、同岗位且 linked by `report_id` 的 JD 原文。

脚本处理的真实对象：

| 对象 | 字段 |
|---|---|
| report | `report_num`、`user_id`、`company`、`role` |
| candidate JD | `candidate_jd_id` |
| eval candidate | `jd_evaluation_partial_write_orphan_report` |
| failure type | `partial_write` |
| expected contract | 每个 persisted JD evaluation report 都要有 linked JD read-back record |
| dedupe key | `jd_evaluation:partial_write:<hash>` |

这条回归资产在课程里非常关键：JD 报告和 JD 原文必须成对存在，否则 Reports 页面、Interview 绑定、记忆索引、后续简历优化都会缺证据。

## Agent run review 回归

`agent-run-review.test.ts` 把 Agent 运行记录里的偏差固定成 failure type。它读取 run、step、messages，然后生成 review 和 candidate。

| failure type | Zhiyuan 里的具体含义 |
|---|---|
| `missing_readback` | 高风险写入工具成功，但 verifier 里 read-back requirement 没满足 |
| `image_intake_failure` | 用户上传 JD 图片，run 里没有真实 `recognize_document_image` step |
| `resume_write_pollution` | 简历写入结果里出现 `| 修改前 | 修改后 | 原因 |` 等流程表格 |
| `interview_policy_violation` | 面试一次吐多题，或又问用户准备什么公司岗位，说明绑定丢了 |
| `routing_error` | 路由还需要澄清，却继续执行 |
| `guided_task_drift` | active task 锁定为自我定位深挖，但 run 进入 Offer/JD 任务 |
| `tool_contract_mismatch` | 工具调用被治理层阻断 |
| `context_loss` | 已有 JD 上下文，却让用户重新上传 JD |
| `bad_output_rendering` | 输出里混入表格或不完整渲染内容 |
| `profile_signal_noise` | 画像信号出现“去寻、野蛮、先解”这类噪声片段 |
| `memory_governance_failure` | 记忆 candidate、approve、status transition 不符合治理 |
| `user_intent_unresolved` | 用户取消或意图没有完成 |
| `system_error` | 未分类异常进入兜底 |

这张表就是课程里讲 Admin 复盘时的核心材料，里面每一类都对应 Zhiyuan Agent runtime 中已经被编码的偏差。

## Session anomaly 回归

`reviewAgentSessionAnomalies` 处理没有完整 durable run 的会话异常。项目里已经固定了几种情况：

| 会话现象 | 生成的 candidate |
|---|---|
| 用户发 JD 图片，assistant 让用户贴文本，recentRuns 为空 | `image_intake_not_called` |
| `save_resume_section` 工具返回 HTTP 500，assistant 仍说已保存 | `missing_run`、`tool_failed_but_message_success` |
| activeTask 是自我定位深挖，但回答漂移到别的任务 | guided task drift candidate |

这些 candidate 会脱敏用户邮箱、手机号、图片 base64 和 API key。课程里可以用它说明：即使没有完整 run，聊天消息也能进入 Admin 复盘队列。

## Admin candidate 生命周期

`admin-agent-reviews.test.ts` 记录 Admin 页面和 API 对 eval candidate 的处理。

| Admin 操作 | 项目里的断言 |
|---|---|
| 查看 reviews | admin 可以按 verdict 和 failureType 查询 |
| member 访问 | member 请求 `/api/admin/agent-reviews` 返回 403 |
| candidate accepted | 返回 lifecycle，标记需要显式开发动作 |
| candidate promoted | 返回 promotion draft，例如 `jd_evaluation_image_intake_failure_3_regression` |

这部分对应课程里的 Admin 治理：管理员不是只看日志，而是把失败记录变成可沉淀的 eval candidate。

## run ledger 与恢复回归

相关文件包括：

- `agent-run-ledger-routes.test.ts`
- `agent-run-recovery-message.test.ts`
- `admin-agent-runs.test.ts`
- `agent-session-review-route.test.ts`

项目里 run ledger 承担两个职责：

| 职责 | 项目表现 |
|---|---|
| 用户侧恢复 | Agent 页面刷新后能显示 active run、最新 step、恢复/取消入口 |
| Admin 侧复盘 | Admin 能看到 run、step、review、candidate，定位未达契约的业务链路 |

这部分要和简历 proposal、JD 图片、Offer 保存一起讲，因为这些长任务都可能跨页面、跨刷新、跨确认。

## 回归资产在课程中的位置

| 课程阶段 | 使用的回归资产 |
|---|---|
| 简历链路 | `agent-runtime-regressions.eval.test.ts` |
| 优秀简历记忆 | `excellent-resume-memory-evolution.eval.test.ts` |
| JD 评估保存 | `check-jd-eval-partials.mjs`、`jd-eval-partial-candidate.test.ts` |
| Agent runtime 治理 | `agent-run-review.test.ts` |
| Admin 复盘 | `admin-agent-reviews.test.ts` |
| 页面恢复 | run ledger 相关测试 |

回归 evals 在这套课程里承担的角色是：把 Zhiyuan 项目真实运行中容易偏离的地方固定下来，让学员看到产品不是只做出功能，还要把运行证据沉淀成可长期检查的资产。
