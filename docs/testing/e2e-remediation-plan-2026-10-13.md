# 线上 E2E 失败修复方案

日期：2026-10-13。状态：D1–D10 已确认，方案与 Spec 审查完成，首批实施中；尚未发布或部署。代码、验证和剩余范围见 [首批实施进度](spec40-implementation-progress-2026-10-13.md)。

## 1. 目标与证据基线

修复线上 0.13.2 已确认的 67 个问题，并补完既有 392 项 E2E 规范的完整验收。交付标准是业务输出、状态、归属、持久化、恢复与禁止副作用同时正确，不能用按钮可点击、工具 success 或一张截图代替。

| 基线 | 数量 / 状态 |
| --- | --- |
| 已确认去重问题 | 67：P0 5、P1 44、P2 18 |
| 规范 ID | 392：AgentChat 222、其他页面 170 |
| 原审计状态 | pass 0、fail 117、partial 229、blocked 44、not_run 2 |
| 原始观察 | 1727 条；已排除 92 条 harness / 错误判据 |
| 工具审计 | 55 个静态工具；41 个有调用/结果、34 个至少一次 reported success、14 个未见结果 |

67 个问题与 117 个失败 ID 是不同口径。原审计完整通过为零，表示完整参数与证据尚不足，不能解读为每个正常子分支都失败。本方案不重写历史结果；修复后的证据形成新 Eval Run 与覆盖快照。

依据：[生产报告](production-e2e-report-2026-10-12.md)、[67 项问题及复现证据](../../.e2e/production/confirmed-issues-audit.md)、[392 项覆盖账本](../../.e2e/production/coverage-audit.json)、[剩余验收范围](../../.e2e/production/remaining-safe-coverage.md)、[通用验收标准](e2e-acceptance-standard.md)。原始证据可能含测试身份与原文，仅共享脱敏报告。

## 2. 已确认决策与设计树

用户在第一轮已确认以下三个决定：

| 决策 | 已确认内容 | 影响 |
| --- | --- | --- |
| D1 发布节奏 | 分批修复、验收；按 ADR-0022 在 B5 统一正式生产切换 | B0–B4 各有独立内部/预生产验收与 canary 门槛；B5 一次完成生产切换并关闭全部 67 项 |
| D2 最终验收 | 修复 67 项并补完 392 项规范 | 原 partial / blocked / not_run 均须有后续处置，不能默认通过 |
| D3 历史数据 | 包含只读排查与逐批确认的数据处理 | 先形成受影响清单；缺来源记录复核，保留原始证据 |

第二轮已确认以下三个决定：

| 决策 | 已确认内容 | 影响 |
| --- | --- | --- |
| D4 旧缓存 | 隔离保留；只有可证明属于当前账号的数据自动迁移 | 旧无 owner 缓存停止业务读取，提供人工恢复；升级不能静默清空未同步资料 |
| D5 统计主口径 | 主图显示当前阶段分布，历史到达漏斗单独显示且只统计有事件证据的记录 | 拒绝、放弃、跳过不能凭当前状态推成 Offer；旧记录缺事件显示资料不足 |
| D6 未知 Offer 条件 | 允许明确标注假设的税后估算 | 原文事实、未知项、计算假设分区展示；假设不写入 Offer 事实，确定现金与非保证奖金分列 |

第三轮已确认以下四个决定：

| 决策 | 已确认内容 | 影响 |
| --- | --- | --- |
| D7 历史修复权限 | 仅证据充分且可逆的记录自动修正，其余逐条确认 | 合成/测试数据可走可回滚 patch；真实数据生成清单逐条确认；无法证明只标需复核 |
| D8 定位证据展示 | 界面显示简短来源标签，并可展开完整证据 | 定位结论区分用户陈述、推断和示例；source quote/evidence ID 可审计 |
| D9 Offer 对比入口 | 加入幂等对比集合并进入 Offer 工作台 | 不自动评估、不改投递状态；重复点击不增成员，目标 application/report 可读回 |
| D10 Agent 质量门禁 | 按任务风险使用固定 rubric 和最低分 | 关键任务低于阈值阻断；辅助任务降级并明确告知；确定性错误始终硬失败 |

设计树按前置依赖推进：已确定范围、批次和历史处理原则 → 确定无归属浏览器旧数据、统计口径、未知薪酬的产品行为 → 固定迁移策略与数值 oracle → 确定完整验收资源、发布观测与回滚 → 用户确认共同理解后实施。

已有 ADR 的要求直接继承，不重复向用户征求是否保留：服务端简历真源、Worker 转录单写者、持久 continuation inbox、精确 Run Gate、合法主责交接、研究委派只读、敏感记忆用途确认、面试状态单写者、事实门，以及 ADR-0022/0026/0029 要求的单次生产切换、Worker 唯一执行所有者、非终态旧 Run 原 ID 就地迁移与证据重验证。

## 3. 修复工作包与依赖

工作包是技术归属，不改变问题的唯一计数。每个包都必须有单元/集成回归和至少一条真实浏览器闭环；包间按依赖顺序执行。

| 包 | 范围与主要问题 | 根因置信度 | 依赖与交付 |
| --- | --- | --- | --- |
| W01 账号、认证与本地数据 | ISS-021、033、046、047、048 | 高：缓存无 owner、清除未覆盖/未等待；中：公开 CSRF 入口细节 | 先做 owner namespace、旧缓存隔离迁移和清理清单，再处理公开找回与导入/设置校验；提供迁移 dry-run 和回滚快照 |
| W02 Runtime、合同与上下文 | ISS-019、022、023、036、042、053、054、056、065 | 高：合同完成条件和 envelope 约束不完整、委派 ID 两次取时间、附件分支绕 Worker；ISS-008/013 局部仍待定位 | W02 提供 W03/W04 所需的基础 admission、continuation、contract 和 evidence 接口；W03/W04 依赖这些接口，附件具体实现由 W04 完成，避免循环依赖；统一 admission→contract→tool result→completion，补 continuation inbox、handoff/delegation、来源引用和禁止写入 |
| W03 面试持久引擎 | ISS-001 | 高：聊天正则推题与 ADR-0044 冲突，控制指令被答题流消费 | 依赖 W02 continuation；让 durable interview engine 成为唯一写者，questionGraph 只投影 |
| W04 Transcript、附件、渲染与语音 | ISS-025、034、052、055、062，并协作支撑 ISS-020/045/051/064 | 高：前端 optimistic 分支未落 Worker、renderer 未做安全投影；语音播放 Promise 未处理 | 依赖 W02 的 transcript/Conversation Item 契约；实现 attachment turn、owner-safe projection、composer/scroll 状态与 Audio fallback |
| W05 CV、版本、导入与参考材料 | ISS-006、007、024、027、029、030、032、067 | 高：服务端投影/hash 分裂、图片 schema 丢姓名、proposal 直接变更 active、参考 pending 源未锁定；ISS-007 模型质量根因已定位 | 依赖 W02 的 artifact/gate；统一 resume document/version/hash，事实门保持 hard veto，参考保存从 sourceArtifactId 构建并读回 |
| W06 JD、定位、报告与薪资单位 | ISS-003、013、035、039、050、063，并协作支撑 ISS-019 | 高：定位硬编码 assistant/example，薪资 seed 单位错配，报告正文解析静默降级；ISS-013 取版/截断待审计 | 依赖 W02 context/source evidence；先 source hash 审计再改报告生成；所有定位结论附用户可见来源标签及可展开 source quote/evidence ID |
| W07 记忆、事实与召回 | ISS-008、028、057、059 | 高：embedding 失败禁用结构化 fallback、敏感薪资正则不全；ISS-008 SQL 具体错误待隔离复现 | 依赖 W02 context 和 W01 owner ACL；补 lexical/SQL governed fallback、typed error、事务回滚、用途确认 |
| W08 投递、提醒与跨页动作 | ISS-004、005、018、037、038、061，并协作支撑 ISS-020 | 高：round/follow-up 复用 notes/status no-op、ID 类型错误、Offer 对比按钮为空 | 依赖 W01 owner、W02 handoff；先确定实体 API 与幂等，再做 URL/状态/提醒/Offer 对比跨页闭环；Offer 入口只建对比成员并导航，不自动评估或改阶段 |
| W09 分析与周报 | ISS-009、010、011、026、058 | 高：STATUS_ORDER 终态累计、固定拒因比例、8周常量、错误当空态 | 依赖 W08 权威申请/事件和 W01 error-state；先固定数值 oracle，再生成 AI 周报 |
| W10 岗位发现 | ISS-012 | 高：扫描 Worker 使用默认公司集合而非冻结输入 | 依赖 W02 task envelope；冻结输入快照、接管/重试不扩展集合 |
| W11 页面交互、布局与治理 | ISS-002、014、015、016、017、041、043、044、045、049、051、060 | 高：Radix primitive、ID 类型、`||` 默认、overflow、无 label、无确认；数据读失败状态需与空态分离 | 依赖 W01/W04/W08 的 API 状态；最后做响应式、焦点、可访问性与 admin 破坏性动作；无 owner 旧缓存只在隔离恢复界面出现 |
| W12 Offer 数据模型与比较 | ISS-040、066 | 高：`true/7/3` 分散默认存在 parser、service、row 映射 | 依赖 W02 合同约束；贯通 nullable/unknown、字段来源、确定现金/奖金风险和假设估算 |
| W13 ASR/TTS | ISS-031、064（跨包） | 高：静音未做有效 PCM 判定，Audio.play rejection 未投影 | 依赖 W04 transcript/voice state；先供应商响应分类，再做浏览器媒体回归 |

完整问题→工作包→规范 ID→验收断言见 [逐项修复与回归矩阵](e2e-remediation-matrix-2026-10-13.md)。

### 3.1 首轮源码落点

以下是已经从当前源码和证据核对出的首轮落点。它们是实施入口，不是已经完成的修复；新增文件必须继续沿同一领域边界放置。

| 工作包 | 当前落点 / 符号 | 已知根因或需要先验证的边界 |
| --- | --- | --- |
| W01 | `src/app/settings/page.tsx`、`src/lib/db.ts`、本地 profile/session repository、认证找回 API | `clearAll` 未覆盖全部本地表且未等待；本地资料没有 owner namespace；公开找回先访问登录 CSRF。先设计版本化迁移和匿名请求保护。 |
| W02 | `src/lib/agent/task-contract.ts`、`src/lib/agent/loop/server-runner.ts`、`src/lib/agent/runtime/*`、`src/lib/agent/continuation*`、`src/lib/agent/tools/action/delegate-research.ts`、`src/app/api/agent/run/route.ts`、`deploy/agent-runtime/*` | 合同按粗 taskType 判完成，`read_offer_report`/HR/谈薪无法满足 Offer 派生交付；导入被要求 resume_edit 全链；ISS-022 在 `server-runner.ts` 分别取 `Date.now()` 生成 started/finished ID；ISS-065 未把 envelope constraints 传入重建合同。先统一目标操作、完成事实和来源引用；同时按 ADR-0026 preflight 确认 `AGENT_RUNTIME_MODE=worker_all`、directMode/legacy endpoint 不可达且旧 client/remote runner 无生产 ownership，保留 SHA 与 HTTP 410/拒绝证据。 |
| W03 | `src/lib/agent/interview/engine.ts`、`src/lib/agent/interview-session-state.ts`、`src/lib/agent/runtime/execution-session-service.ts`、`src/lib/agent/runtime/server-context-directives.ts` | ADR-0044 要求 durable engine 单写者，但旧 questionGraph/文本兜底仍可创建 main 题；控制指令必须在 `answerTurnIds` 之前分类并改变 phase。 |
| W04 | `src/lib/agent/sessions.ts`、`src/components/agent/use-agent-conversation.tsx`、`src/lib/agent/item-projection.ts`、surface/security projection、附件 intake 与 Audio 播放组件 | `updateSession` 不写 messages，前端附件分类直接结束；仅图片不计入 composer attachments；renderer 会显示 reasoning/DSML；播放 Promise rejection 未投影。保持 Worker 单写者，增加稳定 item/来源和错误状态。 |
| W05 | `src/lib/server/resume-import-service.ts`、`src/lib/server/resume-optimization-service.ts`、`src/lib/judge-engine.ts`、`src/lib/agent/resume-edit-proposals.ts`、CV projection/API、reference save action | 图片 schema 可能把 name 放在错误层；优化 prompt 强制补数字且 faithfulness veto 后泛化报错；proposal 应用直接改 active；GET projection 与 `cv_data` hash 分裂；reference verifier 只校验 id/role/name 且 API 先写后验。 |
| W06 | `src/lib/agent/career-positioning-result.ts`、`src/lib/agent/profile-sop.ts`、`src/lib/server/jd-evaluation-service.ts`、salary benchmark store、reports projection | 定位把 assistant 转录拼进 evidence，宽泛 React/烤鱼规则硬编码结论；薪资 seed 是 K 值却按元/月渲染；报告 blocks 损坏被投影成空正文；ISS-013 先审 source hash/payload 再判断取错版或截断。 |
| W07 | `src/lib/memory/retrieval.ts`、`src/lib/agent/memory-context.ts`、敏感内容分类/admission、memory correction API | Embedding 429 时跳过结构化/词法事实召回，context 不输出 warnings；薪资自然语言正则漏分类；correction 500 被泛化，SQL/约束根因需隔离复现。 |
| W08 | `src/app/tracker/page.tsx`、tracker API/repository、application events、Offer compare entry | 轮次只落 notes/本地 state；follow-up 复用同 status 形成 no-op；毫秒 timestamp 塞 integer；“添加到 Offer 对比”是空 onClick。D9 已确定加入幂等对比集合并导航。 |
| W09 | `src/app/analytics/page.tsx`、analytics aggregation、`src/app/api/analytics/weekly-report/route.ts` | 状态顺序累计误把终态推成 Offer；拒因比例固定；“全部”固定 8 周；周报 payload 未按 period 过滤；API 503 渲染空集合。 |
| W10 | discovery admission/scan worker 与 company-set serialization | scan receipt 的单公司输入未冻结，Worker 展开默认公司集合；任务重试/接管需沿输入快照。 |
| W11 | `src/components/ui/overlay.tsx`、settings/profile/CV/tracker/report pages、`src/components/agent/*` | Dialog primitive 混用、ID string 被 number 过滤、`proficiency || 50`、overflow 裁切、缺 label/focus return、CV 503 当空、旧缓存直接读。 |
| W12 | `src/lib/agent/tools/action/evaluate-offer.ts`、`src/lib/offer-evaluation.ts`、`src/lib/server/offer-agent-service.ts`、`src/app/compare/page.tsx`、`compare-offers-deep.ts` | `true/7/3` 默认分散在 parser、snapshot、row 映射、比较 UI；需要端到端 nullable/unknown、字段来源和假设估算。 |
| W13 | ASR route/provider adapter、TTS playback component、voice tests | 零 PCM 得到“嗯”；Audio.play 拒绝无用户反馈。先把供应商响应、有效声音和浏览器播放状态分开。 |

现有回归资产优先扩展：`src/__tests__/agent-runtime-regressions.eval.test.ts`、`agent-task-runtime.e2e.test.ts`、`agent-task-journey.test.ts`、`agent-surface-projection.test.ts`、`agent-item-projection.test.ts`、`agent-llm-scored-judge.eval.test.ts`、`resume-factuality.eval.test.ts`、`memory-eval-harness.test.ts`、`tests/example.e2e.ts` 及 `.e2e/production` 的脱敏 fixture。新增测试必须验证结果与独立读回，不只验证组件渲染。

### 3.2 非 67 项问题的全量边界责任

67 行矩阵只记录已确认产品问题；它不能替代 392 项规范的责任分配。实施前必须生成 manifest，保证以下整组 ID 均有唯一主责包、fixture、层级、oracle 和最终状态；动态 MCP 工具另按启动 manifest 记录，不得只按静态数量计数。

| 规范组 | 主责包 / 协作包 | 必须显式覆盖的边界 |
| --- | --- | --- |
| `AC-RUN-001..020` | W02 | admission、幂等、gate、SSE/轮询、Worker 重启/lease、429/5xx、坏 JSON/DSML/未知工具、超时/DB 停、假成功、legacy direct 端点、永久失败；`AC-RUN-016/017/018/019/020` 需保存 validation/attempt/artifact/state 的禁止副作用证据 |
| `AC-CTX-001..018`、`AC-COL-001..012` | 主责 W02；协作 W04 | 摘要、纠正、跨账号/跨 Run、主责交接、委派层级/冲突/取消/超时和父消费；跨目标必须新建 Run，同目标专家交接留在同一 Run；required child 失败时父任务保持 waiting，supporting child 可缺失但必须标出限制；不是只有静态卡片 |
| `AC-INT-001..024` | W03 | 单题、追问、跳过、暂停/恢复、结束/复盘、刷新和评分绑定；0–4 anchored rubric、每个 band 的答案证据引用、missing-evidence hard veto，以及至少 3 个 session 才能进入长期记忆；坏题不得进入评分 |
| `AC-RES-001..012`、`AC-POS-001..010` | 主责 W05；协作 W06 | CV/参考版本、事实门、定位来源和第三方/示例边界 |
| `AC-MEM-001..009`、`AC-OFR-001..008` | 主责 W07（MEM）、主责 W12（OFR） | 记忆分层/清除/embedding 降级、Offer unknown/假设/比较与禁止副作用；目标记忆擦除必须覆盖 Postgres ledger、Mastra/session、向量/缓存等所有层并独立读回 |
| `AC-SIN-001..024`、`AC-TOL-001..029` | 主责 W02；领域包协作读回 | 12 个用户任务、55 工具请求/结果消费/实体读回、未授权和重放；工具成功不等于任务成功 |
| `AC-UIX-001..025`、`AC-VOC-001..010` | 主责 W11（UIX）、主责 W13（VOC）；协作 W04 | 长内容、四视口、移动键盘、焦点/标签、媒体拒绝、ASR 静音与真实降级 |
| `AC-CHN-001..011`、`AC-EXT-001..010` | 主责 W02（CHN）、主责 W10（EXT）；协作 W13 | 跨任务长链、MCP/外部连接、系统 `job_digest` 主体、水位幂等和 connector 故障；用户不能冒充系统调度 |

其他页面 `PG-*` 的 170 个 ID 必须在同一 manifest 中逐项分配到 W01–W13；缺少主责、fixture 或 oracle 的条目不能进入 B5。

## 4. 分批实施、发布与回滚

分批实施与验收不等于分模块切换生产 ownership。为遵守 ADR-0022，B0–B4 只生成隔离/预生产/关闭状态的候选构建和 canary 证据；B5 才执行一次统一生产切换。若产品仍要求 B0–B4 对真实用户逐批生效，必须先单独修订 ADR-0022，并补充兼容迁移和跨批回滚证明；当前 Spec 不把逐批线上生效当作既定事实。

| 批次 | 内容 | 发布前硬门槛 | 回滚触发 |
| --- | --- | --- | --- |
| B0 设施与数据安全 | W01 owner namespace/旧缓存隔离、W02 基础 continuation/证据账本、ADR-0029 旧 Run 就地迁移、隔离 PG/模型/调度故障夹具 | P0 数据串号、pending 未消费、写入归属、非终态旧 Run 保留原 runId 并基于证据重验证；缺证据安全暂停；迁移 dry-run 全通过；可恢复旧缓存快照 | 任一跨账号读、旧缓存误迁移、旧 Run 改 ID/伪造完成、迁移不可逆或读回不一致 |
| B1 P0 上下文 | W03 面试、W02 材料/合同、W06 定位事实边界 | ISS-001/042/048/050/056 全部真实回归通过；P0 负向无写；滚动/上下文永久回归通过 | 任一 P0 重现、输入丢失/重复、错误事实进入产物 |
| B2 核心业务写入 | W05 CV/参考、W07 记忆、W12 Offer、W08 投递写入 | Gate 冻结参数恰一次；版本/hash/来源/未知字段独立读回；历史 dry-run 通过 | 错误 source/owner、未经授权写、stale 覆盖、未知值被事实化 |
| B3 交付与跨页 | W06 报告/JD、W08 跨页、W09 分析、W10 岗位发现 | 关联 ID、数值 oracle、报告正文、当前阶段分布和刷新前后一致；错误态不伪空 | 旧报告/申请串联、统计失真、报告/导出链接404 |
| B4 体验与媒体 | W04/W11/W13 附件、渲染、布局、可访问性、ASR/TTS | 四视口长对话、焦点返回、labels、播放拒绝和静音回归通过 | 输入不可达、内部格式泄露、媒体错误静默或错误提交答案 |
| B5 全量验收与正式发布 | 392 项规范、AC-RUN-016/AC-EXT-010 隔离故障夹具、历史处理 | 每个适用 case 均 pass；仅 manifest 明确标注不适用且经批准的 case 可 N/A；partial/blocked/not_run 不能以“有处置证据”代替执行；原 fail 关闭，release gate 无硬失败 | 任一未解释缺口、适用 case 未执行或未 pass、缺证据、构建身份不一致或 canary 失败 |

每批回滚使用上一个已验证构建和数据库向前兼容迁移；禁止直接恢复生产数据库快照覆盖期间新写入。历史数据处理先输出影响清单和 patch 计划，由用户逐批确认后执行；仅确定来源且可逆的合成/测试记录可自动 patch，其他记录只标 `needs_review`，不猜测改写。

### 4.1 实施顺序

1. 冻结当前 0.13.2 的代码 SHA、数据库 schema、Web/Worker 配置和 392 项原始覆盖账本；建立修复分支与新 Eval Run ID。
2. Seed 隔离成员、CV/JD/Offer/reference、申请事件、旧缓存和故障 provider；每个 fixture 记录 owner、来源、hash、时钟和允许 case。
3. 先落 W01/W02/W03 的身份、continuation、合同和面试单写者不变量；这些是所有 P0 和多数下游问题的前置。
4. 运行 UNIT 与 API-INTEGRATION，逐项验证状态转换、数值、权限、幂等、事务回滚和独立读回；失败保留首次证据。
5. 在隔离 PostgreSQL + 可控模型/第三方适配器执行 BROWSER-MOCK 与 FAULT，覆盖 AC-RUN-016、AC-EXT-010、worker 接管、DB 断连、SSE 丢失、播放拒绝等生产不能注入的分支。
6. 运行 BROWSER-LIVE 的固定真实样本，记录模型/provider/prompt/tool/judge 版本；关键任务按 D10 阈值和硬 veto 判定，不以人工“看起来不错”替代。
7. 执行 B0–B4 的 canary 预演和历史只读扫描，输出受影响清单、旧 hash→新 hash、patch 可逆性和不确定项。
8. 对合成/测试记录应用可逆 patch；真实用户记录逐条取得确认后处理；每条 patch 立即独立读回、刷新核验并记录审计。
9. 生成 release manifest，确认 Web/Worker/current/version/SHA/config 一致，执行构建、lint、全部测试、覆盖汇总和回滚演练。
10. 对 B0–B4 只发布隔离/预生产 canary；B5 执行 ADR-0022 要求的一次生产切换。观察错误率、未消费 continuation、跨 owner 读、工具重复写、报告读回、统计异常和媒体错误，触发条件满足即停止切换或回滚并保留证据。

### 4.2 单项完成定义

一个 ISS 只有同时满足以下条件才可标 `closed`：源码修复与根因说明已评审；原规范 case 的适用参数已执行；输出/交互满足事实与约束；工具/数据库/文件产生的实体由独立读取验证；刷新、重连或 worker 接管后仍一致；拒绝、取消、错误和重放没有禁止副作用；对应永久回归已加入正确测试层；首次失败、重试结果和剩余限制都保留。仅修复 UI 文案、增加重试或看到一次成功不满足关闭条件。

## 5. 历史数据处理

已确认纳入方案：只读排查 → 受影响清单 → 逐批核准 → 精确处理 → 独立读回与审计。真实用户数据不能以测试清理脚本或模型猜测批量重写。

具体分类：

1. 旧浏览器缓存：升级先移动到隔离命名空间，写入 `legacy_unowned` 标记并停止业务读取；仅有签名 owner、服务端同步 ID 和内容 hash 三者匹配才自动迁移。人工恢复前只读展示，恢复后逐条读回。
2. Offer 事实：扫描默认福利、报告 evidence 与 snapshot 的来源，原文缺失字段改为 `unknown` 需要逐条确认；计算假设可重算但不能覆盖原文事实。仅有确定来源且可逆的合成/测试记录自动 patch，真实记录逐条确认。
3. 参考简历：按 `sourceArtifactId/sourceHash/ownerId` 对账，疑似错源记录冻结为 `needs_review`，保留原正文和审计，不自动替换为本人 CV；合成记录可在有明确原图 hash 时自动回滚/修复。真实用户记录即使有确定来源，也只生成可逆候选并逐条确认。
4. 面试/Run：按题目、answerTurnIds、控制指令和事件顺序生成修复候选；受污染题目不能自动重排为用户新答案，先保留原始转录并标记复核。
5. 非终态旧 Run：保留原 `runId`、owner、conversation 绑定和原始输入，按持久证据映射到新 Program；缺失事实必须在同一 Run 内读回或请求用户重新确认，仍无法补验则安全暂停。迁移记录必须包含旧/新 schema、证据 hash、映射事实、操作者和回滚/前进策略，并在 B0 独立读回。

历史扫描必须只读、可重复、可导出差异；每个 patch 使用稳定 ID、旧 hash、新 hash、操作者、批准范围和回滚策略。没有来源证据的记录永不自动补事实。

## 6. 完整验收与永久回归

复用现有 E2E 项目和各层测试，逐项补足 392 项规范中的参数与证据；同时按 55 个静态工具建立覆盖交叉表，基线中 14 个未见结果的工具必须补证据或记录隔离夹具阻断。滚动与上下文回归是强制门禁；任何重试通过保留首败，不用后续通过抵消已确认缺陷。

验收层级：UNIT 校验状态/数值/来源；API-INTEGRATION 校验鉴权、归属、事务和读回；BROWSER-MOCK 在隔离 PostgreSQL 中注入模型/第三方故障；BROWSER-LIVE 验证真实模型语义；FAULT 注入 Worker、租约、数据库、MCP；CANARY 验证实际构建。AC-RUN-016 与 AC-EXT-010 是适用的未执行项，必须在隔离夹具完成，不能以 N/A 或生产注入替代。

发布门禁必须把以下列为硬失败：P0 任一失败；owner/ACL/来源/hash/状态/数值/幂等/禁止副作用错误；未读回却声明成功；未知条件写成已知；内部 reasoning/DSML 可见；392 中缺证据或仅有 harness 绿色；55 个静态工具和启动后的 MCP 动态工具 manifest 中任何适用工具没有调用、结果消费或明确的隔离阻断证据，或动态工具的 server/tool/capability/risk/allowlist/version 差异未审计。392 项必须全部执行并有 pass；只有经 manifest 明确证明不适用且获产品负责人批准的 case 才允许 N/A，`out_of_scope` 必须先转为有理由的 N/A 或从本版 392 清单移除并记录原因；AC-RUN-016 与 AC-EXT-010 不属于 N/A。质量 Judge 只能补充针对性/可执行性评分，不能覆盖确定性硬失败；关键任务按固定 rubric 和最低分阻断，辅助任务低分降级并显示限制，不再统一降为 warning。现有 `BLOCKING_SCORE_THRESHOLD=0.8` 与 advisory `0.75` 作为初始值，必须在固定 fixture 校准后写入版本化门禁配置，不允许运行时随意调低。

现有设施需要补齐：`e2e.config.ts` 扩展完整 tests manifest（当前只匹配 `tests/**/*.e2e.ts`）；`e2e:agent` 纳入 `.test.tsx`；CI 同时运行 lint、unit、build:web/worker、deterministic eval、隔离 browser/API/FAULT、覆盖审计和 release gate；每个 Eval Run 固定 code/model/prompt/tool/fixture/judge 版本。生产复测只生成 evidence，不把线上凭据或原始会话上传仓库。

## 7. 已收口与剩余核查

D1–D10 已形成共同理解；剩余内容是源码定位、隔离夹具、迁移 dry-run、固定 rubric 校准和逐项验收，不再把可查事实反问用户。根因、接口、数据库和现有配置事实继续由源码与证据核查；若实施中发现新的不可逆产品取舍，再单独开一轮设计问题。
