# 生产问题 Eval Ledger（2026-09）

## 目的

这份清单把本轮发布、生产排障、真实界面验收和 Agent 回归中遇到的问题固定为可复跑的 eval。机器可读的唯一来源是 `src/__tests__/fixtures/production-incident-eval-manifest.ts`；本文件说明状态口径、证据要求和发布门禁。

它记录问题的原始观察和预期行为，不把“本地 Vitest 通过”写成生产已通过。隔离 QA 账号已提供，会话 147 已验证一次普通对话；完整生产旅程仍须保留截图、console/network 结果和只读 read-back。

## 状态口径

| 状态 | 含义 | 是否可作为发布通过 |
| --- | --- | --- |
| `covered` | 已有确定性测试绑定到 manifest 的 test marker | 只代表该层通过，仍需满足 manifest 的其他层 |
| `partial` | 有本地或内存级测试，但缺真实持久化、浏览器或生产证据 | 否 |
| `missing` | 已登记问题，但尚无足够的本地执行证据 | 否 |
| `manual` | 需要浏览器、网络、视觉或生产只读证据 | 否，直到报告落地 |
| `blocked` | 前置条件缺失，例如应用层 QA 账号、443 或 SSH 认证 | 否；必须保留阻塞原因 |

`releaseGate=hard` 的问题在 `partial`、`missing`、`manual` 或 `blocked` 时都会阻断发布结论。质量评分不能覆盖 owner、权限、Run/Gate 终态、Artifact、read-back、协议和投影不一致。

## 事故覆盖

### 发布、网络、认证和数据库

`RELEASE-001` 发布身份/源码/进程一致性；`RELEASE-002` 旧版本页面和缓存；`RELEASE-LOG-001` 历史发布版本可选择、查看专属日志并在刷新后保持选择；`RELEASE-MODEL-001` 发布切换前确认 Worker 模型密钥与共享配置；`RELEASE-ARTIFACT-001` release 压缩包污染源码；`DEPLOY-NET-001` SSH 认证前断开；`DEPLOY-HTTPS-001` 443/HSTS；`DEPLOY-HTTPS-002` 明文请求打到 HTTPS 端口；`DEPLOY-PORT-001` 38084 与 443 入口矩阵；`AUTH-ORIGIN-001` Request origin not allowed；`DEPLOY-DB-001` 备份、JD 匹配表、M5 记忆表、pgvector/HNSW 和增量迁移门禁。

`RELEASE-LOG-001` 现为 `partial`：本地页面测试覆盖版本选择和专属内容；仍缺生产浏览器截图、网络记录及前后导航证据。0.12.0、0.10.7 和 0.10.6 的确切生产发布日期没有可靠来源，页面不得编造。

### 登录页和全局视觉

`AUTH-UI-001` 登录页透明/半透明面板与背景层次；`UI-BG-002` 内部背景、白色卡片和文字对比度；`UI-SESSION-001` 历史会话真实切换；`CHAT-REPLY-001` 普通对话无回复；`CHAT-INPUT-001` 单次发送的乐观消息与持久化消息必须对账为一个气泡；`CHAT-REPLY-002` 空流、断流和 raw tool/DSML 泄露。

### JD、简历和评分页面

`JD-UI-001` JD 标题/描述可读性；`JD-UI-002` JD 正文完整拉取和滚动；`JD-UI-003` 已保存 JD 进入正确 Agent 上下文；`CV-PARSE-001` 工作经历与项目经历分栏，并区分解析、预览、保存、刷新四个阶段；`CV-UI-001` 历史版本全部可见；`CV-UI-002` 遮挡、空白和响应式布局；`SCORE-001` 五分制边界；`SCORE-002` 276 等异常派生值。

### Agent 运行时、会话和工具链

`PE2E-ROUTE-001` 至 `PE2E-ROUTE-005` 固定主意图、否定约束、材料引用、多轮 Task 归属，以及已有 JD 上下文下的简历提案不降级；`PE2E-EXEC-001` 至 `PE2E-EXEC-005` 固定 JD 报告、文件导出、岗位扫描、参考简历和发现岗位状态回写的执行/读回合同；`PE2E-GATE-001`、`PE2E-GATE-002` 固定 waiting_user 和 Gate approved 续跑；`PE2E-FLOW-001` 固定面试回答反馈和题号推进；`PE2E-QUESTION-001` 固定主问题/追问预算和安全收口；`PE2E-PERF-001` 固定长运行进度、超时和可恢复动作；`PE2E-UI-001` 固定 Gate denied 刷新投影；`PE2E-WAIT-001` 固定等待态输入和工具条；`PE2E-RESUME-READ-001` 至 `PE2E-RESUME-READ-003` 固定简历路径、JD 上下文和截图诊断；`PE2E-SESSION-002` 至 `PE2E-SESSION-005` 固定 requestId 幂等、迟到响应、历史切换刷新和 JD handoff 来源隔离；`PE2E-A2A-001` 固定主责交接、只读委派、child Run 归因和输出契约；`PE2E-WORKER-001`、`PE2E-WORKER-002` 固定 worker-only 所有权、lease 和 fencing；`PE2E-RUNTIME-001`、`PE2E-RUNTIME-002` 固定错误收口和永久失败。

`PE2E-UI-003` 至 `PE2E-UI-006` 固定报告卡完整正文、JD 分析面交互与可读性、简历提案分栏宽度，以及岗位确认卡在实时、读回和重放时的去重。`UI-EXEC-RESP-001` 固定窄屏执行态的纵向布局、控件换行和桌面回归；`UI-CONTRAST-001` 固定对话正文在品牌底图上的纸张层对比度。对应浏览器用例为 `CHAT-007`、`SCORE-007`、`PROPOSAL-004`、`SCAN-006`、`CHAT-010`、`CHAT-002`、`NAV-004`；本地回归通过仍不能替代生产页面截图和刷新证据。

### 模型、图片和记忆

`PE2E-MODEL-001` 至 `PE2E-MODEL-004` 固定 ModelGateway SSE/空 body/重试、模型链参数、deepseek-flash 统一入口和分类器失败回退；`PE2E-IMAGE-001` 固定图片视觉模型、结构化失败和文字继续；`MEMORY-001` 固定“我忘记了曾在某公司工作”不等于删除；`MEMORY-002` 固定引语、假设、JD/简历/面试材料不能直接成为活跃事实；`MEMORY-003` 固定关闭自动发现只清理未确认候选；`MEMORY-004` 固定行为信号低权重和 90 天复核；`MEMORY-005` 固定备份 30 天目标和恢复先重放清除；`MEMORY-006` 固定旧记忆按来源/置信度/敏感性保守迁移。

### 真实界面闭环

`RELEASE-UI-002` 固定应用层 QA 账号门禁，不能用 SSH root 凭据冒充应用登录；`FLOW-UI-001` 固定完整求职流程：登录、普通对话、岗位发现确认、扫描结果、JD 正文、匹配报告、简历读取、不落库草稿、历史切换和刷新，并验证 Agent → Worker → Agent 交接。两项现为 `partial`：账号已提供且普通对话已验证，完整旅程及独立证据仍缺失。

## 证据规则

每个 manifest 条目至少声明一种证据，P0/P1 条目必须声明生产证据清单。真实浏览器条目必须提供：

1. 操作前后截图，以及历史切换、刷新、Gate、导出等关键动作的截图。
2. 每个页面和交互后的 console/network 结果；流式、跳转和下载要有网络记录。
3. 只读数据库 read-back：session、Turn、Run、Event、Gate、Conversation Item、Artifact、版本/hash 和业务记录。
4. 清理结果：QA 会话、合成 JD/简历、Artifact 和候选数据不能污染真实用户数据。

失败项重试一次后仍失败才登记为 `failed`；缺少账号、443、SSH 认证或外部模型时登记为 `blocked`，不能用 API 200、本地 Vitest 或“看起来有回答”替代。

## 执行顺序

1. 先运行 `npx vitest run src/__tests__/production-incident-eval-manifest.eval.test.ts --no-file-parallelism`，确认 manifest 完整、ID 唯一、测试文件存在，且未把阻塞项标成通过。
2. 运行 `npm run e2e:agent`、`npm run lint` 和 `npm run build:production`，记录代码 SHA、版本、fixture、模型和工具版本。
3. 在隔离 QA 账号下按 `src/lib/agent/production-browser-eval-catalog.ts` 执行短链路和长链路，报告状态只能是 `passed`、`failed`、`blocked` 或 `not-run`。
4. 只有所有 `hard` 条目都有对应证据、状态不再是 `partial`/`missing`/`manual`/`blocked`，且没有 P0/P1 failed/not-run，才允许创建发布标签或切换生产 current。

## 关联规范

- [生产全量页面与对话旅程验收](feature-system/evals/29-生产全量页面与对话旅程验收-Evals.md)
- [Spec 06：评测回放与发布门禁](agent-system-specs/06-evaluation-replay-and-release-gates.md)
- [Spec 09：记忆准入与候选生命周期](agent-system-specs/09-memory-admission-and-candidates.md)
- [生产问题原始记录](agent-production-e2e-issues-2026-08-30.md)
