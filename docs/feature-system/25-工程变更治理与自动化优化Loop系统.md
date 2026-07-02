# 工程变更治理与自动化优化Loop系统的产品构造

工程变更治理与自动化优化Loop不是求职者直接使用的功能，而是纸鸢在0-1产品成型后维持质量、发现回归、沉淀修复证据的内部系统。它把需求、实现、测试、运行证据、复盘和自动巡检连接起来，避免产品功能越做越多后失去可验证性。

## 1. 产品定位

纸鸢当前不是单页Demo，而是包含JD评估、图片识别、简历优化、优秀简历记忆、画像、面试、Offer、投递、后台、PostgreSQL、Agent工具治理和多用户隔离的完整系统。任何一次修复都可能影响多个链路：修OCR可能影响JD评估，修简历保存可能影响参考简历记忆，修Agent路由可能影响Offer和面试。

工程治理系统承担三类职责：

| 职责 | 项目事实 | 产品价值 |
|---|---|---|
| 变更约束 | `openspec/specs/*`、`openspec/changes/*`、`openspec/plans/*` | 把需求、设计、验收和任务边界沉淀下来 |
| 质量验证 | `src/__tests__/*`、`scripts/check-*`、`npm run eval:*` | 把关键流程转成可重复验证 |
| 自动巡检 | `skills/agent-system-optimization-loop/SKILL.md`、`skills/agent-system-optimization-loop/STATE.md`、Codex automation memory | 定期发现Agent系统、数据层和运行环境问题 |

这套系统的目标不是“写更多文档”，而是让每个重要变更有事实来源、有验证入口、有状态记录。

## 2. OpenSpec承接的产品事实

OpenSpec记录纸鸢功能从构想到实现的边界。当前`openspec/specs`覆盖了大量产品能力，例如：

| 方向 | 典型spec |
|---|---|
| Agent系统 | `agent-orchestrator`、`agent-tools`、`agent-tools-api`、`agent-registry`、`agent-memory`、`agent-resume-routing` |
| JD评估 | `jd-smart-evaluate`、`jd-evaluation-ui`、`jd-library-storage`、`jd-report-association`、`eval-ocr-input`、`ocr-api` |
| 简历 | `cv-ai-tailor`、`cv-file-import`、`cv-optimization-ui`、`cv-upload-ui`、`cv-version-diff` |
| 画像 | `career-profile`、`career-profile-ui`、`agent-profile-sop`、`agent-signal-auto-extraction` |
| 面试 | `interview-ai-coach`、`interview-coach-chat`、`interview-prep-ui`、`interview-practice-record` |
| 投递与分析 | `application-tracker-ui`、`analytics-ui`、`homepage-dashboard`、`homepage-news-feed` |
| 数据层 | `data-rest-api`、`postgres-pgvector-foundation`、`postgres-data-cutover` |

已存在的change也覆盖了关键工程修复，例如`add-agent-run-review-loop`、`add-memory-eval-harness`、`add-memory-governance-ui`、`add-postgres-pgvector-foundation`、`add-vector-long-term-memory-store`、`govern-jd-orphan-report-reconciliation`、`fix-resume-query-readonly-contract`、`regularize-agent-mcp-connectors`。

这些OpenSpec不是旁支材料。它们让产品问题可以被转成有边界的工程变更：影响哪些能力、允许做什么、不允许越过什么、验收看哪些证据。

## 3. 变更闭环

纸鸢的工程变更闭环是：

```text
产品问题或新能力
  -> OpenSpec记录需求、边界、任务和验收
  -> 代码实现页面、API、Agent工具、数据层或治理链路
  -> 单元/集成/eval覆盖主路径和边界
  -> gstack/浏览器验证真实页面行为
  -> Agent Run Review沉淀运行失败
  -> 自动优化Loop读取状态并选择下一批高优先级问题
  -> STATE.md和automation memory写回
```

这个闭环保证“修了”不是口头状态，而是能在代码、测试、运行台账、状态文件里找到对应证据。

## 4. Eval体系的真实沉淀

项目已经沉淀了大量eval和测试，不需要在无事实处编造。可以按三类理解：

### 基线eval

基线eval证明主流程能跑通：

| 能力 | 测试/脚本 |
|---|---|
| JD评估写入 | `persist-eval-jd-verified-write.test.ts` |
| Offer评估 | `offer-evaluation-model.test.ts`、`offer-flow.test.ts` |
| 简历提案 | `resume-edit-proposals-route.test.ts` |
| 优秀简历记忆 | `excellent-resume-memory-evolution.eval.test.ts` |
| 记忆检索 | `memory-eval-harness.test.ts` |
| PostgreSQL健康 | `npm run check:postgres` |

### 边界eval

边界eval阻止错误输入、越权和误路由：

| 风险 | 测试/脚本 |
|---|---|
| JD/Offer/简历图片混淆 | `jd-image-routing.test.ts`、`server-image-intake.test.ts` |
| 缩略图误评估 | `image-thumbnail-guard.test.ts` |
| 工具越权 | `agent-tool-governance.test.ts` |
| Agent任务漂移 | `agent-task-routing.test.ts` |
| 私有参考简历跨用户 | `reference-resume-vector.test.ts`、`memory-eval-harness.test.ts` |
| 用户数据隔离 | PostgreSQL repository与cutover检查 |

### 回归eval

回归eval防止修复后再坏：

| 回归点 | 测试/脚本 |
|---|---|
| JD部分写入孤儿报告 | `scripts/check-jd-eval-partials.mjs`、`jd-eval-partial-candidate.test.ts` |
| Agent Run复盘 | `agent-run-review.test.ts`、`agent-run-review-trigger.test.ts` |
| 文件导出读回 | `file-export-verified-write.test.ts` |
| 画像信号噪音 | `profile-skill-quality.test.ts`、`profile-signal-verified-write.test.ts` |
| 记忆反馈排序 | `memory-feedback-promotion.test.ts` |
| 数据迁移 | `sqlite-postgres-migration.test.ts`、`postgres-repository-routing.test.ts` |

这些eval把产品事实转成可验证样本：主流程是否跑通，边界是否挡住，修复是否长期有效。

## 5. Agent Run Review闭环

Agent Run Review是工程治理和产品体验之间的桥。它把一次Agent运行拆成run、step、verifier、error和review。

复盘可识别的失败包括：

| failure type | 产品意义 |
|---|---|
| `routing_error` | 用户意图被路由错 |
| `tool_contract_mismatch` | 工具治理和任务契约冲突 |
| `missing_readback` | 写入/导出/admin动作缺少读回 |
| `partial_write` | 多表写入只完成一部分 |
| `image_intake_failure` | 图片识别或路由失败 |
| `guided_task_drift` | 引导任务上下文漂移 |
| `resume_write_pollution` | 简历写入混入说明性文本 |
| `profile_signal_noise` | 画像信号质量不足 |
| `memory_governance_failure` | 记忆治理或索引状态异常 |

复盘结果进入`agent_run_reviews`，可转成`agent_eval_candidates`。Admin可以接受、拒绝或提升候选，让运行时失败变成后续验证资产。

## 6. 自动优化Loop运行事实

`skills/agent-system-optimization-loop/STATE.md`是当前Loop状态源。它记录了自动化健康、运行环境、轮转池、已知问题、最近运行和验证结果。

当前STATE里明确记录：

| 项 | 状态 |
|---|---|
| 自动化节奏 | 每2小时，`FREQ=HOURLY;INTERVAL=2` |
| 官方cron健康 | 2026-06-19 00:01 scheduled run已证明有assistant/tool/token事件和状态写回 |
| 运行目标 | Agent Chat稳定性、跨页面数据控制、工具正确性、治理可见性、易用性 |
| 数据库目标 | PostgreSQL with pgvector |
| 环境要求 | `DB_DRIVER=postgres`、`DATABASE_URL`配置 |
| SQLite角色 | fallback、migration、archive only |
| MCP状态 | 有MCP manager、`mcp.config.json`、`/api/agent/mcp/call`，但无PostgreSQL只读DB MCP连接器 |

Loop记录过一次真实P0：自动化会创建后台session但空跑，`assistantEvents=0`、`toolEvents=0`、`tokenEvents=0`、`lastAgentMessage=null`且无状态写回。后续通过官方scheduled run证明启动活性后，5分钟探针不再需要，但仍保留“不能用fallback成功冒充official cron健康”的原则。

## 7. Discovery snapshot

Loop的正式运行必须先做discovery snapshot，而不是直接挑一个问题修。STATE要求覆盖：

| 来源 | 作用 |
|---|---|
| `state_backlog` | 已知P0/P1/P2问题 |
| `ci_failures` | CI或本地替代验证状态 |
| `new_commits` | 最近变更影响面 |
| `eval_failures` | 当前失败测试和脚本 |
| `eval_candidates` | 待处理失败样本 |
| `agent_run_ledger` | 最新run/review/step证据 |
| `user_reported_regressions` | 用户报告的问题 |
| `environment_health` | Postgres、cutover、页面可访问性、浏览器工具状态 |

如果某个来源不可检查，要记录为unavailable并写证据，不能静默跳过。

## 8. 当前未关闭问题

STATE记录过的高优先级问题包括：

| 问题 | 状态 |
|---|---|
| `jd_eval_partial_linkage` | 4个孤儿JD评估报告没有关联JD记录，`repairable=0`，需要受治理修复 |
| `agent_run_ledger_truthfulness` | run/review/eval candidate仍有缺读回、路由错误、任务漂移样本 |
| `memory_governance_feedback` | 存在resume edit memory governance failure候选 |
| `docs_sqlite_postgres_drift` | 部分文档仍有SQLite canonical旧表述 |
| `regularize-agent-mcp-connectors` | MCP数据库证据连接器仍待评审和实现 |
| `gstack/browser` | 浏览器审查曾因`Cannot find server.ts`阻塞 |

这些问题不能靠一份状态文档宣称已修复。只有当代码、测试、读回、OpenSpec和状态写回都闭环时才算关闭。

## 9. 变更门禁

工程治理系统有几条门禁：

1. 数据修复不能盲写，必须有dry-run、确认、读回和可回滚证据。
2. Agent写入类修复必须经过任务契约和工具治理。
3. OpenSpec用于中等及以上变更，尤其涉及数据、Agent、权限、迁移和安全边界。
4. gstack/浏览器证据用于验证真实页面行为，但不能替代单元测试和数据读回。
5. Eval候选被接受或提升后，仍需开发者显式纳入测试，不自动修改代码。
6. 自动化Loop的成功必须看官方run本身是否有assistant/tool/token事件和状态写回。

## 10. 验收口径

工程变更治理与自动化优化Loop的验收看：

1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。
2. 核心产品链路有基线、边界、回归验证。
3. Agent运行能沉淀run、step、review和eval candidate。
4. 读写类任务失败时不能冒充成功。
5. 数据修复类任务有dry-run、verify和读回。
6. 自动化Loop每次正式运行都写回`STATE.md`和automation memory。
7. 探针成功不能冒充官方cron健康。
8. 未关闭P1/P2问题必须留在STATE，不因单次局部通过而消失。
