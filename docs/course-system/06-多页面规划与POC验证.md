# 06 多页面规划与 POC 验证

本篇进入 0-1 的产品形态验证。调研和需求池已经说明用户需要可信、连续、可复查的 AI 求职助手；现在要验证一个关键假设：Agent Chat 作为入口，是否需要多页面承接结果。

多页面不是为了堆功能，而是因为求职资产天然不是一次性聊天内容。JD 报告要复查，简历提案要确认，Offer 要比较，面试进度要恢复，画像和记忆要长期使用，Admin 要治理权限和共享内容。

## 1. POC 假设

| 假设 | 为什么要验证 |
|---|---|
| Agent Chat 能作为主入口 | 用户不想先学习复杂页面结构 |
| 页面能承接业务资产 | 求职材料需要长期复查和迭代 |
| 写入有证据 | 简历、报告、Offer、记忆都不能只靠一句话承诺 |
| 跨页状态可恢复 | 用户会从聊天跳到报告、简历、面试再回来 |
| Admin 是首版治理基础 | 用户审批、记忆审核和运行复盘不能后置到不可控状态 |

## 2. 页面规划

| 页面 | 首版职责 | 承接对象 |
|---|---|---|
| `/agent` | 自然语言入口、图片入口、任务路由、工具状态 | session、run、pending action |
| `/cv` | 当前简历、修改提案、确认写入、回滚 | cv_data、resume_edit_proposals |
| `/evaluate` | JD 输入与评估触发 | JD 文本、链接、图片 |
| `/evaluate/reports` | JD 报告列表和详情 | reports、jds |
| `/compare` | Offer 字段、风险、谈判建议、多 Offer 对比 | offers、offer_reports |
| `/interview` | 基于 JD 和简历的一题一答 | interview_state |
| `/profile` | 自我定位、能力信号、偏好约束 | profiles、profile_signals |
| `/admin/users` | 用户审批、角色管理 | users |
| `/admin/memory` | 记忆审核、共享治理 | memory_items |
| `/admin/agent-runs` | 运行证据和复盘入口 | agent_runs、steps、reviews |

## 3. POC 主线

```text
用户在 /agent 输入 JD
  -> 系统识别为 JD 评估
  -> 生成投递建议和完整报告
  -> /evaluate/reports 可查看报告
  -> 用户回到 Agent 要求“基于这个 JD 改个人概述”
  -> 生成简历提案
  -> /cv 展示提案和差异
  -> 用户确认
  -> 目标 section read-back
```

这条链路验证：

| 能力 | 验证点 |
|---|---|
| 入口 | 用户从 Agent Chat 发起任务 |
| 业务承接 | JD 进入 evaluate，简历进入 resume |
| 页面承接 | 报告进 Reports，提案进 CV |
| 数据可信 | report、proposal、CV section 可读回 |
| 状态连续 | Agent 与页面之间不丢当前对象 |

## 4. 可选 POC 链路

| 链路 | 验证点 |
|---|---|
| Offer 首评 | Offer 字段抽取、风险、缺失字段、私有保存 |
| Offer 谈判 | 基于已有 Offer 生成谈判问题 |
| 面试准备 | JD + 简历绑定，一题一答 |
| 自我定位 | guided session 不一次性给空泛结论 |
| 图片输入 | JD/Offer/简历截图先识别类型和质量 |
| Admin 审核 | pending 用户、team memory 审核后状态读回 |

## 5. 数据口径

POC 阶段就要建立数据事实源，否则后续开发会混乱。

| 数据 | 当前口径 |
|---|---|
| 主 runtime | PostgreSQL + pgvector |
| SQLite | fallback/archive/migration source |
| 用户隔离 | 服务端按当前 userId 读取和写入 |
| 写入成功 | read-back 或 verifier |
| 运行证据 | run ledger、run-review、eval candidate 只作为治理证据 |

## 6. POC 不验证什么

| 不验证 | 原因 |
|---|---|
| 海投自动化 | 与产品定位冲突 |
| 绕招聘平台风控 | 合规风险高 |
| 所有页面完整体验 | POC 只证明主线成立 |
| 所有图片类型 | 首先验证 JD/Offer/简历截图 |
| 复杂数据分析 | 需要历史数据积累 |

## 7. 阶段产物

| 产物 | 内容 |
|---|---|
| 多页面职责表 | 每个页面承接什么业务资产 |
| POC 主线 | JD -> Reports -> 简历提案 -> CV read-back |
| 可选链路 | Offer、面试、画像、图片、Admin |
| 数据口径 | PostgreSQL + pgvector、read-back、userId scope |
| 验证边界 | 明确不验证海投、绕平台、全量复杂功能 |

结论：06 的目标是证明多页面产品形态是否有必要。07 将把这条 POC 主线收敛成 MVE 级功能规划。

## 8. 多页面 POC 的信息架构展开

多页面不是为了“看起来完整”，而是让每类求职资产有稳定位置。

| 用户任务 | Agent Chat 负责 | 页面负责 | 数据对象 |
|---|---|---|---|
| 评估 JD | 接收 JD、识别任务、调用 `evaluate` | Reports 展示报告、追问、导出入口 | `jd`、`report` |
| 改简历 | 理解目标 section、生成提案 | CV 展示当前简历、差异、确认按钮 | `cv_data`、`resume_edit_proposal` |
| 分析 Offer | 识别 Offer 材料和谈判目标 | Compare 展示字段、风险、谈判问题 | `offer`、`offer_report` |
| 准备面试 | 绑定 JD 与简历，推进问题 | Interview 展示当前问题和回答记录 | `interview_session` |
| 梳理定位 | 追问目标、偏好、经历 | Profile 展示画像信号和记忆 | `profile_signal`、`memory_item` |
| 管理治理 | 低风险引导或说明 | Admin 审批用户、审核记忆 | `user`、`agent_run` |

POC 阶段不要求每个页面都完整，但必须证明“Agent 产出的东西不会消失在聊天里”。

## 9. POC 原型走查

一条 POC 走查可以这样记录：

```text
Step 1：用户在 Agent Chat 粘贴 JD
预期：系统识别为 evaluate 任务，而不是普通闲聊

Step 2：生成 JD 报告摘要
预期：摘要能说明匹配点、差距、风险、准备建议

Step 3：报告进入 Reports
预期：页面能按 reportId/reportNum 找回

Step 4：用户要求“基于报告改个人概述”
预期：系统读取当前 CV 和 report 上下文，生成 proposal

Step 5：CV 页面展示差异
预期：用户能看到原文、建议文案、理由和确认入口

Step 6：用户确认应用
预期：目标 section read-back 一致
```

这条走查能证明多页面 POC 的价值：不是多做几个入口，而是让 AI 求职任务有可复查路径。
