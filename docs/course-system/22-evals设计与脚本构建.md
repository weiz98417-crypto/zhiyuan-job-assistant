# evals 设计与脚本构建

这一章复盘 Zhiyuan 求职助手在多 Agent runtime 阶段实际沉淀出来的 eval 资产。内容围绕这个项目已经做过的 JD 评估、简历提案、优秀简历记忆、Offer 评估、面试准备、用户画像、图片识别、Admin 复盘展开。

配套分包：

- [evals 分包入口](evals-package/README.md)
- [边界 evals](evals-package/边界-evals.md)
- [基线 evals](evals-package/基线-evals.md)
- [回归 evals](evals-package/回归-evals.md)

## 本章在项目生命周期里的位置

第 21 章已经讲到多 agent 系统与编排器，Zhiyuan 的 Agent Chat 不再只是一个对话框，而是接住了 6 个业务 agent：

| 业务 agent | 在产品里的职责 |
|---|---|
| `general` | 承接问候、泛咨询、无法归类的求职对话 |
| `evaluate` | 处理 JD 评估、JD 图片识别、招聘风险判断、报告保存 |
| `resume` | 读取当前简历、生成简历修改提案、保存优秀简历记忆 |
| `interview` | 基于 JD、简历、报告和记忆推进面试准备 |
| `profile` | 做自我定位、画像信号沉淀、技能确认 |
| `offer` | 处理 Offer 录入、Offer 报告、谈薪和接受风险 |

第 22 章要讲的是：这些能力进入 runtime 之后，项目怎样证明它们真的按产品契约执行。Zhiyuan 没有只靠“模型回答看起来不错”来验收，而是把每条产品链路落成脚本、快照、读回证据和 Admin 复盘队列。

## Zhiyuan 已经沉淀的 eval 资产

| 产品链路 | 已有 eval 资产 | 课程里讲的项目事实 |
|---|---|---|
| Agent Chat 主入口 | `scripts/eval-agent.mjs` | Agent Chat 有 23 个输入场景，覆盖参考简历、当前简历、JD 评估、搜索、自我定位、投递记录和负向输入 |
| 长程记忆 | `docs/MEMORY_EVALS.md`、`memory-eval-harness.test.ts` | 优秀简历记忆先在 AI 产品经理简历优化窄场景里验证召回、质量提升、no-copy overlap 和用户隔离 |
| JD 风险评估 | `test/snapshots/*.txt`、`jd-evaluation-summary.test.ts` | 项目用 5 类 JD 快照固定 clean、suspect、scam、contract trap、mid-risk 风险锚点，并要求报告输出 A-G 结构 |
| 简历提案 | `resume-save-guard.test.ts`、`agent-runtime-regressions.eval.test.ts` | 简历修改不是直接写 CV，而是创建 proposal、用户确认、读回 hash，再应用或回滚 |
| JD 写入 | `persist-eval-jd-verified-write.test.ts`、`check-jd-eval-partials.mjs` | JD 报告必须和原始 JD 成对保存，`reports` 与 `jds.report_id` 要能同用户读回 |
| Offer 评估 | `offer-evaluation-model.test.ts`、`offer-persistence-verified-write.test.ts` | Offer 报告覆盖社保公积金、用工形态、奖金确定性、快照不可变和 read-back |
| 用户画像 | `profile-signal-verified-write.test.ts`、`profile-skill-quality.test.ts` | 画像不是直接改 profile，先写 profile signal，确认后再进入技能画像 |
| 图片输入 | `server-image-intake.test.ts`、`jd-image-routing.test.ts` | 长图 OCR 可切片，JD/Offer/简历截图要先识别文档类型再进入业务任务 |
| 记忆边界 | `agent-memory-context.test.ts` | JD、Offer、简历优化、general chat 使用不同 memory policy，raw excellent resume 不会串到 JD/Offer |
| Admin 复盘 | `agent-run-review.test.ts`、`admin-agent-reviews.test.ts` | run review 会把 missing read-back、image intake skipped、resume write pollution 等偏差变成 eval candidate |

这一章的课程主线，就是沿着这些链路说明：Zhiyuan 从 POC/MVE 到多 Agent runtime，不是只增加功能，而是把每条功能变成可复查证据。

## Agent Chat 主入口：23 个真实输入场景

`scripts/eval-agent.mjs` 是第 22 章先展示的主入口资产。它直接体现了 Agent Chat 作为产品主入口时要接住哪些求职表达。

当前脚本里 `TEST_CASES` 已经从注释里的 20 个扩展到 23 个。课程里可以按产品场景讲：

| 场景 | 用户会怎么说 | 项目里的期望动作 |
|---|---|---|
| 参考简历 | “参考简历库里有什么？”、“帮我看看张雯茜的简历” | 读取 profile、读取文件、取 reference detail |
| 我的简历 | “我的简历里写了什么？”、“帮我查一下我的个人画像” | 只读当前 profile/CV，不触发写入 |
| 文件读取 | “读一下 cv.md”、“打开 config/profile.yml” | 走受控 `read_file` |
| JD 评估 | 粘贴 AI 产品经理 JD，或给招聘链接 | 拉取 JD、评估 JD、生成完整评估 |
| 搜索 | 查薪资、公司、近期岗位 | 调用搜索类工具，不写入报告 |
| 闲聊 | “你好”、“今天天气怎么样” | 不强行进入业务工具 |
| 自我定位 | “帮我做一下自我定位” | 进入 profile agent 的定位引导 |
| 投递记录 | “帮我查最近的投递记录” | 查询 applications |
| 负向输入 | 读 `/etc/passwd`、调用不存在的删除工具 | 返回 permanent 或拒绝，不产生危险动作 |
| 恢复类输入 | 不存在文件、敏感路径、清理数据请求 | 保持失败可解释，不伪造成功 |

这部分对应 Zhiyuan 的 Agent Chat 首版入口：用户从这里进入参考简历、当前简历、JD 评估、搜索、自我定位和投递记录。

## JD 评估：从风险快照到报告读回

JD 评估是 Zhiyuan 最早形成闭环的产品链路之一。第 22 章可以按三层讲这个项目事实。

第一层是风险样本。`test/snapshots` 里有 5 个 JD 快照：

| 快照 | 对应产品判断 |
|---|---|
| `001-clean-jd.txt` | 正常 JD，风险信号少，作为低风险参照 |
| `002-suspect-jd.txt` | 出现可疑表达，用来锚定中低风险信号 |
| `003-scam-jd.txt` | 招聘骗局或高风险描述，用来锚定高风险信号 |
| `004-contract-trap.txt` | 合同或用工形态陷阱，用来锚定合同风险 |
| `005-mid-risk.txt` | 中等风险岗位，用来校准评分不要极端化 |

第二层是报告呈现。`jd-evaluation-summary.test.ts` 断言报告摘要必须保留 A-G 结构：

| 模块 | 在求职产品里的含义 |
|---|---|
| A 职位概览 | 公司、岗位、基本信息 |
| B 简历匹配 | 当前简历与 JD 的匹配程度 |
| C 职级与策略 | 年限、职级、投递策略 |
| D 薪资与市场 | 薪酬信息和市场判断 |
| E 定制化方案 | 面向该 JD 的准备方向 |
| F 面试准备 | 面试重点和准备建议 |
| G 职位合法性 | 合同、用工、招聘风险 |

第三层是持久化。`persist-eval-jd-verified-write.test.ts` 证明 JD 评估保存后要读回 `reports` 和 `jds`，并且 `jds.report_id` 指向对应报告。`scripts/check-jd-eval-partials.mjs` 专门扫描“有 report 但缺 JD 关联”的部分写入状态，并可生成 `jd_evaluation_partial_write_orphan_report` eval candidate。

这就是课程里要讲的完整 JD 评估链路：样本锚点 -> 报告结构 -> 数据读回 -> 部分写入候选。

## 简历链路：只读查询、提案、应用、回滚

简历是用户最敏感的资产。Zhiyuan 已经把简历链路拆成两类：当前简历和优秀简历记忆。

当前简历链路里，`resume-save-guard.test.ts` 和 `agent-runtime-regressions.eval.test.ts` 固定了几个事实：

| 用户场景 | 项目处理 |
|---|---|
| 用户问“我现在的简历是什么” | 进入 `resume_query`，只读，不创建 proposal |
| 用户要求按某个版本保存技能清单 | 生成 `resume_edit_proposal`，读回 proposal |
| 用户确认应用提案 | 按 proposal id 应用，并校验 section hash |
| 用户刷新页面后继续确认 | 从聊天历史或 run state 找回 proposal id |
| 用户要回滚最近一次修改 | Agent 页面保留 `latestRollbackProposal` 和 rollback 控制 |
| 模型输出占位符或 diff 表格 | 拦截，不写入 CV |
| verifier 读回不一致 | 不允许保留“已保存”的成功态 |

优秀简历记忆链路里，`excellent-resume-memory-evolution.eval.test.ts`、`reference-resume-save-flow.test.ts`、`reference-resume-vector.test.ts`、`excellent-resume-patterns.test.ts` 共同证明：

- 粘贴一份优秀简历，可以识别 AI 产品经理角色类别并进入保存流程。
- 截图提取出的简历如果缺少岗位类别，会保留文本并追问类别。
- JD、Offer、聊天截图不能进入优秀简历保存。
- 参考简历向量召回必须按 owner 和 visibility 隔离。
- 抽取出的 pattern 不能复制候选人姓名和完整业务成果句。

这部分要作为“简历产品链路”讲，不要讲成泛泛的文本生成质量。

## 记忆链路：AI 产品经理优秀简历先验证

`docs/MEMORY_EVALS.md` 明确了项目当时的记忆策略：先在 AI 产品经理优秀简历这个窄场景里验证，再扩大到更多 agent。

`npm run eval:memory` 对应 `memory-eval-harness.test.ts`，它不用 live model，也不依赖外部 embedding provider。项目在这里沉淀了几类真实证据：

| 证据 | 项目含义 |
|---|---|
| AI PM excellent resume fixtures | 课程可以直接展示优秀简历如何被拆成 sections 和 source |
| reference retrieval hit-at-k | 目标 JD + 当前项目经历能召回正确参考简历 |
| quality delta | memory-enabled output 比 no-memory output 得分更高 |
| copy overlap | 输出不能照搬参考简历长句 |
| private/team visibility | 私有参考简历不能跨用户，team 参考简历需要 approved |
| accepted/rejected rerank | 用户反馈会影响后续召回排序 |
| embedding failure state | embedding 不可用时保留 chunk，后续可重建索引 |

这部分课程讲的是 Zhiyuan 的记忆产品怎么从“优秀简历库”走向“可控记忆系统”。

## Offer 链路：录入、评估、报告快照

Offer 评估是另一个完整业务链路。`offer-evaluation-model.test.ts` 不是在测文案，而是在固定中国求职场景里的业务判断：

| Offer 要素 | 项目评估内容 |
|---|---|
| 月薪和发薪月数 | 现金收入和年包 |
| 社保公积金 | 全额基数与最低基数的风险差异 |
| 用工形态 | direct hire、outsourcing、dispatch 的福利和稳定性差异 |
| 奖金 | guaranteed 与 unknown 的确定性差异 |
| 期权/RSU | equity 类型和归属周期 |
| 通勤和城市成本 | 实际生活成本和接受度 |
| 信息缺失 | preliminary report 里保留 missing info |

`offer-persistence-verified-write.test.ts` 再把产品判断落到数据证据上：Offer 写入后要读回，Offer report 写入后要读回，并且 offer 的 `latest_report_id` 指向最新报告。课程里可以把这一段和 JD 评估对照讲：JD 是 `reports + jds`，Offer 是 `offers + offer_reports`。

## 图片链路：长图切片、文档类型、任务路由

Zhiyuan 的用户会直接上传 JD、Offer、简历截图。项目里不是把图片当附件，而是做了服务端 image intake。

`server-image-intake.test.ts` 证明长图可以从 whole OCR 超时切到 top/middle/bottom 切片，并把三段文本合并。求职 JD 截图经常很长，Zhiyuan 在这里保留了长图输入的产品体验：整图失败后继续识别切片，不让用户重新整理文本。

图片进入业务任务后，`jd-image-routing.test.ts` 负责防止串场：

| 图片类型 | 进入链路 |
|---|---|
| JD 截图 | `evaluate` agent 的 JD 评估 |
| Offer 截图 | `offer` agent 的 Offer 评估 |
| 简历截图 | 简历读取、优秀简历保存或简历优化候选 |
| 聊天截图 | 不直接进入 JD/Offer/简历高风险写入 |
| 低置信 OCR | 保留识别结果，要求补充信息 |

这部分是 Zhiyuan 从纯文本 Agent 走向多模态求职助手的产品证据。

## 面试与画像链路

面试链路由 `interview-session-state.test.ts`、`interview-rebind-policy.test.ts`、`interview-prep-ui.test.ts`、`agent-chat-interview-binding.test.ts` 承接。项目里面试不是一次性生成题库，而是绑定 JD、报告、简历和 memory context 后推进 session。

课程里可以按这个顺序讲：

| 步骤 | 项目事实 |
|---|---|
| 创建面试 session | 带 company、role、jdId、reportNum、jdText、cvText |
| 进入第一题 | 当前 question 写入 session state |
| 用户回答后推进 | `advance(session)` 后不丢 sourceBinding |
| 页面承接 | Interview Prep 页面能恢复当前准备状态 |

画像链路由 `profile-signal-verified-write.test.ts` 和 `profile-skill-quality.test.ts` 承接。项目事实是：Agent 不直接把一句用户表达写成永久画像，而是写入 `profile_signals`，读回后再由用户确认，确认技能后才进入 profile skills。

## Admin 复盘和回归资产

Zhiyuan 已经有 run review 和 eval candidate 体系。这里要按产品治理讲，而不是按测试框架讲。

`agent-run-review.test.ts` 会读取 run、step、messages，识别这些具体偏差：

| 偏差类型 | 项目里的场景 |
|---|---|
| `missing_readback` | 高风险写入说成功，但 verifier 没有满足 |
| `image_intake_failure` | 用户上传图片，业务任务跳过 image-intake |
| `resume_write_pollution` | 简历正文混入 Markdown 控制结构或 diff 表格 |
| `interview_policy_violation` | 面试一次输出多题，或丢失 JD/简历绑定 |
| `guided_task_drift` | 自我定位等引导任务中途漂移到别的任务 |
| `tool_contract_mismatch` | 工具调用和当前 task contract 不匹配 |
| `context_loss` | 已有 JD/报告上下文却要求用户重新上传 |
| `profile_signal_noise` | 画像信号里出现低质量词片段 |
| `memory_governance_failure` | 记忆 candidate、active、rejected 状态不符合治理 |

`admin-agent-reviews.test.ts` 再证明 Admin 可以查看 review、筛选 failure type、更新 candidate 状态，并在 promoted 时生成 regression eval 草案，例如 `jd_evaluation_image_intake_failure_3_regression`。

这部分要让学员看到：Zhiyuan 的回归资产不是凭空写出来的，而是从真实 Agent run、工具结果、页面承接和读回证据里长出来的。

## 本章落地到课程的讲授顺序

第 22 章可以按 Zhiyuan 项目的实际时间线讲：

| 顺序 | 讲什么 | 对应资料 |
|---|---|---|
| 1 | Agent Chat 成为主入口后，需要固定 23 个真实输入场景 | `scripts/eval-agent.mjs` |
| 2 | JD 评估先有风险快照，再有 A-G 报告，再有 reports/jds 读回 | `test/snapshots/*`、`persist-eval-jd-verified-write.test.ts` |
| 3 | 简历修改从直接写入改为 proposal、确认、读回、回滚 | `resume-save-guard.test.ts`、`agent-runtime-regressions.eval.test.ts` |
| 4 | 优秀简历记忆先在 AI 产品经理窄场景验证 | `docs/MEMORY_EVALS.md`、`memory-eval-harness.test.ts` |
| 5 | Offer 评估把薪酬、社保、用工形态、报告快照固定下来 | `offer-evaluation-model.test.ts` |
| 6 | 图片输入接入 OCR 和业务路由 | `server-image-intake.test.ts`、`jd-image-routing.test.ts` |
| 7 | 面试和画像进入可恢复状态与候选信号体系 | `interview-session-state.test.ts`、`profile-signal-verified-write.test.ts` |
| 8 | Admin run review 把运行偏差沉淀成 eval candidate | `agent-run-review.test.ts`、`admin-agent-reviews.test.ts` |

本章的核心不是讲 eval 概念，而是讲 Zhiyuan 这个求职助手项目如何把每条产品能力留下证据。后面的数据体系、页面联动、安全交付，都要继续沿用这些证据。
