# 30 管理员治理与运行监控生产验收 Evals

## 评测对象

超级管理员后台不是六个页面的加载检查。评测覆盖管理员认证与授权、用户生命周期、团队洞察、记忆治理、Durable Agent Runtime、Run Review/Eval 候选、安全审计、移动端可用性，以及“监控和复盘故障不能反向改写成功 Run”的跨页面生产旅程。

本目录固定 70 条场景。生产环境只执行只读查询、安全筛选、刷新、分页和可识别的无工具合成 Run；用户审批、角色变更、密码重置、删除、暂停领取、隔离、取消、人工对账、dead-letter 重试和候选治理等有副作用动作必须在隔离环境执行，或由用户对具体目标再次授权。

## 项目事实

### 关键实现面

- 管理员用户列表由 Admin Users API、用户仓储和用户管理页面共同投影，筛选结果与全局状态汇总是两个不同事实。
- 当前用户身份由 Users Me API 投影到 App Shell；持久化显示名损坏时必须回退到稳定用户名。
- Durable Agent Runtime 管理页读取 Runtime Admin Service 的 Run、Event、Checkpoint、Dead Letter、Reconciliation 和 Background Job 只读投影。
- 记忆治理依赖 PostgreSQL `memory_chunks`、OpenAI-compatible Embedding Provider、记忆回填脚本与管理员治理页。
- 移动端后台与桌面共用 App Shell；固定底部导航必须由主内容安全区显式避让，不能依赖文档末尾的空元素。

### 已落地或部分落地的 eval 资产

- `src/__tests__/admin-production-defects.regression-1.test.ts`
- `src/__tests__/admin-runtime-monitoring.regression-1.test.ts`
- `src/__tests__/admin-security-routes.test.ts`
- `src/__tests__/admin-agent-runs.test.ts`
- `src/__tests__/admin-agent-reviews.test.ts`
- `src/__tests__/vector-memory.test.ts`
- `src/__tests__/run-evidence-observer.test.ts`
- `.gstack/qa-reports/production-2026-08-31/admin/qa-report-admin-production-2026-08-31.md`

### 从现有测试读到的行为

- Admin API 拒绝非管理员，超级管理员敏感操作要求二次认证和审计证据。
- Runtime 查询只读；Observer 或 Review 失败不会把已成功 Run 的终态改写为失败。
- Embedding 维度固定为 1536；Provider 原生维度较小时可以在尾部零填充，不改变已有语义坐标。
- 管理员生产缺陷回归直接覆盖筛选计数、损坏显示名回退、移动端操作可达性和空白密钥解析。

### 待补 eval 缺口

- 用户审批、拒绝、角色升降级、密码重置和删除仍需隔离生产同构环境的完整浏览器写操作回归。
- Runtime pause/resume、isolate、cancel、reconciliation 和 dead-letter retry 仍需隔离 Worker 与专用数据库故障注入。
- 记忆审核、归档与单条 reindex 仍需构造可清理的合成数据，不能直接修改真实用户资产。

## 实施与治理任务清单

1. 每次发布在真实生产页面复跑所有“生产安全”场景，并保存交互前后截图、console 结果和关键只读事实。
2. 所有治理写操作必须使用可清理 fixture，并验证数据库读回、审计事件、权限即时生效和失败时无部分写入。
3. 任何线上失败都晋升为确定性回归；修复前必须能失败，修复后与原始生产链路都必须转绿。
4. Embedding Provider 更换必须先跑供应商 smoke，再重建失败 chunks，并核对 `failed=0`、维度与检索边界。

## 角色与起始条件

- `superadmin`：可访问全部后台页面，但生产验收默认不提交治理写操作。
- `admin`：可执行被产品授权的日常治理，不应拥有超级管理员专属能力。
- `member`：访问管理员页面和 API 必须返回 403，不能看到后台数据。
- `anonymous`：访问管理员页面必须重定向登录或返回 401。
- 生产只读起点：已登录超级管理员；不修改真实用户、Runtime Control、Run、Tool Attempt、Review Candidate 和安全事件。
- 合成 Run 起点：新建独立 Conversation，发送带唯一 QA 标记、无隐私数据、明确禁止工具调用的 `general_chat`。

## 结果口径

- `passed`：完成真实页面操作并得到可见结果；有状态场景刷新后仍一致；同时无 console error。
- `failed`：重试一次仍不满足预期，必须附截图、复现步骤和可见/只读事实。
- `blocked`：需要危险生产写入、专用故障注入库或外部密钥，当前环境不应执行。
- `not-run`：尚未执行。不得把本地 Vitest 或 API 200 计为生产页面通过。

## 场景目录

### A. 认证、授权与后台外壳（A01-A08）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| A01 | 超级管理员登录 | 使用超级管理员账号登录并打开后台 | 角色为超级管理员；后台入口完整 | 生产安全 |
| A02 | 匿名访问后台 | 退出后直达任一 `/admin/*` | 跳转登录或 401；不泄露页面数据 | 隔离环境 |
| A03 | 成员访问后台页面 | 成员直达六个后台路由 | 全部拒绝；无后台 DOM 闪现 | 隔离环境 |
| A04 | 成员访问后台 API | 成员请求 Runtime/Review/User API | 403；服务查询未执行 | 自动化回归 |
| A05 | 管理员与超级管理员差异 | 分别登录并比较危险操作 | 仅授权角色看到并能提交对应动作 | 隔离环境 |
| A06 | 后台侧边栏导航 | 逐个点击六个后台入口 | URL、标题、选中态正确；会话不丢失 | 生产安全 |
| A07 | 后台刷新保留认证 | 每页刷新一次 | 不退登；权限与数据一致 | 生产安全 |
| A08 | 管理员身份展示 | 核对头像、姓名、账号与角色 | 不出现乱码、问号或错误角色 | 生产安全 |

### B. 用户生命周期治理（U01-U10）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| U01 | 全部用户列表 | 打开用户管理 | 总数与行数/分页一致；当前账号可识别 | 生产安全 |
| U02 | 待审批筛选 | 点击待审批 | 只显示 pending；标签总数保持全局口径 | 生产安全 |
| U03 | 已通过筛选 | 点击已通过 | 只显示 active；标签总数保持全局口径 | 生产安全 |
| U04 | 已拒绝空态 | 点击已拒绝 | 无数据时显示明确空态；总数不串线 | 生产安全 |
| U05 | 筛选往返 | pending → all → approved → all | 每次恢复全量；计数不被前一筛选污染 | 生产安全 |
| U06 | 审批用户 | 对合成 pending 用户点通过并确认 | 状态、审计事件、登录能力同步更新 | 隔离环境 |
| U07 | 拒绝用户 | 对合成 pending 用户点拒绝并确认 | 状态变 rejected；无法登录；有审计 | 隔离环境 |
| U08 | 角色升降级 | 合成用户 member/admin 往返 | 权限即时生效；不能产生多个非法 superadmin | 隔离环境 |
| U09 | 密码重置 | 对合成用户发起重置 | 二次确认；临时密码不进日志；强制改密 | 隔离环境 |
| U10 | 删除保护 | 删除合成普通用户并尝试删除当前 superadmin | 普通用户可审计删除；当前/唯一 superadmin 被阻止 | 隔离环境 |

### C. 团队洞察（I01-I05）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| I01 | 概览指标 | 打开团队洞察 | 活跃成员、Run 数、成功率、读回失败可见 | 生产安全 |
| I02 | 指标口径 | 对比成功率分子分母与 Run 分类 | 汇总与分类一致；无超 100% | 生产只读证据 |
| I03 | 失败类型分布 | 核对 failure type 聚合 | 数量与 Review/Run 数据一致 | 生产只读证据 |
| I04 | 空数据状态 | 使用无数据时间窗/团队 | 不报错；显示 0 与解释性空态 | 隔离环境 |
| I05 | 刷新一致性 | 连续刷新并切页返回 | 不重复累计；更新时间合理 | 生产安全 |

### D. 记忆治理与向量索引（M01-M09）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| M01 | 列表与健康摘要 | 打开记忆治理 | owner、source、visibility、status、Embedding 队列可见 | 生产安全 |
| M02 | owner 筛选 | 选择指定 owner | 只显示对应 owner；无越权内容 | 生产安全 |
| M03 | source 筛选 | 选择 upload/其他来源 | 结果与 source 一致 | 生产安全 |
| M04 | visibility 筛选 | private/team_pending/team/disabled 往返 | 结果与可见性一致；私有内容不越权 | 生产安全 |
| M05 | status 筛选 | active/pending/disabled/index_failed 往返 | 状态与队列错误数一致 | 生产安全 |
| M06 | Embedding 失败可诊断 | 过滤 index_failed 并查看错误 | 错误被脱敏；能区分认证、限流和内容失败 | 生产安全 |
| M07 | 重试索引 | 对合成失败记忆点 reindex | 状态 pending → active 或保留可诊断失败；幂等 | 隔离环境 |
| M08 | 审核与归档 | 合成 team_pending 执行 approve/reject/archive | 可见性和审计正确；不会污染私有记忆 | 隔离环境 |
| M09 | 刷新一致性 | 应用筛选后刷新 | 筛选或默认策略明确；数据不重复 | 生产安全 |

### E. Durable Agent Runtime 监控（R01-R16）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| R01 | Runtime 概览 | 打开运行监控 | 活跃、成功、租约、对账、死信均可见 | 生产安全 |
| R02 | 状态计数守恒 | 求和 queued/running/.../cancelled | 与查询口径一致；活跃数定义明确 | 生产只读证据 |
| R03 | waiting_user 筛选 | 点击等待用户 | 仅等待用户 Run；Gate/提示可理解 | 生产安全 |
| R04 | paused 筛选 | 点击已暂停 | 仅暂停 Run；恢复/取消按钮与状态匹配 | 生产安全 |
| R05 | succeeded 筛选 | 点击成功 | 终态、Contract、checkpoint 和事件可见 | 生产安全 |
| R06 | failed 筛选 | 点击失败 | Observation、Recovery、终态错误可见 | 生产安全 |
| R07 | cancelled 筛选 | 点击已取消 | 取消请求与最终取消事件顺序正确 | 生产安全 |
| R08 | 有效与陈旧租约 | 核对 active/stale lease | 只统计活跃状态；终态旧 lease 不误报 | 自动化+只读证据 |
| R09 | 人工对账只读 | 查看 unknown effect Attempt | 输入、Observation、三个决策可见；不自动执行 | 生产安全 |
| R10 | Runtime 刷新 | 刷新并比较同一 Run | 状态不倒退；事件 sequence 不重复 | 生产安全 |
| R11 | 暂停/恢复领取 | 暂停后创建合成 Run，再恢复 | 暂停期间不 claim；恢复后同 Run 继续 | 隔离环境 |
| R12 | 隔离 Run | 隔离合成 active Run | 仅目标 Run 被隔离；审计事件完整 | 隔离环境 |
| R13 | 取消 Run 树 | 取消带 child Run 的合成父 Run | 只影响非终态树；终态不被改写 | 隔离环境 |
| R14 | Observer 重试至死信 | Evidence handler 连续失败五次 | outbox dead-letter；Run 仍 succeeded | 自动化故障注入 |
| R15 | dead-letter 重试 | 对合成死信点重试 | attempt 清零、重新消费、审计完整 | 隔离环境 |
| R16 | 监控只读不阻断 | 反复查询/筛选/刷新成功 Run | 无 UPDATE/INSERT；Run 终态不变 | 自动化+生产安全 |

### F. Run Review 与 Eval 候选治理（V01-V09）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| V01 | Review 概览 | 打开复盘治理 | pass/warning/fail 与待审核候选可见 | 生产安全 |
| V02 | verdict 筛选 | 分别点 pass/warning/fail | 行结论与筛选一致；计数口径明确 | 生产安全 |
| V03 | Review 详情 | 选择一条 Review | 证据、建议修复、路由审计、步骤可见 | 生产安全 |
| V04 | 失败 Review 不回写 Run | 对 succeeded Run 生成 fail Review | Review=fail；Run 仍 succeeded | 自动化故障注入 |
| V05 | 通过 Review | 无工具 general_chat 成功 | pass/100%；无确定性失败 | 生产合成 Run |
| V06 | 敏感信息脱敏 | 查看步骤、输入、验证器 | token、key、邮箱、手机号、图片和 fencing token 脱敏 | 生产安全+自动化 |
| V07 | 候选状态筛选 | candidate/accepted/rejected/promoted 往返 | 只显示目标状态；计数正确 | 生产安全 |
| V08 | 候选接受/拒绝 | 对合成候选执行动作 | 状态与 admin note 持久化；不自动改代码 | 隔离环境 |
| V09 | 提升为回归草案 | promote 合成候选 | 只生成脱敏草案；需要开发者明确 apply | 隔离环境 |

### G. 安全审计（S01-S08）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| S01 | 安全事件列表 | 打开安全审计 | 时间、事件、结果、操作者、目标、IP、原因、请求 ID 可见 | 生产安全 |
| S02 | event type 筛选 | 输入 login/status_change 等 | 只返回目标事件类型 | 生产安全 |
| S03 | success/failure 筛选 | 切换结果 | 每行结果与筛选一致 | 生产安全 |
| S04 | 组合筛选 | login + failure | 总数、行数和每行结果一致 | 生产安全 |
| S05 | 分页 | 下一页再上一页 | 页码、行数、排序稳定，无重复/漏项 | 生产安全 |
| S06 | 刷新 | 刷新安全事件 | 回到明确页码；最新事件可见 | 生产安全 |
| S07 | 追加式约束 | 比较刷新前后旧事件 | 旧事件不被修改/删除；只追加 | 生产只读证据 |
| S08 | 审计脱敏 | 查看密码、token、Webhook 等事件元数据 | 不出现凭据正文；IP 仅管理员可见 | 生产安全+自动化 |

### H. 移动端与跨页面旅程（X01-X05）

| ID | 场景 | 关键步骤 | 预期 | 环境 |
| --- | --- | --- | --- | --- |
| X01 | 390px Runtime | 390×844 打开运行监控并滚动 | 指标、筛选、Run 卡片可读；底部导航不遮挡 | 生产安全 |
| X02 | 390px Users | 390×844 打开用户管理并横向/纵向滚动 | 全部列与操作可达；无裁切 | 生产安全 |
| X03 | 后台切页保留位置 | Run → Review → Run | 筛选/滚动策略明确；不丢认证 | 生产安全 |
| X04 | 成功 Run 跨页证据 | Agent 完成 → Runtime → Review → 刷新 | 三处同一 Run 一致；成功不被 Review 改写 | 生产合成 Run |
| X05 | console 健康 | 每页加载和每次交互后查 console | 0 error；warning 有归因 | 生产安全 |

## 关键生产合成旅程

**Test Scenario:** 监控与复盘旁路不阻断成功 Run

**Test Objective:** 验证当前生产 Worker 完成一个无工具 `general_chat` 后，Runtime 监控和确定性 Review 只生成旁路投影，不会把成功 Run 改成 warning/fail/waiting。

**Starting Conditions:**

- 超级管理员已登录生产环境。
- 新建独立 Conversation，不复用暂停或等待用户的旧任务。
- 输入只含唯一 QA 标记和固定回复要求，不含个人数据。

**Test Steps:**

1. 新建 Conversation，记录 `sessionId`。
2. 输入 `ADMIN-QA-OBSERVER-YYYYMMDD：请只回复“运行监控隔离验证通过”，不要调用工具。`。
3. 等待页面出现固定回复，确认没有工具卡片或 Gate。
4. 打开 Runtime 页面并刷新，定位最新 `general_chat` Run。
5. 核对 `model_output_complete.toolResultCount=0`、Contract `canClaimSuccess=true`、终态事件为 `succeeded`。
6. 刷新页面，再次核对 Run ID、终态和成功计数。
7. 打开 Review 页面，定位同一 Run，核对 verdict、score、路由审计和步骤脱敏。
8. 返回 Runtime 页面，确认 Review 生成后 Run 仍为 `succeeded`。

**Expected Outcomes:**

- 用户页面得到固定回复；Run 有唯一 ID、Contract、checkpoint 和单调事件序列。
- Review 可以是 pass/warning/fail，但不得 UPDATE Run 终态。本基准输入应为 pass/100%。
- Observer handler 失败只能进入重试或 dead-letter；生产不主动制造故障，故障注入由独立测试库完成。
- 所有页面交互后 console error 为 0，刷新后状态不倒退。

## 基线 Evals

### B1. 超级管理员后台主链路

**输入/fixture**:
- 已登录的超级管理员；当前生产用户、Runtime、Review、Memory 和 Security Event 只读数据。
- 390×844 与桌面视口；每个后台路由的首次加载、刷新和安全筛选。

**执行路径**:
1. 从 App Shell 依次进入用户管理、团队洞察、记忆治理、运行监控、复盘治理和安全审计。
2. 在每页执行只读筛选、刷新和分页，并在移动视口滚动到内容末尾。
3. 每次操作后读取可见状态、URL、页面标题与 console。

**断言**:
- 六个后台页面均可访问，超级管理员身份正确，不出现 `???`、裁切、底栏遮挡或 console error。
- 用户状态标签保持全局口径，Runtime/Review 查询不改写 Run 终态。

**现有覆盖**:
- 管理员生产缺陷回归覆盖服务端投影和移动布局契约；生产浏览器报告覆盖真实页面证据。

## 边界 Evals

### E1. 权限、空态与外部 Provider 失败

**输入/fixture**:
- anonymous、member、admin、superadmin 四种身份；空筛选结果；无效 Embedding 密钥、有效备用 Provider 和 1024 维原生向量。

**执行路径**:
1. 请求受保护 Admin 页面/API，验证拒绝边界和无后台数据闪现。
2. 切换到 rejected、dead-letter、reconciliation、index_failed 等空态或异常态。
3. 对 Embedding Provider 运行 smoke，并把原生向量适配到 1536 维存储契约。

**断言**:
- 未授权身份返回 401/403，空态可理解，错误信息脱敏且可诊断。
- Provider 认证失败不得冒充成功；有效 Provider 输出经适配后长度为 1536，原始坐标不变。

**现有覆盖**:
- Admin Security、Runtime Monitoring、Vector Memory 和生产缺陷回归共同覆盖确定性边界；危险治理动作保留为隔离环境场景。

## 回归 Evals

### R1. 四项生产管理员缺陷不会复发

**输入/fixture**:
- 22 个用户：12 pending、10 active、0 rejected；其中超级管理员持久化显示名为 `???`。
- 390×844 后台视口；带长 JSON 的 Runtime Run；空白显式 Embedding key 与可用备用 key。

**执行路径**:
1. 调用带状态筛选和全局汇总的 Admin Users API，再读取 Users Me 投影。
2. 在移动用户卡核对全部字段和可用操作，在 Runtime 页面滚动至底部并检查长文本换行。
3. 解析 Embedding 配置并运行供应商 smoke，随后重建失败 chunks。

**断言**:
- 任意筛选下计数始终为 all=22、pending=12、active=10、rejected=0。
- 损坏显示名回退到 `admin`；移动端字段与操作均可达；底栏不覆盖末尾内容。
- 空白 key 不遮蔽备用 key；生产 smoke 成功，失败索引归零且不再出现 `invalid_api_key`。

**现有覆盖**:
- `admin-production-defects.regression-1.test.ts` 是四项缺陷的最小红绿回路；生产 QA 在部署后复跑同一用户症状。

## 测试文件映射

- `src/__tests__/admin-runtime-monitoring.regression-1.test.ts`
- `src/__tests__/run-evidence-observer.test.ts`
- `src/__tests__/agent-runtime-admin-route.test.ts`
- `src/__tests__/admin-agent-runs.test.ts`
- `src/__tests__/admin-agent-reviews.test.ts`
- `src/__tests__/recovery-supervisor.test.ts`
- `src/__tests__/server-agent-loop-recovery.test.ts`
- `src/__tests__/agent-runtime-regressions.eval.test.ts`
- `src/__tests__/admin-production-defects.regression-1.test.ts`
- `src/__tests__/vector-memory.test.ts`

## 最小上线门槛

- A01、A06-A08、U01-U05、I01-I03、I05、M01-M06、M09、R01-R10、R16、V01-V07、S01-S08、X01-X05 必须有生产页面结果。
- R14、V04、A04 和敏感信息脱敏必须由自动化故障注入门禁通过。
- 所有有副作用场景必须在隔离账号/隔离数据库完成；不得用“未执行危险动作”冒充通过。
- 任一 Observer/Review 故障把成功 Run 改成 failed/waiting、任一非管理员可读后台数据、任一凭据泄露，均为发布阻断。

## 2026-08-31 生产验收结果

- Release：`20260831-175742-e2e-closure`。
- 生产浏览器 passed 48：A01、A06-A08、U01-U05、I01、I03、I05、M01-M06、M09、R01-R07、R09-R10、R16、V01-V03、V05-V07、S01-S08、X01-X05。
- 自动化/故障注入 passed 4：A04、R08、R14、V04。
- blocked 17：A02-A03、A05、U06-U10、I04、M07-M08、R11-R13、R15、V08-V09。
- not-run 1：I02 跨数据源指标口径只读对账。
- R11 的生产安全子集完成了暂停、可见提示、恢复和数据库读回，但没有在暂停期间创建隔离 Run，因此不升级为完整通过。
- 四项缺陷均为 verified：Embedding 1821/1821 + reference 6/6 embedded；用户全局计数 22/12/10/0；移动底栏 63px 且内容预留 80px；管理员显示名为 `admin`。
- 同一生产 Run `b1c89e5f...` 在 Runtime 为 succeeded、Review 为 pass/100%；查询、筛选、刷新和 Review 投影未改写成功终态。
- 六个管理员页面的加载与交互均为 0 console error；生产 QA 报告和截图位于 `.gstack/qa-reports/production-2026-08-31/admin/`。
- 发布后统一门禁已同时在本地与服务器 release 内通过：209/209 files、1014/1014 tests；`jd-eval-partial-candidate.test.ts` 2/2，历史 SyntaxError 结论已失效。
- 最终发布后浏览器冒烟再次核对 Memory 队列 0、Users 22 与 `admin`、Runtime 成功状态；数据库读回 `claims_paused=false`。
