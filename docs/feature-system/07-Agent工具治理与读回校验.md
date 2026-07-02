# Agent 工具治理、读回校验与跨页面写入一致性的产品构造

这个系统解决的是纸鸢 Agent 产品化里最容易出错的一件事：Agent 不是只能回答问题，它还会评估 JD、保存报告、生成文件、修改简历、写入画像、评估 Offer、创建面试会话、保存优秀简历素材。只要 Agent 可以写数据，就必须有“它能不能做、什么时候能做、做完怎么证明”的产品规则。

## 1. 产品定位

纸鸢把 Agent 工具分成可读、可建议、可写入、高风险写入、导出、Admin、内部能力几类。用户看到的是一条聊天回复或一张工具卡片，系统内部实际在处理任务类型、Agent 身份、目标文档、用户确认、读回校验和成功证据。

核心实现集中在：

| 模块 | 项目事实 |
|---|---|
| 工具治理注册表 | `src/lib/agent/tool-governance.ts` |
| 工具注册中心 | `src/lib/agent/tools/registry.ts` |
| 工具类型定义 | `src/lib/agent/tools/types.ts` |
| 写入读回校验 | `src/lib/agent/tools/readback-verification.ts` |
| verified action 证据 | `src/lib/agent/verified-action.ts` |
| Agent loop 服务端执行 | `src/lib/agent/loop/server-runner.ts` |
| 任务契约 | `src/lib/agent/task-contract.ts` |

这不是一个后台技术开关，而是用户信任机制。比如用户问“我现在的简历是什么”，Agent 只能读简历；用户说“把这段经历改进一下”，Agent 可以生成提案；用户确认后，系统才允许应用提案并用 hash 读回证明写入成功。

## 2. 为什么需要工具治理

没有治理时，Agent 很容易出现四类产品事故。

第一类是越权写入。用户只是咨询简历现状，Agent 却调用 `save_resume_section` 或 `apply_resume_edit_proposal`，把未确认内容写进简历。项目里已经用 `resume-save-guard` 和工具治理把“读取、生成草稿、创建提案、应用提案”分开。

第二类是错误路由。JD 评估、Offer 评估、面试准备、画像更新都能接收长文本，如果只让模型自由选择工具，它可能把 Offer 截图当 JD 评估，或把优秀简历素材写到当前用户画像。`tool-governance.ts` 用 `allowedTaskTypes`、`agentAllowlist`、`documentTypes` 限定工具归属。

第三类是假成功。文件导出、JD 报告保存、简历提案应用、Offer 报告保存都不能靠“我已完成”判断。项目要求写入后读回目标记录、文件大小或 hash，再允许前端显示完成状态。

第四类是跨页面不一致。Agent 聊天页执行动作后，`/cv`、`/evaluate/reports`、`/compare`、`/profile`、`/settings` 等页面必须能读到同一份数据。工具治理把跨页面写入收束到受控 API 和仓储层，避免只更新聊天摘要、不更新业务页面。

## 3. 工具分层

纸鸢的工具不是按“调用了哪个函数”理解，而是按产品风险理解：

| effect | 含义 | 典型工具 |
|---|---|---|
| `read` | 只读取业务上下文，不改变用户数据 | `get_profile`、`get_report_detail`、`read_file`、`analyze_jd_risks` |
| `guide` | 生成建议或草稿，但不直接落库 | `generate_cv`、`optimize_resume_section`、`self_positioning` |
| `write` | 写入低风险过程状态 | `prepare_interview_full` |
| `high_risk_write` | 修改简历、画像、Offer、报告等核心资产 | `evaluate_jd_full`、`evaluate_offer`、`apply_resume_edit_proposal` |
| `export` | 生成可下载文件 | `export_file`、`download_report_pdf` |
| `admin` | Admin 后台治理动作 | 评审、候选 eval 状态流转等 |
| `internal` | 系统内部诊断或运行支撑 | 健康检查、运行状态类能力 |

这个分层决定了前端是否需要确认、后端是否必须读回、Agent 是否能宣称成功、失败时是否要进入 run review 或 eval 候选。

## 4. 任务契约

任务契约是 Agent 执行动作前的“边界说明”。同一个用户输入，在不同任务契约下允许的工具不同。

| 任务类型 | 产品目标 | 允许范围 |
|---|---|---|
| `resume_query` | 查看简历、解释简历、找问题 | 只读，不允许保存 |
| `resume_edit` | 生成简历修改、创建提案、用户确认后应用 | 高风险写入必须读回 |
| `jd_evaluation` | 评估 JD 并沉淀报告 | `evaluate_jd_full` 可写报告和 JD |
| `offer_evaluation` | 评估 Offer、生成谈判材料 | Offer 写入和报告写入必须读回 |
| `interview_coaching` | 创建面试准备、生成题目、评分复盘 | 面试会话状态可写，材料重绑要受控 |
| `profile_update` | 更新求职画像信号 | 写入 profile signal 后要读回 |
| `reference_resume_save` | 保存优秀简历素材 | 需要岗位类别、可见性和读回证明 |
| `file_export` | 导出 md/html/pdf | 文件大小和 sha256 必须存在 |

`agent-tool-governance.test.ts` 专门覆盖这些边界：缺少治理元数据的工具默认拒绝；只读任务不能调用高风险写入；澄清阶段不能抢先写；保存优秀简历必须先确认岗位类别。

## 5. 读回校验

纸鸢的“完成”不是自然语言，而是证据。读回校验会根据工具类型读取不同目标：

| 场景 | 读回证据 |
|---|---|
| JD 评估保存 | 报告记录和 JD 记录都能按 id/reportNum 读回，JSON 语义匹配 |
| 文件导出 | 文件存在，字节数大于 0，sha256 与返回值一致 |
| PDF 下载 | PDF bytes、Content-Length、`X-Content-SHA256` 可验证 |
| 简历提案应用 | section 内容 hash 与 proposed hash 匹配 |
| 简历提案丢弃/回滚 | proposal 状态和恢复内容可读回 |
| 画像信号写入 | 插入 id 可读回，技能提升还要验证 profile 中包含目标 skill |
| Offer 保存 | Offer/report 持久化后能读回关键字段 |

对应测试包括：

- `src/__tests__/persist-eval-jd-verified-write.test.ts`
- `src/__tests__/file-export-verified-write.test.ts`
- `src/__tests__/resume-save-guard.test.ts`
- `src/__tests__/profile-signal-verified-write.test.ts`
- `src/__tests__/offer-persistence-verified-write.test.ts`

这些测试的共同目标是：只要读回失败，就不能返回“已保存”“已导出”“已完成”。

## 6. 跨页面写入一致性

Agent 可以从聊天页触发业务动作，但数据最终必须回到对应页面。

| Agent 动作 | 业务落点 | 页面读数 |
|---|---|---|
| `evaluate_jd_full` | `reports`、`jds`、`applications` | `/evaluate/reports`、`/evaluate/jds`、`/tracker` |
| `apply_resume_edit_proposal` | `cv_data`、`resume_edit_proposals` | `/cv` |
| `evaluate_offer` | `offers`、`offer_reports` | `/compare` |
| `mine_profile` / profile signal 写入 | `profiles`、`profile_signals` | `/profile` |
| `prepare_interview_full` | session / interview state | `/interview` 和 Agent Chat |
| `export_file` | `exports` 下载文件 | 浏览器下载和 Agent 工具卡片 |

所以 `29-Agent控制页面数据系统.md` 不应该单独作为一个产品能力存在。它本质上是本系统的“跨页面写入一致性”部分：Agent 不能只在聊天里说改好了，必须让目标页面能用同一套数据读出来。

## 7. 前端呈现

前端不是只展示模型文本，而是展示工具状态。Agent Chat 中的工具卡片会把工具名、执行状态、结果摘要、失败原因和可操作入口呈现出来。`src/components/agent/AgentChat.tsx`、`AgentEvalCard.tsx`、`TaskItem.tsx` 和 `PlanCard.tsx` 让用户看到任务已经进入理解、执行、验证或响应阶段。

产品上这很关键：用户不需要理解 `readBackVerified`、`sha256` 或 `taskContract`，但必须知道系统是否真的保存了内容，是否还需要确认，是否因为材料不足而停止。

## 8. 失败处理

工具失败要按位置拆开，而不是统一报“出错了”。

| 失败位置 | 产品处理 |
|---|---|
| 任务未澄清 | 只问缺失信息，不调用写入工具 |
| 工具不在白名单 | 阻止调用，返回治理原因 |
| 高风险写入未确认 | 阻止写入，提示用户确认目标和内容 |
| 读回失败 | 返回失败，不允许 claim success |
| 外部服务超时 | 标记 transient，可重试或降级 |
| 连续工具失败 | 停止循环，避免重复污染状态 |
| 写入后状态异常 | 进入 Agent Run 证据和 Review 体系 |

`server-runner.ts` 在工具执行后进入 `verifying` 阶段，并把工具结果继续喂回 Agent；如果工具被治理策略阻止，会强制下一轮文本化回应，避免模型换一个更危险的工具继续试。

## 9. 验收口径

这个系统验收时不能只看页面能不能打开，要看四个证据：

1. 每个注册工具都有治理元数据，缺失元数据的工具在测试和开发环境默认拒绝。
2. 只读任务不会调用写入工具，高风险写入不会越过确认。
3. 写入、导出、Admin 动作都带读回证据，读回失败不允许成功提示。
4. Agent 聊天页、业务页面、数据库记录和 run ledger 对同一动作的状态一致。

这套能力是纸鸢从“能聊天的 demo”变成“能替用户处理求职资产的产品”的基础。
