# 纸鸢求职助手 · Agent 能力引入计划（2026-10）

本计划由 2026-10-01 架构评审（五候选全采纳 + 三轮决策对话）产出，覆盖 `0.13.0 → 0.14.0` 三个批次。决策依据见 ADR-0039、ADR-0040；词表增量见 CONTEXT.md（无人值守 Run、岗位精选、持续岗位发现修订）。

## 输入

- 架构评审报告（5 候选 + 内伤 2 项 + 暂缓清单）：`%TEMP%/architecture-review-20261001-063806.html`（临时产物；关键结论沉淀于本计划与两篇 ADR）
- 开源生态调研（2026-10-01，license 与 star 已核实）：Playwright MCP（Apache-2.0）、autoevals / @mastra/evals（MIT / Apache-2.0）、AI Elements（Apache-2.0）、Langfuse 数据模型（借形状）
- 代码事实探查（2026-10-01，dev @ c87f324）：部署拓扑、MCP 配置、Gate 决策 API、判官接口、model-gateway、scan_queue/唤醒、admin 事件流
- 实施规格：`docs/agent-system-specs/14–19`（本计划的逐项拆分，索引已更新）

## 事实基线（开工前已核实）

- 生产为阿里云 ECS 单机：Nginx + PM2（`zhiyuan-web` + `zhiyuan-agent-worker`）+ PostgreSQL，无 Docker（ecosystem.config.cjs:23-56，deploy/agent-runtime/release.sh）
- MCP 现状：活跃集成是三枚手写 shim（tools/index.ts:57-59，治理元数据显式）；自动注册链路 `registerMCPTools` 零调用方（mcp/tools.ts:7-21），`/api/agent/mcp/call` 为 410 桩；`mcp.config.json` 无 args 字段（config.ts:4-9），manager 只支持 `npx -y <package>` 且 connect 超时 8s（manager.ts:57-69）——Spec 16 需先复活注册链路并扩配置
- Run Gate 决策 API 仅 `{requestId, decision: approved|denied}`；scopeHash = sha256(toolName+args+risk)（run-gates/[id]/response/route.ts:14-16，run-gate.ts:3-11）
- 判官接口：`StagingJudgeInput/Result`（releaseAllowed、hardVetoes、dimensions）；A–H 门禁聚合在 `aggregateAgentReleaseGates`（eval-release-gates.ts:59）；eval 持久化函数（persistAgentEvalLayerResults 等）当前零调用方；hardVetoes 会经 `HARD_VETO_PATTERNS` 正则过滤（staging-judge.ts:34-50），自由文本 veto 有被静默丢弃的风险
- model-gateway 仅 deepseek 单模型，**无任何 token 用量记录**（model-gateway.ts:21-31）
- 生产网络白名单**不存在**（那个 TSV 只是访问日志）；浏览器域名清单需新建
- scan-worker 由 API 按次 spawn；Postgres 封锁已在 dev 修复（提交 50919be，scripts/scan-worker.mjs:239 `createPostgresScanStore`），`scan_worker_postgres_not_ready` 在 src/ 零命中——docs/feature-system/09 的封锁描述已过时
- agent-worker 轮询循环 1s（后台作业 + wake source），调度 tick 可挂进同一循环

## 三批总览

| 批次 | 主题 | 版本 | 内容 | 依赖 |
| --- | --- | --- | --- | --- |
| A | 能力 + 红线 | 0.13.0 | A0 嵌入门禁修复（Spec 14）；A1 质量评分器（Spec 15）；A2 浏览器工具（Spec 16） | — |
| B | 看得见 | 0.13.1 | B1 审批/工具卡视觉升级（Spec 17）；B2 trace 树与成本可见（Spec 18） | A |
| C | 主动性 | 0.14.0 | C1 岗位精选（无人值守 Run，Spec 19） | A |

纪律：每批一个分支（`batch-a/0.13.0` 等），批内每项跑全量 vitest + `npx tsc --noEmit`；批末全量测试 + 用户验收后合 dev；不主动推 GitHub。**无 feature flag**（沿用确定性门禁哲学，删除死 flag 文件）。每批按对应 Spec（`docs/agent-system-specs/14–19`）实施。

---

## 批 A · 能力 + 红线（0.13.0）

### A0 内伤修复（先行，半天）

1. `src/lib/memory/mastra-adapter.ts:60-74`：嵌入失败静默退回 mock 嵌入 → 显式失败（报错 + 记忆运行时门禁联动 `check:memory-release-gates`）。理由：不修它，A1 的检索类评测结果都不可信。
2. 删除 `src/lib/agent/feature-flags.ts`：`production-cutover.ts:2` 对其 `AgentFeatureFlagName` 枚举的依赖改为本地常量，cutover 运行时检查逻辑保留（决策 #15）；同步修正 `agent-feature-flags.test.ts` 与 `agent-production-cutover.test.ts`。

**门禁**：新增回归测试「嵌入失败必须可见」；全量测试绿（含 production-cutover 既有测试）。

### A1 质量评分器（1-2 天）

1. **自写最小 LLM 评分器**（faithfulness / 幻觉 / relevancy / factuality），判官调用经 model-gateway（deepseek）；prompt 底稿抄 autoevals（MIT）对应实现，不引入 autoevals 运行时依赖（决策 #13：npm 版不支持注入自定义客户端，绕网关的路线否决）。
2. 合成点：`judgeStagingOutput` 保持纯同步不变；评分器在 eval 编排层（`scripts/run-agent-eval.mjs` / eval 测试层）异步产出后并入 `StagingJudgeInput` 再聚合。
3. veto 约定：评分器只产出规范 veto 代码（`fabricated_experience`、`unsupported_claim`），不输出自由文本——`HARD_VETO_PATTERNS`（staging-judge.ts:34-50）会静默丢弃不含已知词根的自由文本；随本批扩展该正则增加 `unsupported.?claim` 词根。
4. 范围与力度（决策 #3/#5）：
   - **简历优化产物**：faithfulness + 幻觉检测 → 命中即 `releaseAllowed=false`（阻断）
   - **JD 评估摘要**：relevancy + factuality → 记录级（qualityWarnings）
5. 成本时序（决策 #14）：本批给 model-gateway 的 `complete()` 增加可选 usage 返回字段（ChatResult 扩展，additive），判官成本据此记录；全量采集（含 stream）留批 B（Spec 18）。
6. 分数写入既有 Eval Run 聚合（`aggregateAgentReleaseGates`）；顺手接线或删除零调用的 eval 持久化函数。

**门禁**：幻觉 fixture（编造工作经历）命中时 `aggregateAgentReleaseGates` 拒绝发布；veto 代码不被正则过滤器丢弃的断言；判官适配器单测；判官成本记录（实测回填本计划）。

### A2 浏览器工具（2-3 天）

1. **复活 MCP 注册链路**：`mcp.config.json` schema 扩展 `args`/`timeoutMs`；`registerMCPTools`（现零调用方）接入 worker 启动序列；启动健康断言——`npx -y` 冷启动超时必须显式告警落结构化日志，不得静默不注册。
2. `@playwright/mcp` 以 `--headless --isolated` 启动（stdio 子进程，Apache-2.0）；**跨 Run 隔离**：isolated 无持久 profile + worker 内浏览器工具串行锁，杜绝用户 A 页面状态漏进用户 B 的 Run（MCPManager 进程级单例，并发 2 下必须防共享）。
3. 显式治理元数据 + **封闭分级**：navigate/read/extract = 读（免门禁）；click/type/submit = 写（Run Gate）；**未显式分级的浏览器工具一律按写处理**；`browser_evaluate`（页面内任意 JS）本批不注册。
4. 新建 repo 级域名允许清单（TS 配置，PR 评审改）：初始条目为主流招聘站；清单外导航**直接拒绝**，不弹审批。
5. 内容通路：MCP `formatResult` 的 1000 字符截断对浏览器读结果放宽（单独预算，目标 20k 字符）；页面文本进模型上下文按「Run Context」预算治理、进界面按「安全工具视图」投影（决策 #16）。
6. 生产前置：确认 ECS chromium 就绪（`install:playwright`）与磁盘余量。

**门禁**：治理分级单测（读免写拦、未分级默认按写、`browser_evaluate` 不存在）、隔离单测（并发两 Run 不共享会话）、域名清单单测、白名单内 JD 页问答 e2e 冒烟（内容超 1000 字符仍可问答）、写动作弹 RunGateCard 的旅程 eval。

**批 A 验收**：全量测试绿；agent 能打开白名单内招聘页并据实回答；写动作出现在审批卡；幻觉用例阻断发布。

---

## 批 B · 看得见（0.13.1）

### B1 审批/工具卡视觉升级（1 天）

1. 抄 Vercel **AI Elements**（Apache-2.0，shadcn registry 分发即源码复制）的 Tool / Task / Reasoning / InlineCitation 组件进仓库，改纸鸢 paper 风格。
2. RunGateCard 升三态展示（pending / approved / denied）；工具卡对齐「安全工具视图」分级。
3. **不改审批 API**（改参重交明确排除，见决策 #7）。

### B2 trace 树与成本可见（2 天，ADR-0040）

1. model-gateway 全量记录 token 用量与延迟：complete 扩展批 A（Spec 15）的 usage 字段；stream 支持 `stream_options.include_usage` 并由网关解析末帧后透传；命名对齐 OTel GenAI（`gen_ai.*`）。
2. 新增 additive 表（Langfuse 形状）：trace → observations（span=Tool Attempt，generation=模型调用）；Run Evidence 事件映射进树。
3. admin 新增 trace 页（trace 树、token 成本、延迟）；生产**只存元数据**，正文仅开发环境。
4. 预留 OTel 形状导出点（将来接 Langfuse 只换 exporter）。
5. **保留期**（Spec 18）：trace 元数据 180 天（对齐 ADR-0012 Evidence 档）、开发环境正文 30 天（对齐 Payload 档）；到期清理挂既有 maintenance 定时器。

**门禁**：trace 投影单测；脱敏断言（生产模式下 trace 表查询不到简历正文字段）；complete 与 stream 两路径用量断言；真跑一次 run 后 admin 可见完整树与成本。

---

## 批 C · 主动性（0.14.0）

### C1 岗位精选（无人值守 Run，2-3 天，ADR-0039）

1. 新增 `scheduled_run` 表（additive schema）；agent-worker 循环内加调度 tick：Asia/Shanghai 周一 08:00；错过 24h 内补跑一次，超时跳过并在下次精选说明。
2. **系统发起的 Admission 入口**：ADR-0035 的 Admission 是 Turn 驱动 POST 路径；无人值守需新增系统发起入口——幂等键为 scheduled_run id，active-run 冲突时跳过本次并记录；复用同一 Admission 决策代码。
3. **岗位精选 Task Program 的完整涟漪**：新增 AgentTaskType 波及 `TASK_CONTRACT_POLICY`（tool-governance.ts:703-716）、相关工具 `allowedTaskTypes`、`TASK_LABELS` 与 `TASK_PROGRAM_REGISTRY` 的 version 字面量——变更单逐项列出；Program 无 clarify_or_gate 阶段（无人可澄清），阶段为 preflight → digest → persist → respond，成功出口 = digest 持久化（先例 file_export）。
4. 精选逻辑：只读既有机会池（扫描链路 Postgres 模式已在 dev 修复），产出「自水位线以来新增 Top 5 + 一句话点评 + 去重说明」（LLM 点评是输出不是写入）；水位线记录上次精选时间；无新增时明说并给放宽条件引导（不联动扫描）。
5. 投递（决策 #17）：首次精选时由**系统**创建常驻「岗位精选」对话（归属用户，求职旅程栏显示为持续旅程），digest 以 Conversation Item 卡片落进去；失败通知独立可见，静默失败视为缺陷。
6. 设置页开关/自定义频率：第二期（本批不做）。

**门禁**：调度补跑/跳过单测；系统发起 Admission 的幂等与冲突单测；只读契约单测（无人值守 Run 对全部写工具返回拒绝）；水位线确定性单测（Top 5 = 水位线后新增且未投递过，含跨周去重）；精选旅程 e2e；缺数据时的降级文案 eval。

**批 C 验收**：人为把 scheduled_run 提前到当前时刻 → 数分钟内「岗位精选」对话出现 digest 卡；期间任何写工具调用被拒；无新增机会时文案正确。

---

## 非目标

- **不动扫描链路本身**：Postgres 封锁已在 dev 修复（50919be），本计划不改变扫描进程行为。
- 不引入 autoevals / @mastra/evals 运行时依赖（评分器自写、prompt 抄 autoevals 底稿，MIT；决策 #13）。
- 审批卡「改参重交」API（需动 scopeHash 机制，单独设计轮）。
- Langfuse 自托管 / Langfuse Cloud（表形状已兼容，接时只换 exporter）。
- e2b/microsandbox 沙箱、supervisor 多 agent 框架、Temporal/Restate/Hatchet、CopilotKit、browser-use（评审已列暂缓理由）。

## 风险与依赖

- A1 判官调用对 Spec 18 trace 可见的前提是走 model-gateway（决策 #13 已定）；自写 scorer 的 prompt 抄 autoevals 底稿，语义需在 fixture 上校准。
- A2 生产浏览器：ECS 需常驻 chromium；Playwright MCP 每次导航的内存占用需在 worker concurrency=2 下压测；`npx` 冷启动需预热（构建后首启断言）。
- B1 AI Elements 组件绑定 Vercel AI SDK v5（`ai` 包）类型而仓库无 `ai` 依赖：抄组件后重接 Conversation Item 数据源，不引入 `ai` 包；ADR-0037 预告的 assistant-ui ApprovalCard 替换需在实现时保持卡片为 assistant-ui 兼容工具 UI，降低未来替换成本。
- B2 表形状一旦落数据即难改：DDL 评审在 openspec 变更单里过一遍再建表。
- C1 数据来源：扫描链路 Postgres 封锁已修复（50919be），机会池供给正常；剩余风险是扫描质量而非可达性。

## 决策记录（2026-10-01 两轮对话）

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 交付节奏 | 三批串行：A 能力+红线 → B 看得见 → C 主动性；0.13.0 / 0.13.1 / 0.14.0 |
| 2 | 浏览器治理 | 读免门禁、写过 Run Gate；新建 repo 域名清单，清单外直接拒绝 |
| 3 | 评分阻断策略 | 幻觉（简历类）阻断发布；JD 类记录级 |
| 4 | 判官模型与成本 | deepseek（现有唯一模型）；仅 eval 样本、发版前跑 |
| 5 | 可观测后端 | 降级为自家 PG 表 + admin trace 页，Langfuse 形状兼容；ADR-0040 |
| 6 | trace 脱敏 | 生产只存元数据，正文仅开发环境 |
| 7 | 审批卡 | 第一期只做视觉三态，不改审批 API |
| 8 | feature flag | 不新增；删除死 flag 文件 |
| 9 | 实施/验收 | 本机 dev worktree、每批一分支、全量测试、批末用户验收；不主动推 GitHub |
| 10 | 岗位精选形态 | 每周一 08:00（Asia/Shanghai）、Top5+点评、独立常驻对话；设置页第二期 |
| 11 | 精选数据源 | 只读机会池，不联动扫描；审查修正：Postgres 封锁已在 dev 修复（50919be） |
| 12 | 词表 | 新增 无人值守 Run、岗位精选；修订 持续岗位发现、安全工具视图分界 |
| 13 | 判官路径 | 自写最小评分器经 model-gateway，prompt 抄 autoevals 底稿；不引入其运行时依赖 |
| 14 | 成本时序 | 批 A complete() 加可选 usage；批 B 全量采集（含 stream） |
| 15 | flag 删除范围 | production-cutover 检查保留，枚举依赖改本地常量 |
| 16 | 页面内容治理 | 模型上下文按 Run Context（预算+第三方材料），界面按 安全工具视图 |
| 17 | 精选对话 | 首次精选时由系统创建常驻对话（归属用户） |

## ADR

- ADR-0039：无人值守 Run 与浏览器能力经既有接缝引入（Run Admission + 只读契约；MCPManager + 显式治理 + 域名清单）
- ADR-0040：agent trace 生产只存元数据（自家 PG、Langfuse 形状、OTel 导出点预留）

---

## 评审后批次（0.14.x，2026-10-02 定稿）

三批实现完成后经历双轴 code-review 与 eng review（含外部声音 10 项，6 项当场修复，`7bf223d`、`8a1e4cd`）。用户拍板的后续工作拆为 Spec 20–23，实施顺序：

1. **Spec 20 岗位发现卡片回放对账**（hotfix，用户可见缺陷：历史对话已完成搜索卡永远「运行中」——transcript 持久化瞬时状态且回放无 reconcile）
2. **Spec 21 精选送达才算成功**（reconcile 校验常驻对话确有 digest 落库，not_delivered 不推进水位线）
3. **Spec 22 MCP 子进程重连**（断连检测 → 清条目 → 单飞重连 → 重放调用）
4. **推送与打标签**（Q5）：上述完成后一次性推 dev、补 `v0.13.1`/`v0.14.0` 标签；生产部署手动走 release.sh（ECS chromium 核验需在场）
5. **Spec 23 扫码登录会话保持**（第二期第一个设计轮，`proposed`）：登录态是浏览器工具解锁招聘站内容的前置；开源验证过「扫码交接 + 加密 storageState」模式（MediaCrawler 证明可行但许可证禁止商用，只借模式）；设计轮先决：加密存储与密钥管理、登录态下的治理分级（是否全过 Gate）、会话过期与跨层清除

暂缓（决策 #4 修正）：评分器发版脚本显式接入与成本回填——vitest 门禁已真实阻断，等首次真实发版跑过 eval 再定。

### 决策记录追加（2026-10-02）

| # | 决策 | 结论 |
| --- | --- | --- |
| 18 | 精选假成功残余 | 修：reconcile 校验 digest 送达（Spec 21） |
| 19 | 浏览器登录墙 | 第一期保持匿名范围；扫码登录会话保持立为第二期设计轮（Spec 23）；开源模式已验证、MediaCrawler 代码因许可证不可用 |
| 20 | MCP 重连 | 修：断连检测 + 单飞重连 + 重放一次（Spec 22） |
| 21 | 评分器接入点 | 暂缓（vitest 门禁已足够） |
| 22 | 推送时机 | Spec 20-22 完成 + 全量绿后一次性推 dev + 补标签；生产部署手动 |
| 23 | 搜索卡片缺陷 | hotfix 优先于一切增强项；修复面 = 回放对账 + 渲染兜底（Spec 20） |
