# Zhiyuan Evals 项目资产包

这个目录只收 Zhiyuan 求职助手项目里的真实 eval 资产。它服务第 22 章，用来把项目从 POC/MVE 到多 Agent runtime 的质量证据讲清楚。

## 为什么分成三包

Zhiyuan 的 eval 资产不是一次性写出来的，而是跟着项目生命周期逐步出现：

| 分包 | 来自项目哪个阶段 | 对应项目事实 |
|---|---|---|
| [边界 evals](边界-evals.md) | Agent 接入工具、记忆、写入、用户体系后 | 简历不能假保存，JD/Offer 不能串场，记忆不能跨任务跨用户，Admin 能力不能外泄 |
| [基线 evals](基线-evals.md) | POC/MVE 主链路成型后 | Agent Chat 23 个场景、JD 风险快照、AI 产品经理优秀简历记忆、Offer 评估、面试绑定 |
| [回归 evals](回归-evals.md) | run ledger、Admin 复盘和 eval candidate 出现后 | missing read-back、image intake skipped、resume write pollution、JD 部分写入等偏差被沉淀 |

这三个分包对应 Zhiyuan 的真实项目阶段。

## 资产索引

| 项目模块 | 真实文件 |
|---|---|
| Agent 主入口 | `scripts/eval-agent.mjs` |
| 记忆评估 | `docs/MEMORY_EVALS.md`、`src/__tests__/memory-eval-harness.test.ts`、`src/__tests__/fixtures/memory-eval-fixtures.ts` |
| JD 风险快照 | `test/snapshots/001-clean-jd.txt`、`002-suspect-jd.txt`、`003-scam-jd.txt`、`004-contract-trap.txt`、`005-mid-risk.txt` |
| JD 报告结构 | `src/__tests__/jd-evaluation-summary.test.ts` |
| JD 写入读回 | `src/__tests__/persist-eval-jd-verified-write.test.ts`、`scripts/check-jd-eval-partials.mjs` |
| 简历提案 | `src/__tests__/resume-save-guard.test.ts`、`src/__tests__/agent-runtime-regressions.eval.test.ts` |
| 优秀简历记忆 | `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`、`src/__tests__/reference-resume-vector.test.ts`、`src/__tests__/excellent-resume-patterns.test.ts` |
| Offer 评估 | `src/__tests__/offer-evaluation-model.test.ts`、`src/__tests__/offer-persistence-verified-write.test.ts` |
| 图片识别 | `src/__tests__/server-image-intake.test.ts`、`src/__tests__/jd-image-routing.test.ts` |
| 面试状态 | `src/__tests__/interview-session-state.test.ts`、`src/__tests__/interview-rebind-policy.test.ts` |
| 用户画像 | `src/__tests__/profile-signal-verified-write.test.ts`、`src/__tests__/profile-skill-quality.test.ts` |
| 工具治理 | `src/__tests__/agent-tool-governance.test.ts` |
| 记忆边界 | `src/__tests__/agent-memory-context.test.ts` |
| 用户隔离 | `src/__tests__/data-isolation.test.ts`、`src/__tests__/check-isolation.test.ts` |
| Admin 复盘 | `src/__tests__/agent-run-review.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`、`src/__tests__/jd-eval-partial-candidate.test.ts` |

## 课程使用方式

这个目录里的内容按项目链路使用：

- 讲 JD 评估时，用 `test/snapshots`、`jd-evaluation-summary.test.ts`、`persist-eval-jd-verified-write.test.ts`、`check-jd-eval-partials.mjs`。
- 讲简历产品时，用 `resume-save-guard.test.ts`、`agent-runtime-regressions.eval.test.ts`、优秀简历记忆相关测试。
- 讲记忆时，用 `docs/MEMORY_EVALS.md` 和 `memory-eval-harness.test.ts`。
- 讲 Offer 时，用 `offer-evaluation-model.test.ts` 和 `offer-persistence-verified-write.test.ts`。
- 讲 Agent runtime 治理时，用 `agent-tool-governance.test.ts`、`agent-memory-context.test.ts`、`agent-run-review.test.ts`。

第 22 章负责把这些资产串成产品生命周期，本目录负责保存每类资产的项目事实。
