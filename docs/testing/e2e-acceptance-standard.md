# E2E 通用验收标准与覆盖护栏

状态：**已授权在38084生产环境实测，完整参数矩阵尚未全部完成；本轮未接入 CI、未部署。** 实际执行、问题与环境限制见 [生产实测报告](production-e2e-report-2026-10-12.md)，规范和注册工具数量不能代替执行证据。

盘点日期：2026-10-12（Asia/Shanghai）。源码基线：`01e46a6d35fea51aaeddcc84f7860c56606c04de`；正式执行须重新记录实际 SHA、工作区差异、构建与配置版本。

本文件约束 [AgentChat 清单](./agentchat-e2e-spec.md) 与 [其他页面清单](./other-pages-e2e-spec.md)。用例描述、工具映射和矩阵是完整覆盖要求，不表示已经通过；实际状态须逐ID对照生产实测证据。

## 1. 测试层级及能够证明的事情

| 层级 | 执行路径 | 能证明什么 | 不能替代什么 |
| --- | --- | --- | --- |
| UNIT | 纯函数、组件、治理单测 | 参数转换、状态转换、边界规则、渲染分支 | 浏览器、真实请求、worker、数据库闭环 |
| API-INTEGRATION | 真实鉴权HTTP→实际服务→隔离数据库，无UI入口 | 服务鉴权、对象归属、数据和副作用读回 | 页面操作及浏览器完成数 |
| REPORT-AUDIT | runner报告/trace/manifest及证据审查 | 用例状态、层级及证据是否诚实一致 | 被审查用例本身已经通过 |
| SIM | Mock 模型/工具的 runtime simulation | 人工事件序列下的归属、恢复和投影 | 真工具副作用、真实 AI 理解、浏览器操作 |
| BROWSER-MOCK | 真浏览器→真 web/API→真 worker→隔离 PostgreSQL，只有模型/第三方供应商受控 | 前后端协议、审批、产物持久化、刷新及跨页结果 | 真实模型语义和真实第三方可达性 |
| BROWSER-LIVE | 同上，使用真实模型或声明的真实供应商 | 指定模型/提示版本/样本下的理解和交付质量 | 数值、权限、幂等和事实的独立机械验收 |
| FAULT | 独立运行时故障测试，显式注入 worker/租约/DB/MCP 故障 | 接管、fencing、对账、恢复预算及持久化一致性 | 用户能否正常点击、输入、滚动、刷新 |
| CANARY | 部署后隔离账号与有限安全路径 | 实际 release、反代、worker、鉴权和配置是否正常 | 部署前全量验收及故障注入 |

测试名包含 `e2e` 不决定层级。`agent.act()` 完成、工具返回 `success`、截图有结果卡、toast 提示成功均不是完整闭环证据。

截至盘点，`tests/example.e2e.ts` 只有登录入口、空表单、忘记密码跳转三条浏览器测试；`npm run test:e2e` 本身不保证 PostgreSQL、worker 或 AI 已配置。

`npm run e2e:agent` 使用 Vitest 收集测试，包含模拟/单测/静态回归；不得将其报告统一改称“真实浏览器全量通过”。现有 PostgreSQL 故障脚本单独记录为 FAULT。

## 2. 固定基线与 fixture 账本

下面都是**虚构、隔离、待 seed 的测试数据**。不得用真实用户简历、线上会话或真实密钥替代。固定时钟为 `2026-10-12T10:00:00+08:00`（`2026-10-12T02:00:00Z`），显示时区统一 `Asia/Shanghai`。

每个 fixture 必须有稳定语义 ID、fixtureVersion、ownerAlias、sourceId、sourceText/文件、`sourceSha256`、`createdAt`、clock、允许使用的 caseIds。seed 时独立计算规范化内容/原始文件 SHA-256，执行前读回验证；尚未 seed 的 hash 标 `pending_seed`，不得编造 hash 或记通过。

运行时 UUID、数字/字符串 JD ID 等由 manifest 映射回语义 ID；用例不得假定本机自增 ID。每轮记录 manifest SHA；需要修改素材时新增版本，不能静默改旧 fixture。

| 稳定 ID | 固定内容与归属 | 验收事实/限制 |
| --- | --- | --- |
| `USER-memberA-v1` / `memberA` | 已批准、有效 member，拥有 A 组资料 | 可读取和操作自己的资料；不能读取 B 的私有资料 |
| `USER-memberB-v1` / `memberB` | 已批准、有效 member，拥有 B 组资料 | 账号切换后不得复用 A 的缓存、run、artifact 或下载权限 |
| `USER-admin-v1` / `admin` | 有效 admin；受实际后台权限限制 | 不将 admin 等同 superadmin；每个管理动作核对真实 ACL |
| `USER-superadmin-v1` / `superadmin` | 有效 superadmin | 高权限动作也要鉴权、目标归属与可审计结果 |
| `USER-pending-v1` / `pending` | member 角色、待批准状态 | 不能进入受保护业务页/API；保留应有申请流程 |
| `USER-rejected-v1` / `rejected` | member 角色、申请被拒状态 | 不得被 pending/有效账号逻辑误放行 |
| `USER-disabled-v1` / `disabled` | member 角色、已停用状态 | 已有 token、打开的 tab、下载和续跑也需失效 |
| `USER-newMember-v1` / `N` | 额外的已批准member；业务数据为空，使用独立test tenant | 不是pending用户；缺材料必须澄清，不能复用A的数据 |
| `USER-readTaskMember-v1` / `R` | 普通member，当前任务由服务端policy限定只读工具 | R是测试别名，不是新增产品角色；只读约束不能仅靠客户端参数声明 |
| `CV-A1-v1` | memberA 当前简历；唯一标记 `E2E_CV_A1` | 虚构林澄，2023–2025 在“青禾实验室”负责 AI 产品；项目将周报耗时从 5 小时降到 2 小时；只声明 SQL、产品设计，不声明 Python/管理规模/融资 |
| `CV-A2-v1` | memberA 的不同版本；唯一标记 `E2E_CV_A2` | 周报从 5 小时降到 1 小时，新增 Python 仅作为本版本已给事实；明确当前/待确认/历史状态；用于 stale base、切版本和刷新 |
| `CV-B1-v1` | memberB 当前简历；唯一标记 `E2E_CV_B1` | 虚构许遥，2022–2024 在“海岚服务社”做运营；只含运营与 Excel，不能出现 A 的任何经历/指标 |
| `JD-A1-v1` | A 的 AI 产品 JD；标记 `E2E_JD_A1_ONLY` | 虚构“青禾星桥”、杭州、产品设计+SQL；岗位文本不少于 50 字；固定来源和日期，不依赖实时网页 |
| `JD-A2-v1` | A 的数据分析 JD；标记 `E2E_JD_A2_ONLY` | 虚构“海岚数研”、上海、Python+实验分析；与 A1 公司/城市/关键词不同，用于切 JD、指代和错绑检查 |
| `OFFER-A1-v1` | A 的 Offer，20,000 元/月×13 薪+保证奖金 10,000 元 | 确定年现金为 **270,000 元**；计算依据必须可追踪，不能加入未给的股票/补贴/税率 |
| `OFFER-A2-v1` | A 的 Offer，22,000 元/月×12 薪，奖金未知 | 确定部分 **264,000 元**；奖金及总包未知，不得填 0、均值或模型估值；不能仅凭此断言哪个 Offer 全面更优 |
| `APP-A-BASE-v1` | A 的 8 条 application，8 个 canonical 状态各 1 条 | `evaluated/applied/responded/interview/offer/rejected/discarded/skip`；固定 company、role、JD/report 引用和排序时间；原始分布总数为 8 |
| `PG-F1-APP-EXT-v1` | 页面扩展：8 个 canonical 状态各 2 条，共 16 条 | 与 BASE 是两个独立 seed profile；统计期望分别计算，不能混入另一套数据 |
| `PG-F1-SCORE-EXT-v1` | 页面扩展 10 个 report 分数：`0/3.49/3.5/3.99/4/4.49/4.5/4.99/5/null` | 每个 case 明示使用哪个 profile；按仓库阈值验证边界；`null` 是缺失，不可当作 0 |
| `DEADLINE-BEFORE/AT/AFTER-v1` | 截止时间为固定 clock 前 1 ms、等于 clock、后 1 ms | 明确业务采用 `<` 还是 `<=`；展示、排序、逾期和“今天”同时断言；规则未定时 blocked，不能自选答案 |
| `INTERVIEW-PLAN-A1-v1` | 绑定 CV-A1+JD-A1 的主问题计划；题/追问/反问各有稳定 ID | 用源码当前预算作 oracle；标准整场计划、单题和总追问计数分开，恢复不重置；生成完第一题不能代替整场完成 |
| `ANSWER-A1-EVIDENCE-v1` | 回答引用周报 5→2 小时及本人行为 | 已证事实可被反馈引用；不能替换成 5→1 或虚构人数/营收；改善比例为 60%，由独立计算验证 |
| `ANSWER-A1-NOEVIDENCE-v1` | “我参加了这个项目，效果不错”，没有指标/具体行动 | 反馈应指出缺证据并追问；不得把猜测写成事实或给与证据版相同的理由 |
| `REF-A-PRIVATE/REF-B-PRIVATE/REF-SHARED-v1` | 私有 A、私有 B、按实际权限共享的参考简历 | 各有唯一标记与 owner/visibility；私有不可越权，共享不可擅改；先核 ACL 再定预期 |
| `FILE-TEXT/PDF/DOCX/IMAGE/LONG/CORRUPT-v1` | 固定文本与多页/长文/损坏文件；统一带唯一 marker | 原始文件 SHA、页数/关键段、字符数由 manifest 给出；导入/导出核全文完整性，不只文件名 |
| `VOICE-ZH-A1/EMPTY/LONG/CORRUPT-v1` | 固定 16k 单声道 WAV，标准答案、静音、超限、损坏变体 | 记录 bytes/SHA/时长与人工 transcript；受控 ASR 与 live ASR 的容差分别声明 |
| `MCP-SITE-READ/WRITE/LOGIN/REDIRECT-v1` | 隔离受控站点，长 JD、表单、登录墙、跳转与故障开关 | 仅测试配置允许该站点；生产 allowlist 不为测试放宽；操作副作用有独立服务端计数与 owner |
| `SECRET-DUMMY-v1` | 字面测试标记 `E2E_DUMMY_SECRET_NOT_A_REAL_KEY` | 仅检测脱敏/拒绝泄露；真实供应商 key 由 secret store/env 注入，不入 fixture、trace、MD 或 Git |

所有关联事实的 source 时间固定并写入 manifest；基础条目可用 `2026-10-11T09:00:00+08:00`，排序/过期变体单独给时间。扩展 profile 不得改变基础 fixture 的语义。

## 3. 每个业务闭环的强制断言

1. **输入与归属**：记录登录 userAlias、页面 URL、conversationId、runId、turn/inputId、requestId；需要审批时记录 gateId/scopeHash。ID 应由测试读取得到，不允许依赖模型推断。
2. **UI 交互**：按钮/输入/文件/拖拽/录音可实际操作，键盘与指针行为符合用例；提交正确内容、一次提交，失败可见并保留用户输入；只看到按钮不算操作验收。
3. **实际请求**：独立捕获请求 method/path、脱敏参数和响应码；目标 user/conversation/run、JD/CV/Offer 版本正确；错误入口、重复 requestId、旧 tab 和跨用户必须有负向用例。
4. **实际执行**：工具调用必须形成真实执行 attempt/可用执行证据，包含工具名、参数摘要、attemptId/幂等键、结果；模型“说自己做了”或 `subagent.started` 卡片不算执行。
5. **业务结果**：判断输出结构与关键字段，使用固定 oracle 核算数值、数量、状态、版本/hash、来源与归属；任务需要持久化时检查 artifact/report/proposal/application/session 真存在。
6. **独立读回**：从另一授权 API 请求或只读 DB 查询读回结果，不复用前端 optimistic state、工具返回值或同一个缓存；检查 ownedBy、version、hash、内容/字节及副作用数量。
7. **刷新/恢复**：清掉本次局部前端状态并刷新同 URL，验证消息、Gate 决策、artifact、Run 终态仍一致；必要时浏览器新 context 登录读回。
8. **跨页一致**：AgentChat 产物在对应业务页可打开，业务页修改后 AgentChat 读取新版本；首页、Pipeline、报告、简历等显示同一事实，链接不跳错 ID。
9. **负向不发生**：拒绝/取消/越权/材料缺失/读回失败时，用 DB/API 计数或 hash 验证没有被禁止的写入、重复副作用、虚构成功或别人的资料。
10. **等待与终态**：用状态/事件和有界 timeout 等待，不用固定 sleep 掩盖时序；`waiting_user`、`paused`、`failed`、`cancelled` 与 `succeeded` 分别验收。

只读对话没有必须产生的业务 artifact 时，artifact 断言填 `N/A:只读回答`，但 transcript、来源、正确绑定、刷新和越权断言仍适用。不得为对话任务编造写阶段或报告。

数值/状态/数量/ACL/幂等/下载 hash 不交给模型裁判；20k×13+10k、22k×12、application 分布、阈值边界等必须由独立代码和固定期望判定，不能调用被测业务函数作为唯一 oracle。

生成文本分别验 **事实正确、针对性、可执行性、承认缺证据、遵守用户约束**。已给事实逐项匹配；没有来源的公司事实、简历指标、能力、奖金等是硬失败，语言通顺不能抵消。

有用性与针对性可用人工标注基准或独立 judge 辅助，但保存 judge model/version/rubric/分项理由与人工抽查；一个 judge 不包办所有断言，不强行匹配模型整段措辞，也不以自己生成的答案作金标准。

## 4. 协作和持久化证据的额外要求

- 主责交接检查合法任务转换、实际 agent/model/tool 身份、目标约束和上下文传递；后续工具权限按当前 contract 生效，UI 改名称不足以证明交接。
- 研究委派检查真实子 loop/任务执行证据、目标与只读工具交集、findings/keyPoints 来源，以及父任务消费这些 findings 的可观测结果；子任务失败不能被卡片包装为成功。
- `subagent.started/finished/error` 必须引用同一 delegationId；刷新后不能留下永久 working 卡片，同一结果不能出现两次。
- 必需研究结果缺失不能假成功；辅助研究缺失要明确限制。某项区分未在当前产品实现时列为待确认要求，不冒充既有 contract。
- **不预设每次 delegation 都创建 durable child Run**。当前 `delegate_research` 是内联子 loop；若无 childRunId，就记录 delegationId+父 run/attempt 和实际子执行证据。
- durable child Run 的父取消传播、active children≤4、depth≤2 是独立 runtime 边界；只有通过实际路径验证后，才能声明这些限制对某条委派产品流程生效。
- Gate 批准必须执行冻结 tool+args+risk；换参数、新版本、跨 run/gate 不继承批准。拒绝、重复决策、多 tab 竞态及恢复后的最终卡片/副作用数量都要读回。
- input requestId 与正确 run 绑定；waiting_user 回复后原等待条件应被消费。运行中拒收/排队、paused 普通消息与显式 resume 的行为分别依据已确认产品规则，不用“新消息出现”代替归属证明。
- SSE 重连按 cursor 补齐并去重，最终 snapshot、消息序列与 artifact 一致；worker 接管后旧 fencing 写入应被拒，recovery/追问预算不重置。
- effect 已提交而 read-back 未完成时先安全对账，不能盲重做；工具 success、Program success、用户已收到结果是三个独立事实。

## 5. 12 个任务 × 16 个流程：逐格审查，不机械套用

当前 `src/lib/agent/agent-e2e-matrix.ts` 声明 12 个用户任务和 16 个流程，共 192 个组合；这是覆盖清单，不等于 192 个真实 E2E 已执行。

| 任务 | 基本交付 | 明显应解释的 N/A |
| --- | --- | --- |
| `general_chat` | 正确只读回答与上下文 | 不写入时 approval/denial、简历应用链、JD 选择器不适用 |
| `career_positioning_guidance` | 分阶段问答、事实归纳 | 纯引导不要求写审批；只有转画像保存才验写链 |
| `resume_query` | 读取正确 CV/版本并回答 | 不得为了 coverage 制造写 Gate/应用简历 |
| `resume_diagnosis` | 当前材料诊断、事实与建议 | 只读诊断不应用简历；“不匹配 JD”不能强加 JD 选择 |
| `resume_edit` | 草稿→提案→批准→应用→读回 | interview_jd_selection 非该任务的自身流程 |
| `jd_evaluation` | 源材料→A–G→报告读回 | 简历应用链仅跨任务旅程适用；无简历匹配时不能读 CV |
| `offer_evaluation` | 已知/未知薪酬分离、报告读回 | 面试 JD 选择、简历应用链不是本任务成功条件 |
| `interview_coaching` | 正确绑定、逐题多轮、结束复盘 | 每个回答不应强制审批；整场与单题终态分别验 |
| `profile_update` | 引导/候选/确认的正确写入 | 简历应用链、面试 JD 选择不适用 |
| `reference_resume_save` | 归属/角色分类确认、保存读回 | 不应用到当前 CV；面试 JD 选择不适用 |
| `file_export` | 正确内容、文件非空/hash/下载 | 未定义审批时不造 Gate；continuous_three_turns 用导出追问旅程说明 |
| `job_search` | 条件确认→扫描审批→机会池读回 | 简历应用链/面试选择是跨任务旅程，不能当单任务固有流程 |

16 个原始 flow：`short_input`、`long_input`、`continuous_three_turns`、`pause_resume`、`cancel`、`waiting_user_input`、`approval`、`denial`、`transient_failure`、`permanent_failure`、`timeout`、`service_recovery`、`sse_loss_polling_recovery`、`refresh_recovery`、`resume_read_draft_proposal_approval_apply_readback`、`interview_jd_selection`。

正式 manifest 每个组合写 `applicable`、reason、caseIds、层级和状态。N/A 是适用性，不是 pass；跨任务链明确起点/终点，不重复算单轮通过。12×16 外补投递、拒信、MCP、协作、语音、后台与系统 `job_digest`，不能被旧矩阵漏掉。

## 6. 55 个静态工具的权威映射

来源为 `src/lib/agent/tools/index.ts` 的 55 个 `registry.register(...)` 及各 ToolDefinition 的 `name`，不含启动后 MCP 动态注册。下表关联具体计划case ID；实施manifest继续补测试文件、参数实例、层级与执行状态。映射不是执行通过证据。

AC 为 AgentChat 的语义章节，PG 为其他页面的语义章节标签；表内“产物”包括只读结果，不表示都写数据库。实际暴露受 registry capability、agent allowlist、task policy 和 feature config 共同约束；注册≠每个 Agent 都能调用。

| # | 精确工具名 | AC 章节 / PG 章节 | 正确产物或效果 | 必测负向断言 | 具体用例 ID |
| --- | --- | --- | --- | --- | --- |
| 01 | `search_applications` | 投递查询 / PG-Pipeline | 当前 owner 的筛选/分页列表、正确数量 | 无结果返回空；不混 B 的记录/忽略日期或状态 | AC-TOL-001 |
| 02 | `get_report_detail` | JD/报告读回 / PG-JD报告 | 指定 report 的内容、分数、源 JD 与 ID | 不存在/跨 owner/错误 reportNum 不回退到别人报告 | AC-TOL-002 |
| 03 | `get_reference_detail` | 参考简历 / PG-参考简历 | 有权限的指定 reference 全文与来源 | 私有 B 拒绝；共享读取不授予写权限 | AC-TOL-003、AC-RES-012 |
| 04 | `read_file` | 简历/文件读取 / PG-简历、PG-文件 | 指定当前/历史 CV 或受支持文档的正确内容 | 不串 reference/current；不存在/越权/截断关键段可见失败 | AC-TOL-004 |
| 05 | `get_job_digest` | 岗位精选 / PG-机会池 | 自 watermark 以来 owner 的素材 Top 5/去重事实 | 不扫描/写资料；无新增不虚构岗位；用户 A/B 不串池 | AC-EXT-009、AC-EXT-010 |
| 06 | `get_profile` | 画像/简历上下文 / PG-画像、PG-简历 | 正确 owner/section 的画像和简历事实 | 不输出别人的资料；不把过期 CV 当当前；不灌简历全文到 UI | AC-TOL-005 |
| 07 | `get_recent_activity` | 投递活动 / PG-首页、PG-Pipeline | 固定时间窗内的真实活动及顺序 | 数量/日期过滤不失效；不捏造回复或面试 | AC-TOL-006 |
| 08 | `get_recent_jd_context` | JD 指代/多轮 / PG-JD报告 | 指定/最近 JD 的 marker、report 绑定 | 当前 JD-A2 不引用 A1 的 marker；跨用户和空历史处理明确 | AC-TOL-007 |
| 09 | `get_recommendations` | 推荐/职业建议 / PG-首页、PG-机会池 | 基于 owner 事实的建议与来源 | 未有数据时不伪造精准匹配；不偷用 B 简历 | AC-TOL-008 |
| 10 | `get_pipeline_status` | 投递统计 / PG-首页、PG-Pipeline | BASE 总数 8、各状态 1，或明确扩展 profile | 不混 BASE/EXT；无筛选时不漏 skip/discarded；缺失不变 0 分 | AC-TOL-009 |
| 11 | `get_application_context` | 投递上下文 / PG-Pipeline | 指定 application+events+关联 JD/report | 同名多条先澄清；错误 ID/owner 不更新或猜中目标 | AC-TOL-010 |
| 12 | `decode_black_market_terms` | 术语解释 / PG-JD报告 | 引用原始术语解释和不确定性 | 不编造公司事实；缺术语/恶意文本不触发写工具 | AC-TOL-011 |
| 13 | `check_pipeline_health` | Pipeline 诊断 / PG-首页、PG-Pipeline | 数据库事实和明确阈值形成的健康结果 | 空数据/边界计数正确；不把模型建议当统计事实 | AC-TOL-012 |
| 14 | `get_profile_insights` | 画像洞察 / PG-画像 | 与来源一致的洞察、缺证据提示 | 不伪造能力/指标；记忆候选不自动当已确认事实 | AC-TOL-013 |
| 15 | `detect_skill_gaps` | 技能差距 / PG-画像、PG-JD报告 | CV-A1 对指定 JD 的证据化差距 | JD-A1/A2 切换准确；不能把未声明 Python 说成已掌握 | AC-TOL-014 |
| 16 | `check_ats_compatibility` | 简历诊断 / PG-简历 | 当前文本的 ATS 结构问题与建议 | 不假装已改 CV；无简历/损坏材料不输出假评分 | AC-TOL-015 |
| 17 | `read_offer_report` | Offer 多轮解释 / PG-Offer | 正确 Offer 报告的已知/未知项和引用 | 解释不重新评估/再写报告；不串两个 Offer | AC-TOL-016 |
| 18 | `evaluate_jd` | JD 评估 / PG-JD报告 | 文本/URL/图片来源、合法 0–5 分、持久报告 | 少于必要材料/坏 OCR/越权失败；无读回不能说保存成功 | AC-TOL-017 |
| 19 | `evaluate_offer` | Offer 评估 / PG-Offer | 270k 和 264k 确定部分、未知项、报告读回 | 奖金未知不得补造；读回/保存失败不 succeeded | AC-SIN-007、AC-OFR-003 |
| 20 | `generate_cv` | JD 定制简历 / PG-简历 | 基于事实的多个持久 draft artifact | 草稿不覆盖 current CV；不造指标；reference ACL 生效 | AC-TOL-020 |
| 21 | `scan_portals` | 岗位发现 / PG-机会池 | 确认条件的 scan/job 和真实机会池读回 | 未批准/重复请求不重复扫描；空结果不假 count | AC-SIN-012、AC-CHN-001 |
| 22 | `check_health` | 兼容 Pipeline 诊断 / PG-Pipeline | 已注册旧入口按传入 pipeline 算结果；推荐新工具 | 缺 pipeline 明确失败；不把调用者传数当 DB 权威统计 | AC-TOL-022 |
| 23 | `fetch_jd_content` | JD 链接摄取 / PG-JD报告 | 固定 URL 页面正文/来源及关键 marker | 登录墙/无关网页/重定向/失败不当 JD；不伪造已抓取 | AC-TOL-019 |
| 24 | `export_file` | 文本导出 / PG-文件 | 支持 md/html/txt 的内容、非空 bytes/hash、可下载 | 不等同 PDF 工具；越权/非法 filename/空内容不假成功 | AC-TOL-029、AC-CHN-004 |
| 25 | `import_resume` | 简历导入 / PG-简历 | 完整结构化 CV，正确 current/pending 版本与读回 | 既有 CV 不未经确认覆盖；原图/关键段不丢；损坏不假导入 | AC-TOL-021 |
| 26 | `mine_profile` | 画像引导/保存 / PG-画像、PG-记忆 | 按阶段收集真实回答，确认写入可读回 | 引导不先写；短答不重复已答问题；拒绝写入无副作用 | AC-SIN-009、AC-POS-009 |
| 27 | `evaluate_jd_full` | JD 完整评估 / PG-JD报告 | 当前 JD 的 A–G 完整报告和 read-back | “不用匹配简历”不读 CV；旧报告/缺模块不能满足当前任务 | AC-SIN-006、AC-TOL-017 |
| 28 | `analyze_jd_risks` | JD 风险解读 / PG-JD报告 | 引用当前 JD 语句的风险与限制 | 不凭空说违法/融资；分析不擅改已有报告 | AC-TOL-018 |
| 29 | `self_positioning` | 职业定位多轮 / PG-画像 | 引导框架、下一个合适问题及阶段事实 | 不仅加载框架就结束；没有用户回答不造画像/能力 | AC-POS-001、AC-POS-002 |
| 30 | `prepare_interview_full` | 面试准备 / PG-面试 | 正确绑定 CV/JD 的准备材料与针对性问题 | 不串 JD marker；不把准备等同真实回答/完成面试 | AC-TOL-028 |
| 31 | `compare_offers_deep` | 多 Offer 比较 / PG-Offer | 同口径确定现金、未知项与条件化选择 | 不拿未知奖金作 0；错误 owner/缺第二 Offer 不胡编比较 | AC-OFR-005 |
| 32 | `generate_offer_negotiation_strategy` | Offer 谈判 / PG-Offer | 基于指定报告事实的建议和话术 | 不重跑 evaluate_offer；不保证薪资/擅自联系 HR | AC-OFR-002 |
| 33 | `generate_offer_hr_question_list` | Offer HR 问询 / PG-Offer | 针对未知奖金/条件的问题清单 | 未知项不改成确定项；生成问题不声称已询问 HR | AC-OFR-002 |
| 34 | `start_interview_session` | 模拟面试 / PG-面试 | 绑定正确材料、首题与可续跑 session 状态读回 | 不因首题而完成整场；旧 session/错 JD 不重新覆盖当前 | AC-SIN-008、AC-INT-002 |
| 35 | `optimize_resume_section` | 简历优化草稿 / PG-简历 | 当前板块的事实保真 draft artifact | 未批准不写 current CV；不能改变事实指标/凭空补经历 | AC-RES-001 |
| 36 | `create_resume_edit_proposal` | 简历提案 / PG-简历 | draft/section 与 baseVersion/baseHash 的 pending proposal | 旧版本、缺内容、跨 owner 不造可应用提案；创建不应用 | AC-RES-003 |
| 37 | `apply_resume_edit_proposal` | 简历批准应用 / PG-简历 | 冻结批准的 proposal 应用、版本/hash/read-back | 未批准/denied/stale/重复 apply 不写或写第二次 | AC-RES-003、AC-RES-006 |
| 38 | `discard_resume_edit_proposal` | 简历拒绝/丢弃 / PG-简历 | proposal 终态 discarded，current CV hash 不变 | 已应用或别人提案不被丢弃；无侧写入 | AC-RES-004 |
| 39 | `rollback_resume_edit_proposal` | 简历撤销 / PG-简历 | 指定版本的正确恢复内容与读回 | 不覆盖之后并发编辑/错版本；失败不能说已回滚 | AC-RES-008 |
| 40 | `save_resume_section` | 简历兼容保存 / PG-简历 | 当前安全语义为待审批 proposal，不直接覆盖 CV | 一句“保存”不绕 apply/审批；否定写意图无副作用 | AC-RES-009 |
| 41 | `save_reference_resume` | 参考简历沉淀 / PG-参考简历 | 正确 role/category、owner、内容及持久读回 | 仅解释/拒绝保存时不写；不能泄漏私有原件或覆盖 current | AC-RES-010 |
| 42 | `download_report_pdf` | 报告 PDF / PG-JD报告、PG-Offer、PG-文件 | 指定报告 PDF 非空、正确头/内容/hash/下载 | 不导出错报告/别人文件；失败不留伪链接 | AC-TOL-027 |
| 43 | `update_report_metadata` | 报告更正多轮 / PG-JD报告、PG-Offer | 指定公司/岗位/关键词等更正，报告 ID/评分保留 | 不重评/重扣额度；歧义/越权不改错报告 | AC-TOL-026 |
| 44 | `track_application` | 投递新增 / PG-Pipeline、PG-首页 | 正确 application/event/source 的持久记录 | 重复身份按实际幂等策略；不得无用户意图投递外部站点 | AC-TOL-023、AC-CHN-007 |
| 45 | `update_application_status` | 投递状态更新 / PG-Pipeline、PG-首页 | 8 canonical 状态、event 时间线及读回 | 非法状态/歧义目标/越权拒绝；不把 responded 归成 interview | AC-TOL-024 |
| 46 | `log_rejection_notice` | 拒信反馈 / PG-记忆、PG-Pipeline | 带原文引用的封闭原因标签和待确认 candidate | 无引用不入账；candidate 不自动激活；不虚构拒绝原因 | AC-TOL-025 |
| 47 | `transfer_to_agent` | 主责交接 / PG-管理运行证据 | 合法转换、真实 agent/tool 身份与后续上下文 | 同 agent/图外/未知目标拒绝；只有卡片不算真实交接 | AC-COL-001、AC-COL-005 |
| 48 | `delegate_research` | 多 Agent 委派 / PG-管理运行证据 | 子 loop 真实只读调用、同 delegationId、父消费 findings | 写工具/无输出/越权/取消/超时不假 completed；不假定 durable child | AC-COL-006、AC-COL-012 |
| 49 | `generate_interview_questions` | 面试主问题 / PG-面试 | 与当前 JD/CV 和题库依据一致的问题 | 不在换 JD 后读旧 marker；不能把出题算用户回答 | AC-INT-004、AC-INT-019 |
| 50 | `score_interview_answer` | 面试逐题反馈 / PG-面试 | 当前 question/answer 的分项依据和缺证据判断 | 不串上一题/空回答；证据不足不虚构指标或只给漂亮总分 | AC-INT-005、AC-INT-023 |
| 51 | `web_search` | 联网研究 / PG-JD报告、PG-面试 | 受控搜索结果、引用来源和新鲜度 | 无结果/超时不造来源；页面 prompt injection 不升级权限 | AC-EXT-001 |
| 52 | `get_weather` | 面试出行 / PG-面试 | 正确城市/日期天气事实及来源 | 第三方故障明确降级，不把预估当实时天气 | AC-EXT-003 |
| 53 | `search_place` | 面试地点 / PG-面试 | 正确公司/城市地址和歧义澄清 | 同名地点不瞎选；私有地址不泄漏；结果不声称已出行 | AC-EXT-004 |
| 54 | `get_directions` | 面试路线 / PG-面试 | origin/destination/mode 对齐、来源与限制 | 反转起终点/无效 mode/超时不假路线；不假装已导航 | AC-EXT-005 |
| 55 | `search_jobs` | 岗位外部搜索 / PG-机会池 | 指定条件的只读搜索结果 | 不等同 scan_portals 已落机会池；无结果不造职位/数量 | AC-EXT-002 |

MCP 动态工具另存启动后的完整 manifest（server、tool、capability、risk、allowlist、version）。匿名 browser navigate/read/snapshot 走读路径；click/type/submit 与未明确分类动作走写治理；`browser_evaluate` 当前不注册。动态 manifest 新增/删除必须让覆盖差异可见，不能只校验静态 55 的数量。

## 7. 优先级、状态与通过口径

| 优先级 | 例子 | 候选发布要求（待确认） |
| --- | --- | --- |
| P0 | 上下文/输入归属、越权、未经批准写入、重复副作用、错误数值、假成功、输入栏/滚动导致不可用 | 必须通过；blocked/fail/flaky 不得作为通过发布 |
| P1 | 主任务闭环、跨页一致、恢复、产物下载、可见失败降级 | 目标全部通过；任何豁免明确 caseId、原因、风险及接受人 |
| P2 | 次要视觉/细节、多设备扩展、非关键组合 | 报告实际状态；未执行不能删去以美化覆盖率 |

状态仅用：`planned`（待实现）、`implemented`（已写）、`not_run`（本次未跑）、`pass`（本次证据齐全）、`fail`（违反断言）、`blocked`（缺环境/规则/数据）、`out_of_scope`（确认不属本版本）。适用性 `N/A` 和执行 `skip` 单独字段，均不计 pass。

flaky 作为标签保留首次失败、重跑次数与每次证据；重跑成功不能抹掉首败，不能无限重跑到绿。覆盖率分别报适用数、implemented 数、实际执行数、pass/fail/blocked/skip 数和层级，避免用 55 工具/192 组合的声明数作已测分母。

## 8. 正式 Case 模板与报告字段

```yaml
caseId: AC-EXAMPLE-001
title: 用一句话描述可观察的目标
status: planned
priority: P0
requirement: 已确认规则、源码接缝或历史回归编号
level: BROWSER-MOCK
applicable: true
naReason: null
fixtures: [USER-memberA-v1, CV-A1-v1, JD-A1-v1]
clock: 2026-10-12T10:00:00+08:00
preconditions: 隔离账号、web、worker、PostgreSQL、provider 配置及初始状态
steps: 登录 → 页面操作 → 等待可观察结果 → 独立读回 → 刷新 → 跨页
expectedUI: 关键文本、状态与可操作结果；不要求模型逐字输出
expectedRequest: method/path、脱敏参数、所有归属 ID 及 requestId
expectedExecution: 实际 attempt/事件或合法拒绝；副作用次数
expectedArtifact: ID、owner、version、hash、内容；只读任务给 N/A 原因
expectedReadback: 独立 API/DB 查询、数值/内容 oracle、刷新/跨页结果
forbiddenEffects: 禁止的写入、跨用户读取、重复执行、虚构事实
timeouts: 各阶段有界 deadline；不得使用固定 sleep 作为通过依据
cleanup: 只清理本轮 manifest 的隔离 test tenant 数据
evidence: 脱敏请求/事件/DB 快照、截图、下载 hash、首次失败和重跑
```

每次 run report 至少记录：run/report ID、caseId、SHA/dirty diff hash、release/version、fixture manifest SHA、clock/timezone、浏览器/viewport/OS、层级、provider/model/prompt/program/tool manifest 版本、耗时/deadline、状态/原因、断言逐项结果、首次失败/重跑/flaky、所有关联 ID 的脱敏映射、artifact/source hash、证据路径和清理结果。

无需访问日志暴露正文才能证明执行；保存允许的 metadata 和必要虚构 marker。生产 canary 不采集真实简历全文、密码、JWT、cookie、provider key、storageState 或完整环境。

## 9. 正式运行与发布前后分工

- 完整 AgentChat BROWSER-MOCK 需隔离 PostgreSQL、真 worker、test tenant/auth、受控模型供应商、固定时钟/fixtures、MCP/voice 受控端点及独立 readback 权限；只启动 Next web 不够。
- 所有 fixture/故障开关仅在显式测试配置生效；配置错指生产应立即拒绝。不能将整条业务 API mock 掉后声称通过了数据库闭环。
- BROWSER-LIVE 模型/供应商和预算单独配置，凭据从 secret store/env 获取，内容仍是虚构 fixture；未配置时 blocked，不把跳过算通过。本次文档工作不调用付费模型。
- FAULT 在隔离数据库/worker 执行，校验预期数据库名和 test tenant。双 claim、lease 接管、旧 fencing、后台任务延迟、MCP 崩溃、DB 连接故障应分别有恢复读回；不能对真实用户进行故障注入。
- 清理先解析并核验测试 tenant、manifest 记录 ID 和允许路径；禁止按模糊用户名/时间范围删除非测试账号、线上会话、共享 reference 或运行中任务。
- 发布前：目标 SHA 构建、schema/runtime preflight、P0/P1 的所需层级与恢复链在候选环境跑完，保存证据后才 cutover。不能只因单测绿就切换 release。
- 发布后：确认实际运行 release/worker/反代、登录/关键只读和隔离写入短链及长会话滚动/context canary，观察日志和 readback；不复跑会影响真实用户的破坏性故障。
- CI 接入是后续实现工作：UNIT/SIM、BROWSER-MOCK、受控 FAULT 分作业；BROWSER-LIVE/canary 单独明确权限/预算与触发。当前文档不声称已增加任何 CI/deploy gate。

## 10. 当前版本边界与待确认事项

| 能力 | 当前范围/限制 | 清单处理 |
| --- | --- | --- |
| 多 Agent 协作 | general/resume/evaluate 的治理式交接与只读内联研究委派 | 验实际执行；其他 agent 任意互派/并行网络 A2A 不当作已实现 |
| 浏览器 | 当前匿名页面、显式工具治理和域名允许清单 | 真实招聘站登录墙应说明限制；扫码登录/storageState 为 Spec 23 proposed |
| 语音 | 回合制录音→整段 ASR→文字发送，按句非流式 TTS 播放 | 流式 ASR、自动 barge-in、语音评分、多人/多说话人、电话外呼/克隆音色 out_of_scope |
| 消息编辑/再生成分支 | 未确认为当前已提供的会话能力 | 先确认产品入口/协议；不能列为既有按钮通过测试 |
| 画像恢复 | 当前治理/记忆不等于完整 profile restore | 先确认是否新增恢复能力及保留/版本规则 |
| `PracticePanel` | 组件存在不等于挂载在当前用户路径 | 无入口不算已实现页面 E2E；若启用再补入口/绑定/持久化验收 |
| 完整面试终态/预算 | spec 与实现可能不同步 | 用产品确认+现源码确定 oracle，不能把 spec 计划描述冒充已完成闭环 |
| 岗位精选 | 已有 system scheduled Run 与只读 digest 代码 | 需实际 worker/持久投递读回；设置频率、通知渠道、扫描联动不预设已提供 |

用户确认后仍需具体冻结：P0/P1 发布门禁与豁免规则、LIVE 模型和预算、面试题/追问/提前结束语义、paused 普通输入与继续动作、deadline 等于 clock 的业务规则、消息编辑/再生成和 profile restore 是否新增、参考简历共享 ACL、未挂载功能是否启用。

任何新增确认都产生 requirement/case/fixture 版本；发现实现与已确认规则不一致记 fail 或 blocked，不能调小断言让报告变绿。
