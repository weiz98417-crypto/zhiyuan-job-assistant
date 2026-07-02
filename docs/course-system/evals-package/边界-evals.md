# 边界 evals

边界 evals 记录 Zhiyuan 项目里已经落到脚本里的产品红线。它们都来自真实业务链路：简历、JD、Offer、图片、记忆、用户隔离、Admin 复盘。

## Agent 工具边界

`src/__tests__/agent-tool-governance.test.ts` 对应 Zhiyuan 的 48 个注册工具治理。这个文件能直接讲清：项目不是把所有工具丢给模型，而是让 task contract 决定工具能不能用。

| 项目场景 | 文件里的真实断言 | 对课程的价值 |
|---|---|---|
| 所有工具必须登记治理信息 | `auditToolGovernance(getAllTools())` 返回空问题列表 | 48 个工具都有 effect、allowlist、task type、read-back 等元数据 |
| 未分类工具不能默认放行 | `legacy_unclassified_tool` 被拒绝 | 工具新增后不能绕开治理 |
| 自我定位任务不能做 JD 写入 | `career_positioning_guidance` 下调用 `evaluate_jd_full` 被阻断 | `profile` agent 的引导任务不能串到 `evaluate` 写入 |
| 简历查询只读 | `resume_query` 下 `read_file` 允许，`apply_resume_edit_proposal` 被阻断 | 用户问“我现在的简历是什么”时不能创建或应用提案 |
| 澄清阶段不能写入 | `requiresClarification=true` 时 `evaluate_jd_full` 被拒绝 | 图片和文本意图不清时不能提前保存报告 |
| 优秀简历保存要岗位类别 | `save_reference_resume` 缺少 `role_category` 被阻断 | 优秀简历记忆不能无分类入库 |

这一节要和第 19、20、21 章连起来讲：6 个业务 agent 只负责自己的业务任务，Orchestrator 只是内部编排，不是第 7 个业务 agent。

## 简历写入边界

简历是用户最敏感的材料，项目里专门用 `resume-save-guard.test.ts` 和 `agent-runtime-regressions.eval.test.ts` 固定边界。

| 真实测试点 | 项目事实 |
|---|---|
| `buildResumeSavePlan` 从用户粘贴的技能清单中提取可保存内容 | 用户明确给出“改为”后的内容时，系统可以识别目标 section |
| “保存成优秀简历”不会被当成当前 CV 保存 | 优秀简历库和当前简历是两条不同链路 |
| 占位符 `**项目经验** -> 替换为：` 被拒绝 | 模型未完成的改写不能写入 CV |
| “已成功保存到简历”会在无工具成功时被改写 | 口头成功不等于产品成功 |
| `save_resume_section` 会转为 read-back verified proposal | legacy 保存也不能直接绕过提案和读回 |
| proposal 可以应用、废弃、回滚 | 简历修改有状态，有用户确认，有撤销路径 |
| read-back mismatch 后不能保留 saved 文案 | verifier 失败时必须阻止成功态 |

这部分对应课程里的简历产品链路：读取当前简历 -> 生成提案 -> 用户确认 -> 应用 -> 读回 -> 可回滚。

## JD 写入边界

JD 评估涉及报告和源 JD 两个数据对象。`persist-eval-jd-verified-write.test.ts` 和 `scripts/check-jd-eval-partials.mjs` 固定了项目边界。

| 业务对象 | 边界证据 |
|---|---|
| `reports` | 保存后按当前 user 读回 company、role、overall_score、blocks_json |
| `jds` | 保存后读回 source text、company、role、`report_id` |
| PostgreSQL transaction | report 和 JD 同事务，读回失败时 ROLLBACK |
| memory indexing | PostgreSQL 成功保存后触发 memory source indexing |
| partial write scan | 有 report 无 linked JD 时生成 `jd_evaluation_partial_write_orphan_report` candidate |

课程里讲 JD 评估时要带上这部分：报告不是孤立页面卡片，它必须能回到原始 JD，否则后续面试绑定、报告复盘、简历优化都缺源头。

## Offer 写入边界

Offer 链路由 `offer-persistence-verified-write.test.ts` 承接。

| 真实测试点 | 项目事实 |
|---|---|
| Offer POST 后读回 `offers` | company、role、salary、employment_form 等字段按当前 user 保存 |
| Offer report POST 后读回 `offer_reports` | title、report_type、model_version、overall_score、verdict 保存 |
| linked offer 读回 | `offers.latest_report_id` 指向最新 report |
| report snapshot 保存 | report 保留当时的 offer snapshot，不被后续 offer 编辑改变 |

这部分对应 Offer 产品页：用户不是只看一段分析，而是要能回到 Offer 对象、历史报告和谈薪依据。

## 用户画像边界

画像链路由 `profile-signal-verified-write.test.ts` 承接。项目事实是：用户画像不是模型一句话直接写进 profile。

| 场景 | 真实边界 |
|---|---|
| 写入单条 signal | 读回 `profile_signals.id`、source、signal_type、content_json |
| 批量写入 signal | 每个 inserted id 都读回 |
| 确认 skill signal | profile 中出现对应 skill，并有 `profileSkillReadBackVerified` |
| 未确认前 | signal 只是候选事实，不是永久画像 |

这部分和第 30、31、37 章有关：用户画像会影响求职建议，所以必须有来源、状态和读回。

## 图片识别边界

`server-image-intake.test.ts` 记录了图片链路的实际边界：长图 OCR 整图超时时，会切成 top、middle、bottom 三段，合并职责、要求、福利等文本。

项目里图片不是随便转文字，它和业务路由绑定：

| 图片内容 | 项目处理 |
|---|---|
| JD 长截图 | OCR 后进入 JD 评估 |
| Offer 截图 | 进入 Offer 评估 |
| 简历截图 | 进入简历读取、优秀简历保存或简历优化候选 |
| 聊天截图 | 不直接进入 JD/Offer/简历写入 |
| 图片类型和用户文本冲突 | 先澄清，不执行高风险写入 |

这部分可以和第 38 章图片文字安全一起讲：OCR 是入口，任务路由和写入治理才是产品边界。

## 记忆边界

`agent-memory-context.test.ts` 是记忆边界的主要文件。项目里的记忆不是一个所有 agent 都能读的全局知识库。

| task | 允许的记忆 | 不允许的记忆 |
|---|---|---|
| JD 评估 | CV、profile、JD、历史 JD report | raw excellent resume |
| Offer 评估 | offer、offer_report、profile | unrelated JD memory |
| 简历优化 | active reference snippets、active patterns | candidate/rejected memory |
| general chat | 默认不做广泛语义记忆检索 | 私有 profile fact 直接注入 |

文件还断言 semantic reranking 不会返回其他用户的 memory，agent writeback 只能创建 candidate memory，不能直接成为 active profile fact。

这就是 Zhiyuan 记忆系统的项目事实：记忆可以增强简历优化，但不能破坏用户隔离和任务边界。

## 用户隔离边界

`data-isolation.test.ts` 用 `userA`、`userB` 验证 applications、sessions、profiles、offers 的隔离。

| 表 | 测试内容 |
|---|---|
| `applications` | A 用户只能看到 CompanyA，B 用户只能看到 CompanyB |
| `sessions` | A/B 的会话标题按 `user_id` 隔离 |
| `profiles` | A/B 的画像 JSON 独立 |
| `offers` | A/B 的 Offer 独立 |

这部分要和登录、权限、个人信息隔离章节一起讲。Zhiyuan 不是单用户玩具，简历、Offer、记忆、报告都必须按用户隔离。
