# 基线 evals

基线 evals 记录 Zhiyuan 项目主链路已经具备的首版能力。这里按项目已有稳定样本、脚本和业务断言展开。

## Agent Chat 基线

`scripts/eval-agent.mjs` 是 Agent Chat 的主入口基线。它把用户会在求职助手里说的话整理成 23 个场景。

| case 范围 | 场景 | 项目能力 |
|---|---|---|
| 1-3 | 参考简历 | 读取 profile、文件和 reference detail |
| 4-5 | 我的简历和画像 | 查询当前简历、个人画像和 profile insights |
| 6-7 | 文件读取 | 读取 `cv.md`、`config/profile.yml` |
| 8-9 | JD 评估 | 粘贴 JD 或招聘链接后进入 JD 评估工具 |
| 10-12 | 搜索 | 查询薪资、深圳 AI 公司、近期 AI 产品经理岗位 |
| 13-14 | 闲聊和非求职问题 | 不强行调用业务写入工具 |
| 15 | 自我定位 | 进入 self positioning |
| 16 | 投递记录 | 查询 applications |
| 17-20 | 负向输入与参考简历追问 | 拒绝敏感路径、无效文件、虚构删除工具，并支持参考简历技能追问 |
| 21-23 | 恢复类负向输入 | 对缺失文件、敏感路径、清理数据请求保持永久失败或拒绝 |

这个文件还沉淀了 10 个指标：工具选择、参数、首次调用、幻觉工具、重试、错误恢复、任务完成、上下文效率、停止时机、延迟。课程里把它作为 Agent Chat 从 demo 进入 runtime 的第一张能力表。

## JD 评估基线

JD 评估基线由快照和报告摘要两部分组成。

### 5 个 JD 快照

`test/snapshots` 里的 5 个文件是 JD 风险样本库：

| 文件 | 用在项目里的位置 |
|---|---|
| `001-clean-jd.txt` | 作为正常 JD 的低风险参照 |
| `002-suspect-jd.txt` | 作为可疑表达的风险参照 |
| `003-scam-jd.txt` | 作为招聘骗局/高风险参照 |
| `004-contract-trap.txt` | 作为合同和用工陷阱参照 |
| `005-mid-risk.txt` | 作为中间风险评分参照 |

这些快照支撑 JD 评估页和 Agent Chat 里的 “这个岗位能不能投” 判断。

### A-G 报告结构

`jd-evaluation-summary.test.ts` 固定了报告摘要输出。项目要求 JD 评估结果包含：

- A 职位概览。
- B 简历匹配。
- C 职级与策略。
- D 薪资与市场。
- E 定制化方案。
- F 面试准备。
- G 职位合法性。
- 行业黑话 / 风险扫描。

这个测试还明确过滤“作为 AI 求职评估引擎”“修改前/修改后表格”等串场内容。课程里可以用它讲：Zhiyuan 的 JD 报告不是简历改写结果，也不是模型自我介绍，而是固定结构的求职决策材料。

## 简历与优秀简历基线

当前简历的基线来自 `resume-save-guard.test.ts` 和 `agent-runtime-regressions.eval.test.ts`：

| 能力 | 项目表现 |
|---|---|
| 读取当前简历 | 用户问当前简历时只读 |
| 创建修改提案 | 用户明确要改 section 时创建 proposal |
| 应用提案 | 用户确认后按 proposal id 应用 |
| 回滚提案 | Agent 页面保留最近一次 applied proposal |
| 刷新恢复 | 刷新后还能根据 proposal id 继续处理 |

优秀简历基线来自 `excellent-resume-memory-evolution.eval.test.ts`、`reference-resume-save-flow.test.ts`、`reference-resume-vector.test.ts` 和 `excellent-resume-patterns.test.ts`：

| 能力 | 项目表现 |
|---|---|
| 粘贴优秀简历 | 可识别 AI 产品经理角色类别并保存为 private reference |
| 截图优秀简历 | OCR 后保留简历文本，缺少类别时追问 |
| 非简历截图 | JD、Offer、聊天截图不会进入优秀简历保存 |
| 向量召回 | AI 产品经理 JD 能召回同角色参考简历 |
| pattern 抽象 | 抽取结构和表达模式，不复制候选人姓名与完整成果句 |

这两条简历基线共同支撑 Zhiyuan 的简历产品：既能处理当前 CV，又能从优秀简历记忆里学习表达结构。

## 记忆基线

`docs/MEMORY_EVALS.md` 指向 `npm run eval:memory`。这条命令运行 `memory-eval-harness.test.ts`，项目里用本地 fixtures 和确定性 keyword embeddings 验证记忆能力。

| 记忆能力 | 项目里的具体证据 |
|---|---|
| AI 产品经理 wedge | fixtures 包含 AI PM 简历、目标 JD、用户项目段落 |
| 召回命中 | target JD + user resume section 能召回 reference 101 |
| 质量提升 | memory output 分数高于 no-memory output |
| 不照搬原文 | copy overlap 低于阈值 |
| 用户隔离 | user-b 的 private reference 不出现在 user-a 召回 |
| 团队共享 | approved team reference 可以被使用 |
| 反馈排序 | accepted snippet 排名上升，rejected snippet 排名下降 |
| embedding 失败 | chunk 保留，reindexable hash 留存 |

课程里把这部分放在“记忆与工具”之后讲，能说明 Zhiyuan 的记忆不是概念，而是已经有 AI 产品经理简历优化的稳定样本。

## Offer 评估基线

`offer-evaluation-model.test.ts` 和 `offer-flow.test.ts` 把 Offer 评估固定成一个中国求职场景下的决策模型。

| Offer 变量 | 项目里的影响 |
|---|---|
| 社保公积金基数 | minimum-base 的税费和保障风险高于 full-salary |
| 用工形态 | outsourcing、dispatch 的 benefits/stability 风险高于 direct hire |
| 奖金确定性 | variable-only bonus 且无 guarantee wording 时风险上升 |
| 信息缺失 | incomplete offer 仍保存 preliminary report，并暴露 missing info |
| 报告快照 | 源 offer 编辑后，已保存 report snapshot 不变 |

这部分是课程里讲 Offer 产品页时的重要材料：Offer 评估不是聊天建议，而是薪酬、福利、合同、稳定性和谈薪问题的结构化报告。

## 面试基线

面试基线来自：

- `interview-session-state.test.ts`
- `interview-rebind-policy.test.ts`
- `interview-prep-ui.test.ts`
- `agent-chat-interview-binding.test.ts`

项目里的面试能力不是一次性生成一堆题，而是围绕 JD、报告、简历和 memory context 创建 session。测试里可以看到 session 带 `jdId`、`reportNum`、`jdText`、`cvText`，推进问题后仍保留 source binding。

这部分要和产品生命周期里的“JD 评估 -> 简历优化 -> 面试准备”连起来讲。面试 agent 不是单独模块，它依赖前面沉淀的 JD 和简历证据。

## 用户画像基线

画像基线来自：

- `profile-skill-quality.test.ts`
- `profile-signal-verified-write.test.ts`
- `agent-memory-context.test.ts`

项目里的画像能力包含两个层次：

| 层次 | 项目表现 |
|---|---|
| profile signal | 用户表达先成为 `profile_signals`，带 source、type、content、confidence |
| profile skill | 用户确认 skill signal 后，再进入 profile skills |

这条基线对应自我定位和个性化求职建议。画像不是一次对话里随便改出来的，而是有信号、确认和读回。

## 基线资产在课程中的位置

| 课程阶段 | 使用的项目基线 |
|---|---|
| POC 验证 | JD 快照、Agent Chat JD case、简历读取 case |
| MVE 设计 | JD 评估 -> 简历提案 -> 面试准备 |
| 多页面开发 | Reports、CV、Offer、Interview 页面承接的数据对象 |
| Agent 化重构 | `scripts/eval-agent.mjs` 的 23 个入口场景 |
| 记忆与工具 | `npm run eval:memory` 和优秀简历记忆 fixtures |
| 数据体系测试 | JD/Offer/Profile 的 read-back verified writes |

这些都是 Zhiyuan 项目里的实际材料，可以直接作为课程讲义里的主链路证据。
