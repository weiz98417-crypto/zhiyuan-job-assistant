# 29 生产全量页面与对话旅程验收 Evals

## 评测对象

这不是把 11 个 Agent Task Program 各点一次的清单。生产验收覆盖整个纸鸢产品的 28 个功能域，并把每个用户旅程拆成实际页面操作、可见结果、刷新后的结果和只读持久化证据。

机器可读目录在 src/lib/agent/production-browser-eval-catalog.ts。它固定了：

- 28 个 feature-system 功能域。
- 每域至少 3 条可执行的浏览器短链路。
- 11 个 Agent Task Program 全部至少有一条独立短链路。
- 8 条关键跨任务长链路。

src/__tests__/production-browser-eval-catalog.test.ts 只验证目录不缩水；它不等于生产浏览器测试已经通过。生产执行后的截图、控制台检查、网络结果和只读数据库证据必须写入 .gstack/qa-reports。

## 为什么 11 类不够

11 类只是服务端为明确 Agent 目标选择的顶层 Task Program：普通对话、职业定位、简历查询/修改、JD、Offer、面试、画像、优秀简历、导出、岗位搜索。真实产品还包括认证与隔离、会话管理、图片 intake、首页、导航、简历版本、Judge、投递追踪、对比、Analytics、设置、后台、Run evidence、数据层、MCP、发布治理和安全边界。

即使只看一个 Task Program，也必须测不止一条 happy path。例如 resume_edit 至少有指定区块定位、草稿来源、Gate 批准、双击幂等、应用读回、版本快照、拒绝/丢弃、回滚、刷新投影、与 JD/面试的上下文接力。把它记为“一类短链路通过”没有质量意义。

## 执行协议

每一条目录用例在生产执行时都必须留下四组证据：

1. 页面操作：开始前截图，实际点击/输入，结果截图；交互问题额外保留 snapshot 差异。
2. 浏览器健康：每个页面和每次交互后检查 console errors；对导出、流式消息和页面跳转检查网络失败。
3. 刷新与切换：有状态的用例至少刷新一次；跨会话/跨页面用例还要切走再返回。
4. 只读事实核验：以受限 QA 账号查询 owner 范围内的 session、Turn、Run、Gate、Event、Item、Artifact、业务记录和 hash。禁止在生产做故障注入或直接篡改业务数据。

报告结果只能是 passed、failed、blocked 或 not-run。不能用本地 Vitest、API 200 或“看起来有回答”替代目录用例的真实通过。failed 必须重试一次后再登记，并附截图、复现步骤、console/network 证据和最小只读数据库事实。

## 功能域目录

| 功能域 | 目录前缀 | 代表性的用户能力 |
| --- | --- | --- |
| 认证准入与隔离 | AUTH | 注册、审批、登录、刷新、退出、双用户隔离 |
| 首页工作台 | HOME | 空态、聚合摘要、行动入口、局部失败收口 |
| 全局导航与外壳 | NAV | 桌面/移动导航、返回、跨页保留会话 |
| Agent Chat | CHAT | 会话生命周期、长文本、多轮、过程状态、SSE 投影 |
| 图片 intake | IMAGE | JD/Offer/简历/未知图像的分类和安全澄清 |
| 路由与契约 | ROUTE | 主目标、约束、材料引用、任务切换、Offer follow-up |
| 工具治理 | GOV | 只读边界、Gate 幂等、读回失败收口 |
| 求职评分 | SCORE | 简历评分、ATS、技能差距、版本正确性 |
| 岗位扫描页 | SCAN | 条件、确认、进度、卡片、去重、取消和历史 |
| 投递追踪 | TRACK | 创建、阶段、备注、筛选和隔离 |
| 简历工作台 | CV | 文本/文件导入、版本、优化、量化、定制 |
| 简历提案 | PROPOSAL | 草稿、批准、应用、读回、丢弃和回滚 |
| 简历 Judge | JUDGE | 质量、占位符、阻断和可复盘版本 |
| 优秀简历记忆 | REF | 岗位、可见性、Gate、团队审核、向量检索 |
| 求职画像 | PROFILE | 定位多轮、信号确认、写入、拒绝写入后继续指导 |
| 面试教练 | INTERVIEW | JD/简历绑定、出题、回答反馈、题号、复盘 |
| Offer | OFFER | 评估、比较、解释、谈判、HR 问询 |
| Analytics | ANALYTICS | 时间筛选、聚合、资讯空/错态、来源跳转 |
| 设置 | SETTINGS | 偏好、密码、数据动作确认 |
| 文件导出 | EXPORT | 简历/报告 PDF、下载、hash、失败不伪成功 |
| 管理后台 | ADMIN | 权限、用户审批、密码重置、Run 筛选 |
| Run Evidence | EVIDENCE | 用户/后台一致、候选治理、暂停恢复取消 |
| 数据层 | DATA | 读回、跨窗口一致、向量 ACL |
| MCP | MCP | 允许调用、超时恢复、权限不绕过 |
| 发布治理 | CHANGE | 版本/开关可观察、失败回放、web/worker 健康 |
| 内容安全 | SECURITY | 提示注入、敏感信息、文件边界 |
| 对话式岗位发现 | JOB-AGENT | 澄清、确认卡、流式职位卡、JD/投递接力 |
| Durable Run | RUN | stimulus、Gate、暂停/恢复/取消、worker 恢复 |

## 对话能力穷举方式

以下行为维度必须叠加在相关短链路和长链路上，而不是仅执行一个正向 prompt：

- 初次目标、模糊补充、明确纠正、明确切换、取消和恢复。
- 短文本、超长中文材料、Markdown、JD/Offer/简历粘贴、链接、图片、错误文件和低质量图片。
- 一轮回答、连续三轮、上下文压缩后继续、历史会话切换、跨页面返回、刷新和浏览器后退/前进。
- 只读查询、产生草稿、需要 Gate 的写入、批准、拒绝、过期、双击和刷新后重复操作。
- 工具成功但 read-back 失败、超时、临时失败、永久失败、Worker 恢复、SSE 断开后按 cursor 补齐。
- 卡片打开、原始 JD 外链、报告详情、PDF 下载、从卡片接力下一个任务、同一 Conversation 的 Offer follow-up。
- owner 隔离、普通用户/admin 权限差异、private/team 可见性、敏感字段脱敏、prompt injection 和不支持文件。

## 关键长链路

目录固定八条组合旅程：

1. 职业定位 → 拒绝画像写入 → 岗位发现。
2. 岗位发现 → JD 评估 → 简历查询 → 修改提案 → 批准读回。
3. JD 评估 → 面试辅导 → 两轮回答反馈 → 复盘。
4. Offer 评估 → 报告解释 → 谈判 → HR 问询。
5. 保存参考简历 → 用于优化/画像检索 → 验证可见性边界。
6. waiting_user → 刷新/事件流中断 → 补充 Turn → 同 Run 续跑。
7. 高风险 Gate → 批准/拒绝 → Artifact 下载 → 刷新投影。
8. 安全任务切换 → 旧 Run 暂停 → 新 Run 完成 → 旧 Run 恢复。

## 发布门禁

发布后，除 web/worker 健康检查和已有本地测试外，至少满足：

- 目录中的每一个短链路和长链路都有生产状态，不允许未运行项被汇总为通过。
- 每个 Agent Task Program 有页面证据、正确 Run Contract、正确终态和刷新后的一致投影。
- 所有确定性写入类任务都验证真实 effect、owner、Artifact/版本和 read-back；无证据即失败。
- 任一 P0/P1 failure、console error、网络失败、重复副作用、双 active Run、Gate/Run/Item 不一致都会阻断发布结论。
- QA 报告必须明确已运行数量、总数量、通过、失败、阻塞、未运行，不能只报 19/19 这类本地断言计数。
