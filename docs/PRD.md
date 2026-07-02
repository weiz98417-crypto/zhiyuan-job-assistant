# 筝筝纸鸢（Zhiyuan）Agent 求职助手产品需求文档（PRD）

> 版本：v1.0  
> 状态：当前项目事实版  
> 日期：2026-06-29  
> 适用范围：`zhiyuan-job-assistant-master` Web 应用、Agent Chat、PostgreSQL/pgvector 数据层、复盘治理与优化 Loop  
> 参考粒度：对齐《PRD-智辅化学-Agent产品需求文档》的模块拆解、边界、Agent、工具、数据、API、失败模式和 eval 颗粒度

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [产品范围与边界](#2-产品范围与边界)
3. [用户画像与角色体系](#3-用户画像与角色体系)
4. [功能模块全景](#4-功能模块全景)
5. [Model Story](#5-model-story)
6. [Agent 架构设计](#6-agent-架构设计)
7. [工具体系与治理](#7-工具体系与治理)
8. [服务层架构](#8-服务层架构)
9. [数据模型](#9-数据模型)
10. [API 端点全景](#10-api-端点全景)
11. [Prompt 与上下文策略](#11-prompt-与上下文策略)
12. [行为约束](#12-行为约束)
13. [失败模式目录](#13-失败模式目录)
14. [评估阈值与评测体系](#14-评估阈值与评测体系)
15. [Loop Engineering](#15-loop-engineering)
16. [风险矩阵](#16-风险矩阵)
17. [技术架构](#17-技术架构)
18. [开发阶段与完成度](#18-开发阶段与完成度)
19. [上线与局域网部署策略](#19-上线与局域网部署策略)
20. [附录](#20-附录)

---

## 1. 执行摘要

### 1.1 产品定义

**筝筝纸鸢（Zhiyuan）** 是一款面向中国 AI 行业求职者的 local-first AI 求职助手。它把 JD 评估、简历优化、Offer 判断、面试模拟、岗位发现、求职画像、长期记忆和团队治理聚合到一个 Next.js Web 应用中。

产品核心不是“帮用户海投”，而是让用户在求职过程中获得稳定的判断力、可复用的材料资产和可追踪的进展。用户每天可以打开它评估新机会、查看投递状态、修改简历、准备面试、复盘 Offer，并让系统逐步记住自己的经历、偏好、优秀表达方式和职业策略。

### 1.2 当前真实运行态

| 维度 | 当前状态 |
|------|----------|
| 前端框架 | Next.js 16、React 19、TypeScript、Tailwind CSS |
| Agent 架构 | 服务端 ReAct-style Agent Loop + 前端兼容 runner |
| 子 Agent | 6 个：`general`、`evaluate`、`resume`、`interview`、`profile`、`offer` |
| 工具数量 | 48 个注册工具：15 query、26 action、2 interview、5 MCP shim |
| 当前 LAN 数据库 | PostgreSQL + pgvector，通过 `DB_DRIVER=postgres` 启用 |
| SQLite 角色 | fallback、迁移源、归档读取；不是当前 LAN 主运行库 |
| 长期记忆 | 优秀简历向量记忆、通用 memory items/chunks、反馈晋升、管理员治理 |
| 复盘治理 | Agent Run 台账、Agent Run Review、Eval 候选队列 |
| 自动化优化 | 有 loop skill、STATE.md、automation 设计；官方 cron 健康与 fallback runner 仍需持续验证 |

### 1.3 产品问题陈述

AI 行业求职者面对的问题不是单点工具不足，而是完整求职链条中的判断、材料、记忆和执行持续断裂：

| 问题 | 典型表现 | 对用户的代价 |
|------|----------|--------------|
| 机会判断分散 | JD 文本、截图、链接、公司背景分散在聊天和网页里 | 不知道该投、不该投、怎么投 |
| 简历修改不可控 | AI 改完没有版本、没有读回、保存结果不确定 | 简历被污染、改错位置、丢失原内容 |
| Agent 跑偏 | 问简历内容却进入修改流程，做定位时跳到其他任务 | 用户失去信任，需要不断纠正系统 |
| 长期记忆薄弱 | 好简历、个人偏好、面试表现不能稳定复用 | 每次重新解释自己，输出无法成长 |
| 工具输出难读 | 大段报告、工具 JSON、错误堆栈直接塞进聊天 | 体验噪音高，关键结论被淹没 |
| 多页面状态丢失 | 从 Agent 页切到其他页面再回来，聊天和子 Agent 状态失忆 | 长任务中断，无法连续工作 |
| 自动复盘不闭环 | 有 eval 候选但未自动驱动修复和验收 | 同类问题反复出现 |

### 1.4 成功标准

| 维度 | 指标 | 目标值 | 衡量方式 |
|------|------|--------|----------|
| Agent 稳定性 | 路由正确率 | >= 95% | `agent-task-routing` eval + 端到端回放 |
| 写入可靠性 | 写入类工具读回校验覆盖率 | 100% | governance metadata + run ledger |
| 简历安全 | 未确认直接写入简历次数 | 0 | resume_edit contract eval |
| JD/Offer 评估 | 报告保存读回成功率 | >= 99% | run step verifier |
| 图片链路 | JD/Offer/简历图片识别可解释失败率 | 100% 可解释 | image-intake eval + UI 失败态 |
| 面试教练 | 一次多题违规率 | 0 | interview policy eval |
| 记忆治理 | 团队共享记忆未审核可见次数 | 0 | memory governance test |
| 前端可用性 | 聊天长内容横向溢出 | 0 个阻断页面 | Playwright/gstack 截图检查 |
| 自动化 loop | 每轮持久化 STATE 和 memory | 100% | automation session + file write-back |
| 审查通过 | 独立 evaluator 得分 | >= 90/100 | 修复合入前评分门禁 |

---

## 2. 产品范围与边界

### 2.1 产品范围

Zhiyuan 覆盖求职全周期，但当前重点优化方向收窄为 **Agent Chat 端到端稳定性和易用性**，同时保留现有求职工作台能力。

| 范围 | 包含内容 |
|------|----------|
| 求职画像 | 自我定位、竞争力分析、职业方向、画像信号沉淀 |
| JD 评估 | 文本/链接/截图 JD 评估、A-G 报告、报告保存和导出 |
| 简历工作台 | 简历导入、查看、优化、草稿提案、应用/回滚、ATS 检查、PDF 生成 |
| 优秀简历记忆 | 私有/团队参考简历、岗位方向确认、向量索引、no-copy 约束 |
| Offer 判断 | 单 Offer 评估、谈判策略、HR 问题清单、多 Offer 对比 |
| 面试模拟 | JD/简历绑定、一题一答、评分、追问、复盘 |
| 岗位发现 | 扫描队列、岗位去重、发现 JD 保存、状态查看 |
| 投递与分析 | applications、tracker、analytics、weekly report |
| Agent 治理 | 路由、任务契约、工具治理、读回校验、run ledger、review、eval candidates |
| 自动化优化 Loop | 发现、分发、验证、持久化、automation 触发与状态记忆 |

### 2.2 明确不做

| 不做事项 | 原因 |
|----------|------|
| 不做海投机器人 | 产品目标是高质量决策，不是批量投递 |
| 不绕过招聘平台风控 | 避免账号风险和不合规自动化 |
| 不把 AI 输出当作最终事实 | JD、Offer、公司信息必须标注来源和不确定性 |
| 不无确认修改简历 | 简历是高风险用户资产，必须 draft -> approve -> apply -> read-back |
| 不把优秀简历原文复制到用户简历 | 长期记忆只提供结构、表达和模式参考 |
| 不默认共享团队记忆 | 团队材料必须经过 admin governance |
| 不把 SQLite 写成当前主数据库 | 当前 LAN 主运行态是 PostgreSQL/pgvector |

### 2.3 硬边界

1. **写入必须可验证**：简历、报告、Offer、记忆、导出、管理员动作必须有 read-back 或确定性 verifier。
2. **读请求不能误进写流程**：例如“我现在的简历是什么”必须是 `resume_query`，不得触发 `resume_edit` 成功门禁。
3. **图片先识别再执行**：JD/Offer/简历图片必须先经过 image-intake，不允许普通聊天直接猜业务对象。
4. **任务状态必须可恢复**：Agent 页面切走再回来，正在进行的子 Agent 任务不能无故丢失上下文。
5. **复盘不能替代修复**：run-review 可以沉淀失败和 eval 候选，但不能声明代码已自动修复。

---

## 3. 用户画像与角色体系

### 3.1 核心用户

| 角色 | 核心场景 | 痛点 | 使用频率 |
|------|----------|------|----------|
| AI 产品求职者 | 评估 JD、改简历、准备面试、比较 Offer | 岗位标准不透明、材料难以持续迭代 | 每日 |
| 转型 AI 岗候选人 | 自我定位、补齐项目表达、找到可迁移能力 | 不确定适合什么方向 | 每周 2-4 次 |
| 求职陪跑/管理员 | 审核团队记忆、看 Agent run、整理 eval | 多用户材料和失败治理不可见 | 每周 |
| 系统维护者 | 修复 Agent 稳定性、检查 DB、跑 automation loop | 问题复现难、状态容易丢 | 每日/自动 |

### 3.2 权限角色

| 角色 | 权限 |
|------|------|
| `admin` | 用户审批、team memory 审核、agent run/review 查看、eval candidate 管理 |
| `member` | 使用个人求职功能、私有简历/报告/Offer/会话/记忆 |
| `pending` | 注册后待审批，不能访问完整业务数据 |

### 3.3 多用户隔离

| 数据类型 | 隔离规则 |
|----------|----------|
| 简历、报告、JD、Offer、会话、画像 | 默认按 `user_id` 私有隔离 |
| 优秀简历 | 私有默认仅 owner 可见；team_pending/team shared 需要审核 |
| Agent Run | 用户自己的 run；管理员可看治理视角 |
| Memory chunks | 私有或已批准团队可见，不允许未审核共享 |

---

## 4. 功能模块全景

### 4.1 模块总览

| 编号 | 模块 | 优先级 | 当前状态 | 说明 |
|------|------|--------|----------|------|
| M1 | 用户认证与审批 | P0 | 已实现 | 登录、注册、pending、admin 审批 |
| M2 | 首页/工作台 | P1 | 已实现 | 求职工作台入口与导航 |
| M3 | Agent Chat | P0 | 已实现，重点优化 | 文本、图片、工具、任务状态、会话 |
| M4 | Agent 路由与任务契约 | P0 | 已实现，持续补 eval | 子 Agent 路由、guided session、contract |
| M5 | 工具治理与读回校验 | P0 | 已实现 | 48 工具治理元数据与运行时拦截 |
| M6 | JD 评估 | P0 | 已实现 | A-G 报告、保存、导出、图片/链接 |
| M7 | JD/报告库 | P0 | 已实现 | saved JDs、reports、PDF |
| M8 | 简历管理 | P0 | 已实现 | 导入、查看、编辑、版本化数据 |
| M9 | 简历修改提案 | P0 | 已实现，重点优化 | proposal、apply、discard、rollback |
| M10 | 优秀简历记忆 | P0 | 已实现 | role category、chunk、embedding、governance |
| M11 | Offer 评估 | P0 | 已实现 | 单 Offer、报告、谈判、HR 清单 |
| M12 | 多 Offer 对比 | P1 | 已实现 | compare offers deep |
| M13 | 面试教练 | P0 | 已实现，重点优化 | JD/简历绑定、一题一答、评分 |
| M14 | 求职画像 | P0 | 已实现，需降噪 | 自我定位、信号提取、方向推荐 |
| M15 | 岗位发现 | P1 | 已实现 | scan queue、scan jobs、dedup |
| M16 | 投递跟踪 | P1 | 已实现 | applications、tracker、pipeline |
| M17 | Analytics | P2 | 已实现 | health、weekly report、趋势 |
| M18 | 图片识别链路 | P0 | 已实现，重点优化 | JD/Offer/简历截图分类与 OCR |
| M19 | 文件导出 | P1 | 已实现 | PDF、Markdown、export artifact |
| M20 | Admin 用户管理 | P0 | 已实现 | 用户列表、审批 |
| M21 | Admin Memory Governance | P0 | 已实现，需 UI 反馈强化 | team memory、候选记忆、索引健康 |
| M22 | Agent Run 监控 | P0 | 已实现 | run、step、phase、verifier |
| M23 | Agent Review/Eval Candidates | P0 | 已实现 | 失败复盘、候选 eval |
| M24 | PostgreSQL/pgvector 数据层 | P0 | 当前 LAN 运行态 | 多用户、向量、run/review |
| M25 | MCP Connector | P1 | 部分实现 | 5 个 shim；外部连接需正规化 |
| M26 | 自动化优化 Loop | P0 | 已设计，需稳定验证 | automation、STATE.md、fallback runner |
| M27 | 跨页面 Agent 状态保持 | P0 | 待重点优化 | 离开 Agent 页再返回不应失忆 |
| M28 | Agent 控制其他页面数据 | P1 | 待重点优化 | 从 Agent 精准改正确页面/数据位置 |
| M29 | 前端可读性与工具卡片 | P0 | 部分实现，需回归 | 工具输出折叠、长内容不溢出 |
| M30 | OpenSpec/gstack 变更治理 | P0 | 流程要求 | 中大改动开 change，用 gstack 审查 |

### 4.2 关键模块需求

#### M1 用户认证与审批

| 需求 | 说明 | 验收 |
|------|------|------|
| 注册 | `/register` 创建用户，后续用户默认 pending | pending 用户不可访问核心业务 |
| 首个用户 | 首个注册用户成为 active admin | 初始化无管理员时可自举 |
| 登录 | `/login` 使用 username/password | active 用户能拿到有效 cookie/token |
| 审批 | `/admin/users` 支持 approve/reject/update | 状态变化有 UI 反馈 |
| 会话 | `/api/users/me` 返回当前用户 | 刷新页面后身份不丢 |

#### M3 Agent Chat

| 需求 | 说明 | 验收 |
|------|------|------|
| 会话列表 | 左侧显示历史会话，支持新建、置顶、删除/恢复 | 切换会话不丢消息 |
| 文本输入 | 支持中文长文本、Markdown、JD/Offer/简历粘贴 | 长文本不撑破布局 |
| 图片输入 | 图片与文字同条消息发送 | UI 展示原图预览，后台接收 full-size |
| 状态显示 | extracting、executing、verifying、responding 等 phase 可见 | 工具运行中用户知道系统在干什么 |
| 工具卡片 | 工具输出以中文名称、状态、摘要、可展开详情展示 | 不直接倾倒 JSON |
| 活动 run | 顶部展示当前 run 状态和继续/查看入口 | continue 不重复刷历史消息 |
| 上下文压缩 | 长会话可生成 memory digest | 压缩不吞掉关键任务状态 |
| 跨页面保持 | 切到其他页面再回 Agent 页，active task/session 保持 | 继续聊天不失忆 |

#### M4 Agent 路由与任务契约

| 任务类型 | 触发场景 | 合同策略 |
|----------|----------|----------|
| `career_positioning_guidance` | 自我定位、方向探索 | guidance |
| `resume_query` | 读取/查看当前简历 | read_only |
| `resume_edit` | 优化、改写、应用、保存简历 | high_risk_verified_write |
| `jd_evaluation` | 评估 JD 文本/链接/截图 | high_risk_verified_write |
| `offer_evaluation` | 评估 Offer、谈判、HR 问题 | high_risk_verified_write 或 guidance |
| `interview_coaching` | 模拟面试、出题、评分 | guidance + session state |
| `profile_update` | 保存画像、提取信号 | verified_write |
| `reference_resume_save` | 保存优秀/参考简历 | high_risk_verified_write |
| `file_export` | 导出报告/简历/PDF | export_verified |

验收重点：

- “我现在的简历是什么”必须路由为 `resume_query`。
- “帮我改这段简历”必须路由为 `resume_edit`，并要求草稿和读回。
- “把这份简历保存成 AI 产品经理优秀简历”必须路由为 `reference_resume_save`。
- 有 active guided task 时，模糊追问继续当前任务；明确切换才切换。

#### M6 JD 评估

| 子功能 | 说明 |
|--------|------|
| 输入 | 粘贴 JD、URL、截图 |
| 抽取 | 链接抓取、OCR/vision、文本规范化 |
| 简历结合 | 用户要求“结合我的简历”时先读取简历/画像 |
| A-G 报告 | 职位概览、简历匹配、职级策略、薪资市场、定制方案、面试准备、合法性风险 |
| 保存 | `reports`、`jds`、`applications` 相关记录 |
| 导出 | PDF/Markdown |
| 复用 | “刚才的 JD”“最近报告”可读取上下文 |

硬约束：

- JD 截图必须经过 image-intake。
- 完整报告不应全部塞进聊天，聊天只给摘要和下一步。
- 保存失败或读回失败时，不能提示“已保存”。

#### M8/M9 简历管理与修改提案

```text
读取当前简历
  -> 识别目标 section
  -> 生成修改草稿/提案
  -> 用户确认
  -> 应用到 cv_data
  -> 读回 hash 校验
  -> 创建版本快照
  -> 返回成功或阻断成功提示
```

| 需求 | 说明 | 验收 |
|------|------|------|
| 只读查询 | 查看当前简历、ATS、技能差距 | 不触发写入门禁 |
| 草稿提案 | `resume_edit_proposals` 保存 pending draft | 有 base hash 和 proposed hash |
| 应用 | 用户确认后 apply | 目标 section read-back hash 匹配 |
| 丢弃/回滚 | discard/rollback | 状态转移可读回 |
| 精准定位 | 从 Agent 要求改某个页面/某个 section | 不写错位置、不只写一半 |

#### M10 优秀简历记忆

| 步骤 | 要求 |
|------|------|
| 导入 | 支持粘贴、上传、解析 |
| 岗位确认 | 必须确认 role category，例如 AI 产品经理、AI 运营、AI 售前 |
| 可见性 | 默认 private；team 共享需 admin 审核 |
| Chunk | 按 section 切分 |
| Embedding | 1536 维 pgvector |
| 检索 | 按角色、相似度、质量、反馈排序 |
| 防复制 | no-copy overlap guard |
| 治理 | admin 可审核、禁用、处理索引失败 |

#### M13 面试教练

| 需求 | 说明 | 验收 |
|------|------|------|
| 材料绑定 | 绑定 JD/resume snapshot | active session 中不静默换材料 |
| 一题一答 | 每轮只问一道题或一个追问 | 一次多题违规率 0 |
| 回答评分 | 使用 rubric 给分和反馈 | 分数、优点、改进点结构化 |
| 追问 | 根据回答生成追问 | 不丢失原题上下文 |
| 复盘 | 存储 transcript、scoreArtifacts、recap | 可在历史中查看 |

#### M14 求职画像

| 功能 | 说明 |
|------|------|
| 自我定位 | 阶段式深挖，一次一个问题 |
| 能力分析 | 读取简历、投递和历史信号 |
| 方向推荐 | 基于画像推荐方向，不直接推荐具体 JD |
| 信号质量门 | 拒绝碎片词、泛泛描述、JD 要求片段 |
| 写入 | profile/profile_signals 必须有证据和读回 |

#### M26 自动化优化 Loop

标准五步：

1. **发现**：读取 CI、最新 commit、run review、eval candidates、用户列出的重点问题、自检用例。
2. **交接**：调度系统创建任务，使用 git worktree 隔离执行 agent。
3. **修复**：执行 agent 在独立 worktree 做最小修复；必要时多个 agent 并行。
4. **验证**：独立 evaluator agent 打分，>= 90/100 才通过；否则退回修复。
5. **持久化**：写 STATE.md、automation memory、eval 草案、OpenSpec/gstack 审查记录。

当前重点问题池：

- 自我定位跑偏。
- 子 Agent 状态不能持久化。
- Agent 间跳转/路由错误。
- 工具输出不是折叠卡片。
- 工具调用失败、错误、缺 read-back。
- Agent 输出被拦截、截断、吞掉。
- 图片/JD/Offer/简历识别链路失败。
- 简历修改保存但未落库。
- Agent Run 继续按钮重复刷消息。
- 记忆治理按钮无反馈。
- 聊天页长内容横向溢出。
- 从 Agent 页跳到其他页面再回来，Agent 状态丢失。
- Agent 控制其他页面数据时定位不准、无法写入或只写一半。
- eval 候选未沉淀为回归测试。

### 4.3 全模块详细规格

本节把 M1-M30 从“模块名称”展开为可执行需求。每个模块都按入口、输入、处理、输出、数据、状态、验收和失败态描述，供后续 OpenSpec change、实现任务、eval 和 gstack 审查直接引用。

#### M1 用户认证与审批

| 项 | 规格 |
|----|------|
| 页面入口 | `/login`、`/register`、`/admin/users` |
| API | `/api/auth/login`、`/api/auth/logout`、`/api/auth/register`、`/api/users/me`、`/api/admin/users`、`/api/admin/users/[id]` |
| 输入 | username、password、displayName/email；管理员动作 approve/reject/update role/status |
| 处理 | 首个用户自举为 active admin；后续注册进入 pending；登录校验 bcrypt hash；cookie/token 绑定 user 和 token_version |
| 输出 | 当前用户信息、登录态、审批结果 |
| 数据 | `users.id`、`username`、`password_hash`、`display_name`、`role`、`status`、`token_version`、`last_login_at` |
| 状态 | `pending`、`active`、`rejected` 或禁用态（以代码实际枚举为准） |
| 验收 | pending 用户不能访问业务页面；active admin 能看到用户列表；logout 后 `/api/users/me` 失效 |
| 失败态 | 密码错误返回明确错误；pending 登录不能静默进入；token_version 变化后旧会话失效 |

#### M2 首页/工作台

| 项 | 规格 |
|----|------|
| 页面入口 | `/` |
| 输入 | 当前用户、最近报告、最近投递、扫描状态、Agent 建议入口 |
| 处理 | 从业务数据汇总今日/本周求职状态；提供到 Agent、CV、Evaluate、Interview、Discover、Tracker 的主路径 |
| 输出 | 当前求职概览、关键提醒、最近活动、主要 CTA |
| 数据 | reports、applications、jds、offers、sessions、scan_queue |
| 验收 | 首屏能说明用户“现在该做什么”；入口不依赖旧 CLI 文件；未登录跳转登录 |
| 失败态 | 数据为空时显示空态和下一步，不显示假统计 |

#### M3 Agent Chat

| 项 | 规格 |
|----|------|
| 页面入口 | `/agent` |
| API | `/api/agent/run`、`/api/agent/chat`、`/api/agent/image-intake`、`/api/sessions`、`/api/agent/runs` |
| 输入 | 用户文本、图片文件、当前 sessionId、active task、pending confirmations、selected agent |
| 处理 | 保存用户消息；图片预处理；任务路由；子 Agent 选择；工具治理；SSE 输出；写入 read-back；run ledger |
| 输出 | assistant message、tool cards、phase、active run、clarification、error recovery |
| 数据 | `sessions.messages_json`、`sessions.agent_state_json`、`agent_runs`、`agent_run_steps` |
| UI 状态 | idle、extracting_ocr、compressing_context、executing、verifying、responding、done、failed |
| 验收 | 长内容不横向撑破；工具结果折叠；切换页面回来继续 active task；失败有可见解释 |
| 失败态 | final message null、tool error、read-back fail、image conflict、stream abort 均写 run/review 证据 |

#### M4 Agent 路由与任务契约

| 项 | 规格 |
|----|------|
| 入口 | `classifyIntent()`、`routeAgentTask()`、`createAgentTaskContract()` |
| 输入 | agentId、用户文本、imageIntake、preferredDocumentType、activeTask |
| 处理 | 先处理图片决策和 active guided task，再做 intent regex 与 task contract 映射 |
| 输出 | taskType、contractPolicy、allowedTools、memoryTask、clarificationQuestion、auditSummary |
| 关键合同 | `resume_query` read_only；`resume_edit` high_risk_verified_write；`jd_evaluation` high_risk_verified_write；`file_export` export_verified |
| 验收 | 每个用户高频意图有 deterministic eval；模糊续聊锁定 active task；明确切换可脱离 active task |
| 失败态 | 路由冲突必须问澄清；不允许模型靠自由文本自行决定写入 |

#### M5 工具治理与读回校验

| 项 | 规格 |
|----|------|
| 入口 | `TOOL_GOVERNANCE_REGISTRY`、ToolRegistry、readback verification |
| 输入 | toolName、params、active contract、agentId、tool result |
| 处理 | 检查 effect、allowedTaskTypes、agentAllowlist、confirmation、readBack、successContract |
| 输出 | allowed/blocked decision、verifiedAction、safeMessage、tool card payload |
| 数据 | tool metadata、agent_run_steps.verifier_json |
| 验收 | 48 个工具全部有治理元数据；dev/test 缺 metadata 默认拒绝；写入类工具 read-back 覆盖率 100% |
| 失败态 | 缺读回时强制不能 claim success；工具被拦截时必须解释原因并写审计 |

#### M6 JD 评估

| 项 | 规格 |
|----|------|
| 页面入口 | `/evaluate`、`/evaluate/jds`、`/evaluate/reports`、`/agent` |
| API | `/api/evaluate`、`/api/evaluate/jd`、`/api/evaluate/stream`、`/api/data/reports`、`/api/data/jds`、`/api/reports/[reportNum]/pdf` |
| 输入 | JD 文本、URL、截图 OCR、用户简历/画像上下文、目标岗位 |
| 处理 | source extraction -> A-G evaluation -> report/JD persistence -> read-back -> summary response |
| 输出 | 总分、投递建议、A-G blocks、风险、定制方案、面试准备、PDF |
| 数据 | `reports`、`jds`、`applications` |
| 验收 | 评估保存后能在报告库读到；导出 PDF 非空；“修改报告元数据”不重跑评估 |
| 失败态 | 来源内容为空、链接抓取失败、图片 OCR 失败、保存读回失败均不得提示成功 |

#### M7 JD/报告库

| 项 | 规格 |
|----|------|
| 页面入口 | `/evaluate/jds`、`/evaluate/reports`、`/evaluate/history` |
| 输入 | reportNum、company、role、keywords、date、source_hash |
| 处理 | 列表筛选、详情读取、报告导出、元数据更新 |
| 输出 | 报告列表、JD 列表、详情、下载链接 |
| 数据 | `reports.report_num`、`reports.blocks_json`、`jds.body`、`jds.report_id` |
| 验收 | “刚才的 JD/最近报告”能被 Agent 读取；报告编号按用户隔离；导出文件 hash 可验证 |
| 失败态 | reportNum 不存在返回可理解错误；不允许读到其他用户报告 |

#### M8 简历管理

| 项 | 规格 |
|----|------|
| 页面入口 | `/cv`、`/agent` |
| API | `/api/cv/data`、`/api/cv/import`、`/api/cv/analyze`、`/api/cv/score`、`/api/cv/ats-check`、`/api/cv/generate-pdf` |
| 输入 | 简历文件、粘贴文本、结构化 sections、模板选择 |
| 处理 | parse -> normalize sections -> save cv_data -> analyze/score/ATS/PDF |
| 输出 | 结构化简历、评分、ATS 建议、PDF |
| 数据 | `cv_data.data_json` |
| 验收 | “查看简历”只读；导入后可在 `/cv` 和 Agent 中读取同一份数据；PDF 生成非空 |
| 失败态 | 解析失败返回可编辑 fallback；不得覆盖已有简历除非用户确认 |

#### M9 简历修改提案

| 项 | 规格 |
|----|------|
| API | `/api/cv/edit-proposals`、`/[id]`、`/[id]/apply`、`/[id]/discard`、`/[id]/rollback` |
| 输入 | sectionId、originalContent、proposedContent、baseVersion、baseHash、reason |
| 处理 | 生成 pending proposal；应用前校验 base hash；应用后读回 target section hash；记录 status |
| 输出 | proposal detail、diff、risk flags、verifiedAction |
| 数据 | `resume_edit_proposals`、`cv_data` |
| 状态 | pending、applied、discarded、stale、rolled_back |
| 验收 | 应用前必须用户确认；stale proposal 不可直接应用；rollback 可恢复前一版本 |
| 失败态 | hash mismatch、section 不存在、read-back 不匹配时阻断“已保存” |

#### M10 优秀简历记忆

| 项 | 规格 |
|----|------|
| 页面入口 | `/cv` reference library、`/admin/memory`、`/agent` |
| API | `/api/cv/references`、`/api/cv/import-reference`、`/api/cv/references/[id]`、`/[id]/reindex`、`/api/admin/reference-resumes` |
| 输入 | 参考简历文本/文件、roleCategory、visibility、tags、notes |
| 处理 | role confirmation -> parse sections -> quality score -> redaction -> chunk -> embedding -> governance |
| 输出 | reference resume、chunks、embedding status、retrieval guidance |
| 数据 | `reference_resumes`、`reference_resume_chunks`、`reference_resume_usage` |
| 状态 | visibility private/team_pending/team；status active/disabled；embedding pending/embedded/failed/skipped |
| 验收 | 未确认岗位方向不得保存；team_pending 未审核不得被他人检索；no-copy guard 生效 |
| 失败态 | embedding 失败保留记录并进入治理，不影响原简历记录读回 |

#### M11 Offer 评估

| 项 | 规格 |
|----|------|
| 页面入口 | `/compare`、`/agent` |
| API | `/api/offers`、`/api/offers/[id]`、`/api/offer-reports`、`/api/offer-reports/[id]` |
| 输入 | 公司、岗位、薪资、薪数、奖金、社保公积金、试用期、地点、合同主体、补充条款、截图/文本 |
| 处理 | 单 Offer 结构化 -> 风险识别 -> 总分/verdict -> 保存 offer/report -> read-back |
| 输出 | score、verdict、summary、red flags、missing info、negotiation levers、HR questions、take-home |
| 数据 | `offers`、`offer_reports` |
| 验收 | 已有报告解释/谈判/HR 清单优先复用，不默认重跑；补充关键事实时标记旧报告可能 stale |
| 失败态 | 缺关键薪资字段时进入 missing info；保存失败不提示完成 |

#### M12 多 Offer 对比

| 项 | 规格 |
|----|------|
| 页面入口 | `/compare`、`/agent` |
| 输入 | 2 个或更多 Offer/report |
| 处理 | 统一年包、城市成本、确定性、成长性、风险、谈判空间；对比多个方案 |
| 输出 | 对比表、推荐、权衡、红线、下一步谈判 |
| 数据 | `offers_json`、`offer_reports.report_type='comparison'` |
| 验收 | 只有用户明确要求多个 Offer 对比才调用；单 Offer 不误进 compare |
| 失败态 | Offer 数量不足时要求补充，不编造另一个 Offer |

#### M13 面试教练

| 项 | 规格 |
|----|------|
| 页面入口 | `/interview`、`/agent` |
| API | `/api/interview/coach`、`/api/interview/coach/stream`、`/api/interview/generate`、`/api/interview/score`、`/api/agent/coach/session` |
| 输入 | JD、简历快照、目标公司、岗位、用户回答、coach mode |
| 处理 | bind snapshot -> generate one question -> collect answer -> score -> follow-up/next -> recap |
| 输出 | question、rubric、score、feedback、follow-up、recap |
| 数据 | `sessions.interview_state_json`、`stories` |
| 验收 | active session 不静默换 JD/简历；一次只问一题；评分可追溯到用户回答 |
| 失败态 | 缺 JD/简历时可先问澄清；不能凭空声称已绑定 |

#### M14 求职画像

| 项 | 规格 |
|----|------|
| 页面入口 | `/profile`、`/agent` |
| API | `/api/profile/analyze`、`/api/profile/dna`、`/api/data/profile`、`/api/data/signals`、`/api/data/signals/batch` |
| 输入 | 用户经历、简历、对话回答、投递/报告信号 |
| 处理 | 自我定位深挖 -> 信号抽取 -> 质量门 -> profile update -> read-back |
| 输出 | Career DNA、target roles、优势/短板、建议方向、可行动问题 |
| 数据 | `profiles`、`profile_signals` |
| 验收 | 每轮只问一个定位问题；低质碎片不入库；写入后可在 profile 页面读到 |
| 失败态 | 用户不确定时继续引导，不强行生成结论 |

#### M15 岗位发现

| 项 | 规格 |
|----|------|
| 页面入口 | `/discover` |
| API | `/api/scan`、`/api/scan/status`、`/api/scan/history`、`/api/scan/jobs`、`/api/scan/jobs/[id]`、`/api/scan/jobs/[id]/jd` |
| 输入 | 公司列表、title positive/negative、location、maxResults、portal config |
| 处理 | enqueue scan -> worker fetch -> dedup -> save scan_jobs -> optional JD save |
| 输出 | scan status、jobs found/new、error log、JD snippet/detail |
| 数据 | `scan_queue`、`scan_jobs`、`jds` |
| 状态 | pending、running、done、failed；job new/saved/ignored/error |
| 验收 | 同一 dedup_key 不重复；失败公司写 error_log；用户可从 job 保存 JD |
| 失败态 | 外部站点失败不影响整个扫描；显示公司级错误 |

#### M16 投递跟踪

| 项 | 规格 |
|----|------|
| 页面入口 | `/tracker` |
| API | `/api/data/applications`、`/api/pipeline/enqueue` |
| 输入 | company、role、date、status、score、notes、report linkage |
| 处理 | 新增/更新投递；归一化状态；与报告/JD 关联 |
| 输出 | 投递列表、状态统计、下一步提醒 |
| 数据 | `applications` |
| 验收 | 同用户 company+role 唯一；状态变更不丢 notes；Agent 可查询最近投递 |
| 失败态 | 重复投递提示合并，不创建幽灵记录 |

#### M17 Analytics

| 项 | 规格 |
|----|------|
| 页面入口 | `/analytics` |
| API | `/api/analytics/health-check`、`/api/analytics/weekly-report` |
| 输入 | applications、reports、offers、sessions、scan results |
| 处理 | 聚合本周进展、健康度、转化、风险、建议 |
| 输出 | pipeline health、weekly summary、趋势卡片 |
| 数据 | applications/reports/offers/profile |
| 验收 | 数据为空时显示行动建议；统计按 user_id 隔离 |
| 失败态 | 聚合接口失败时页面局部降级 |

#### M18 图片识别链路

| 项 | 规格 |
|----|------|
| 入口 | `/api/agent/image-intake`、`/api/ocr/jd-screenshot` |
| 输入 | full-size image、user text intent、preferred document type |
| 处理 | image variants -> OCR/vision -> document classification -> route decision |
| 输出 | documentType、extractedText、confidence、route、clarification/retryHint |
| 文档类型 | jd、offer、resume、unrelated、ambiguous |
| 验收 | 文本和图片冲突时必须澄清；缩略图/低置信度返回 retry_image |
| 失败态 | OCR timeout、image too small、unsupported format 都不能进入业务成功态 |

#### M19 文件导出

| 项 | 规格 |
|----|------|
| API | `/api/export-file`、`/api/generate-cv-pdf`、`/api/reports/[reportNum]/pdf`、`/api/cv/generate-pdf` |
| 输入 | artifact type、reportNum/cv version、format |
| 处理 | render -> save/export -> size/hash verification |
| 输出 | download path、filename、hash、size |
| 验收 | 文件存在且 size > 0；hash 返回给 tool result；导出失败不显示成功 |
| 失败态 | 模板渲染失败、文件写入失败、PDF 空文件要进入 file_export fail |

#### M20 Admin 用户管理

| 项 | 规格 |
|----|------|
| 页面入口 | `/admin/users` |
| API | `/api/admin/users`、`/api/admin/users/[id]` |
| 输入 | user id、status、role、displayName |
| 处理 | 权限检查 -> 状态变更 -> token_version 可选更新 |
| 输出 | 用户列表、操作结果 |
| 验收 | 非 admin 禁止访问；操作后 UI 即时反馈；不能误改当前唯一 admin 为不可用 |
| 失败态 | 权限不足返回 403；用户不存在返回 404 |

#### M21 Admin Memory Governance

| 项 | 规格 |
|----|------|
| 页面入口 | `/admin/memory` |
| API | `/api/admin/memory`、`/api/admin/reference-resumes` |
| 输入 | approve/reject/disable/reindex/promote candidate |
| 处理 | 读取 memory health -> 执行状态转移 -> 写 transition -> 刷新 summary |
| 输出 | pending team references、failed embeddings、candidate memories、risk references |
| 数据 | reference_resumes、memory_items、memory_status_transitions、memory_chunks |
| 验收 | 每个按钮有 loading/success/error；状态变化读回；失败 embedding 可重试 |
| 失败态 | 按钮无反馈、状态未变、错误被吞均为 P1 |

#### M22 Agent Run 监控

| 项 | 规格 |
|----|------|
| 页面入口 | `/admin/agent-runs`、Agent Chat active run strip |
| API | `/api/agent/runs`、`/api/agent/runs/[id]`、`/api/agent/runs/[id]/steps`、`/api/admin/agent-runs` |
| 输入 | runId、sessionId、status filters |
| 处理 | 记录 task contract、phase、tool、verifier、error、result |
| 输出 | run list、run detail、step timeline、recovery actions |
| 状态 | planned、running、waiting_user、verifying、repairing、recovered、needs_engineering、succeeded、failed、rolled_back、cancelled |
| 验收 | 每个高风险 Agent 任务有 run；失败 run 可追溯 tool/error/verifier |
| 失败态 | continue 重复消息、run 无终态、step 缺 verifier 都进入 review |

#### M23 Agent Review/Eval Candidates

| 项 | 规格 |
|----|------|
| 页面入口 | `/admin/agent-reviews` |
| API | `/api/admin/agent-reviews`、`/[id]`、`/summary`、`/api/admin/agent-eval-candidates/[id]` |
| 输入 | terminal run、reviewer version、admin decision |
| 处理 | deterministic review -> failure type -> score/verdict -> eval candidate -> accept/reject/promote |
| 输出 | review detail、failure taxonomy、suggested fix、candidate fixture |
| 状态 | review verdict pass/warning/fail；candidate/rejected/accepted/promoted |
| 验收 | P0 失败必须生成候选；候选可提升为回归草案；管理员动作有读回 |
| 失败态 | review 没生成、候选重复、按钮无反馈均为治理问题 |

#### M24 PostgreSQL/pgvector 数据层

| 项 | 规格 |
|----|------|
| 配置 | `DB_DRIVER=postgres`、`DATABASE_URL`、pgvector extension |
| 脚本 | `check:postgres`、`migrate:postgres`、`check:postgres-migration`、`check:postgres-cutover`、`backup:postgres`、`restore:postgres` |
| 处理 | repository-backed data access；Postgres runtime；SQLite fallback/archive |
| 验收 | runtime 走 repository；cutover check 发现 SQLite 直连；pgvector 1536 维可用 |
| 失败态 | Postgres 已有新数据导致 migration hash/count 不一致时，要解释而不是误判服务未起 |

#### M25 MCP Connector

| 项 | 规格 |
|----|------|
| API | `/api/agent/mcp/call` |
| 工具 | `web_search`、`search_jobs`、`get_weather`、`search_place`、`get_directions` |
| 输入 | connector name、tool name、params、user/session context |
| 处理 | 服务端代理调用外部 MCP/服务；记录错误；返回结构化结果 |
| 输出 | normalized tool result、source、error/retry info |
| 验收 | 外部连接不暴露密钥；失败可见；读数据库等外部操作需 connector 正规化 |
| 失败态 | MCP unavailable、timeout、schema mismatch 不得被吞 |

#### M26 自动化优化 Loop

| 项 | 规格 |
|----|------|
| 入口 | official cron automation、fallback heartbeat runner、`skills/agent-system-optimization-loop/STATE.md` |
| 输入 | CI/test 状态、git commit、run reviews、eval candidates、用户问题池、automation memory |
| 处理 | discover -> handoff -> repair -> evaluate -> persist |
| 输出 | STATE 更新、memory 更新、OpenSpec change、worktree、eval、summary |
| 验收 | 每轮可证明工具执行和状态写回；official cron 空跑由探针发现并触发修复 |
| 失败态 | 无新 session、session 空跑、未写 STATE、无 evaluator、无 worktree 均不能标记健康 |

#### M27 跨页面 Agent 状态保持

| 项 | 规格 |
|----|------|
| 入口 | `/agent` 与任意业务页面之间跳转 |
| 输入 | sessionId、agent_state_json、active run、guided task、pending confirmation |
| 处理 | 页面卸载前保存；页面恢复时 hydrate；与 Dexie/服务器 session reconcile |
| 输出 | 恢复后的会话、active task、tool state |
| 验收 | Agent -> CV -> Agent 后继续简历修改不会失忆；Agent -> Evaluate -> Agent 后“刚才 JD”可读 |
| 失败态 | sessionId 变更、active task 丢失、pending confirmation 丢失均为 P0 |

#### M28 Agent 控制其他页面数据

| 项 | 规格 |
|----|------|
| 场景 | 在 Agent 页面要求修改 CV、报告元数据、Offer、画像、设置等其他页面对应数据 |
| 输入 | 用户自然语言目标、目标页面/实体/字段、当前数据快照 |
| 处理 | target resolver -> preview/diff -> confirmation if write -> API write -> read-back -> link to target page |
| 输出 | 修改摘要、目标页面链接、read-back 证据 |
| 验收 | 能精准写入正确实体和字段；不能只写一半；跨页面刷新后数据一致 |
| 失败态 | 目标不明确必须问澄清；不允许猜测写入 |

#### M29 前端可读性与工具卡片

| 项 | 规格 |
|----|------|
| 范围 | Agent Chat message、Markdown、tool card、run strip、admin detail |
| 输入 | 长文本、表格、代码块、工具 JSON、错误、PDF/export result |
| 处理 | sanitize markdown；container wrapping；tool summary extraction；details collapse |
| 输出 | 可扫描聊天流和可展开证据 |
| 验收 | 无全局横向滚动；工具卡默认折叠；错误可复制；移动端不重叠 |
| 失败态 | 长 URL/表格撑破、JSON 铺满、按钮文字溢出均为 UI regression |

#### M30 OpenSpec/gstack 变更治理

| 项 | 规格 |
|----|------|
| 触发 | 中大幅功能/架构/数据/Agent 行为改动 |
| 输入 | 问题证据、范围、目标、验收、风险 |
| 处理 | 创建 OpenSpec change；实现前后用 gstack review/qa/design review 按需审查 |
| 输出 | change proposal、tasks、spec delta、review report、eval |
| 验收 | 修复和 PRD/架构/测试一致；不绕过用户未提交改动 |
| 失败态 | 大改无 change、无审查、无 eval、无状态沉淀均不能进入 loop done |

### 4.4 用户流程规格

| 流程 | 前置条件 | 主路径 | 成功输出 | 阻断条件 |
|------|----------|--------|----------|----------|
| JD 截图评估 | 用户登录，有截图 | 上传 -> image-intake -> `jd_evaluation` -> `evaluate_jd_full` -> 保存/读回 | 摘要 + 报告链接 | OCR 失败、文档冲突、保存读回失败 |
| 简历只读查询 | 已有 `cv_data` | 提问 -> `resume_query` -> `read_file` -> 回答 | 当前简历摘要/全文 | 不得进入 resume_edit |
| 简历修改 | 已有简历，用户明确修改 | 读取 -> proposal -> 用户确认 -> apply -> read-back | 已应用 + 版本证据 | 用户未确认、hash mismatch |
| 优秀简历保存 | 有参考简历内容 | 确认 role category/visibility -> 保存 -> chunk/embed -> read-back | reference id + 状态 | 未确认岗位、读回失败 |
| Offer 谈判 | 有 offer/report | read offer report -> negotiation strategy | 谈判策略 | 不得默认重新评估 |
| 面试模拟 | 有 JD/简历或可读取最近材料 | bind -> one question -> answer -> score -> next | 题目/评分/复盘 | 缺材料、一次多题 |
| 自我定位 | 用户表达迷茫/定位 | guided session -> one question -> signal extraction -> profile update | 阶段总结/画像 | 跳任务、低质信号 |
| Loop 修复 | 有失败候选/用户问题 | discover -> worktree -> repair -> evaluator -> persist | STATE/eval/summary | evaluator < 90、未隔离 |

### 4.5 UI 状态与可见反馈规格

| 状态 | 出现场景 | 用户可见文案/反馈 | 不允许 |
|------|----------|-------------------|--------|
| `extracting_ocr` | 图片上传后 | 正在识别图片内容 | 无提示等待 |
| `executing` | 工具运行中 | 工具卡 loading + 中文工具名 | 只显示空白 |
| `verifying` | 写入/导出后 | 正在校验保存结果 | 直接说成功 |
| `waiting_user` | 需要确认 | 展示确认按钮/草稿 diff | 自动执行 |
| `repairing` | 可恢复错误 | 展示正在重试/修复 | 吞掉错误 |
| `needs_engineering` | 代码/基础设施问题 | 明确需要工程修复 | 假装已解决 |
| `succeeded` | 全部成功标准满足 | 显示完成和证据 | 缺读回仍成功 |
| `failed` | 不可恢复失败 | 显示失败原因和下一步 | 只返回泛泛道歉 |

---

## 5. Model Story

```text
早上：用户在通勤时看到 JD 截图
  -> 上传到 Agent Chat
  -> 系统识别为 JD
  -> 结合当前简历和画像评估
  -> 保存报告和 JD
  -> 给出投递/不投/谨慎结论

下午：用户决定投这个岗位
  -> 要求“针对刚才 JD 优化项目经历”
  -> Resume Agent 读取当前简历和 JD
  -> 创建修改提案
  -> 用户确认
  -> 应用、读回、版本快照

晚上：用户准备面试
  -> Interview Agent 绑定这个 JD 和简历快照
  -> 一次问一道题
  -> 用户回答
  -> 评分、追问、复盘

周末：系统自动 loop 审查 Agent 运行
  -> 找到失败 run/eval candidate
  -> 开 worktree 分发修复
  -> evaluator 打分
  -> 沉淀回归 eval
```

系统承诺：

- 知道自己在执行哪个任务。
- 知道哪个工具可以调用、哪个不能调用。
- 知道写入是否真的成功。
- 知道何时不能说“已完成”。
- 知道会话和长期记忆的边界。
- 知道失败要留下证据，进入复盘治理。

---

## 6. Agent 架构设计

### 6.1 总体架构

```text
Agent Chat UI
  -> image/file preprocessing
  -> /api/agent/image-intake
  -> image-intake-router
  -> guided-session-state
  -> task-routing
  -> orchestrator/classifyIntent
  -> selected sub-agent
  -> tool-governance
  -> server-runner/client-runner
  -> read-back verification
  -> agent_runs / agent_run_steps
  -> run-review / eval candidates
```

### 6.2 子 Agent

| Agent | ID | 职责 | 关键工具 |
|-------|----|------|----------|
| 路由器 | `orchestrator` | 内部意图分类 | 无业务工具 |
| 通用助手 | `general` | 兜底求职咨询、状态查询 | 全部工具白名单 |
| JD 评估 | `evaluate` | JD 评估、报告、风险 | `evaluate_jd_full`、`get_recent_jd_context`、`fetch_jd_content`、`download_report_pdf` |
| 简历优化 | `resume` | 简历读取、优化、提案、导出 | `read_file`、`create_resume_edit_proposal`、`apply_resume_edit_proposal`、`save_reference_resume` |
| 面试教练 | `interview` | 出题、模拟、评分 | `generate_interview_questions`、`score_interview_answer`、`start_interview_session` |
| 求职画像 | `profile` | 自我定位、画像、推荐 | `self_positioning`、`mine_profile`、`get_profile` |
| Offer 顾问 | `offer` | Offer 评估、谈判、HR 问题 | `evaluate_offer`、`read_offer_report`、`compare_offers_deep` |

### 6.3 路由优先级

1. 显式切换短语，例如“用简历模式”“切换到面试”。
2. 子 Agent intent pattern，按 priority 排序。
3. active guided session 锁定。
4. image-intake 文档类型覆盖普通文本猜测。
5. `general` 兜底。

### 6.4 任务锁

| 用户输入 | 行为 |
|----------|------|
| “继续”“那下一步呢” | 延续当前任务 |
| “不是，我要评估这个 JD” | 询问或确认切换 |
| 上传新 JD 图片 | 进入 image clarification 或切换评估 |
| 纠正格式问题 | 不丢当前 JD/简历绑定 |

---

## 7. 工具体系与治理

### 7.1 工具分类

| 类别 | 数量 | 示例 |
|------|------|------|
| Query | 15 | `read_file`、`get_profile`、`get_report_detail`、`read_offer_report` |
| Action | 26 | `evaluate_jd_full`、`evaluate_offer`、`save_reference_resume`、`apply_resume_edit_proposal` |
| Interview | 2 | `generate_interview_questions`、`score_interview_answer` |
| MCP shim | 5 | `web_search`、`search_jobs`、`get_weather`、`search_place`、`get_directions` |

### 7.2 治理元数据

| 字段 | 说明 |
|------|------|
| `effect` | read、guide、write、high_risk_write、export、admin、internal |
| `allowedTaskTypes` | 允许的任务合同 |
| `agentAllowlist` | 允许调用的 Agent |
| `documentTypes` | 关联文档类型 |
| `requiresUserConfirmation` | 是否需要用户确认 |
| `requiresReadBack` | 是否需要读回 |
| `successContract` | 成功证据 |
| `userVisibleNameZh` | 前端中文展示名 |

### 7.3 运行时拦截

| 拦截类型 | 示例 |
|----------|------|
| 任务不匹配 | 自我定位任务调用 Offer 评估 |
| Agent 不允许 | Interview Agent 调用简历保存 |
| 缺读回 | 简历应用成功但无 hash 读回 |
| 未确认 | 高风险写入未获用户确认 |
| 文档类型冲突 | JD 图片被当 Offer 评估 |

### 7.4 48 工具目录

| 工具 | 类别 | 主要任务 | 是否写入/读回 |
|------|------|----------|----------------|
| `search_applications` | query | 投递查询 | 只读 |
| `get_report_detail` | query | 报告读取 | 只读 |
| `get_reference_detail` | query | 参考简历读取 | 只读 |
| `read_file` | query | 读取简历/报告/参考材料 | 只读 |
| `get_profile` | query | 画像读取 | 只读 |
| `get_recent_activity` | query | 最近活动 | 只读 |
| `get_recent_jd_context` | query | 最近 JD 上下文 | 只读 |
| `get_recommendations` | query | 岗位方向推荐 | 只读/引导 |
| `get_pipeline_status` | query | 投递状态 | 只读 |
| `decode_black_market_terms` | query | 风险黑话识别 | 只读 |
| `check_pipeline_health` | query | pipeline 健康 | 只读 |
| `get_profile_insights` | query | 画像洞察 | 只读 |
| `detect_skill_gaps` | query | 技能差距 | 只读 |
| `check_ats_compatibility` | query | ATS 检查 | 只读 |
| `read_offer_report` | query | Offer 报告读取 | 只读 |
| `evaluate_jd` | action | 旧版 JD 初评 | 不持久化 |
| `evaluate_jd_full` | action | 完整 JD 评估 | 写入，必须读回 |
| `evaluate_offer` | action | Offer 评估 | 写入，必须读回 |
| `generate_cv` | action | 简历草稿生成 | 引导，不直接保存 |
| `scan_portals` | action | 岗位扫描 | 写入扫描队列/结果 |
| `check_health` | action | 系统健康 | 只读 |
| `fetch_jd_content` | action | JD 链接抓取 | 只读 |
| `export_file` | action | 文件导出 | 导出，必须验证文件 |
| `import_resume` | action | 导入简历 | 写入，必须读回 |
| `mine_profile` | action | 画像挖掘 | 写入，必须质量门 |
| `analyze_jd_risks` | action | JD 风险分析 | 只读 |
| `self_positioning` | action | 自我定位 | 引导/可写画像 |
| `prepare_interview_full` | action | 面试准备 | 写 session state |
| `compare_offers_deep` | action | 多 Offer 对比 | 只读或报告写入 |
| `generate_offer_negotiation_strategy` | action | 谈判策略 | 引导 |
| `generate_offer_hr_question_list` | action | HR 问题 | 引导 |
| `start_interview_session` | action | 启动面试 session | 写 session state |
| `optimize_resume_section` | action | 优化简历 section | 生成草稿 |
| `create_resume_edit_proposal` | action | 创建简历提案 | 写入，必须读回 |
| `apply_resume_edit_proposal` | action | 应用简历提案 | 高风险写入，必须确认和读回 |
| `discard_resume_edit_proposal` | action | 丢弃提案 | 高风险写入，必须读回 |
| `rollback_resume_edit_proposal` | action | 回滚提案 | 高风险写入，必须读回 |
| `save_resume_section` | action | 保存简历 section | 高风险写入，必须读回 |
| `save_reference_resume` | action | 保存优秀简历 | 高风险写入，必须读回 |
| `download_report_pdf` | action | 下载报告 PDF | 导出，必须验证文件 |
| `update_report_metadata` | action | 更新报告元数据 | 写入，必须读回 |
| `generate_interview_questions` | interview | 面试出题 | 引导 |
| `score_interview_answer` | interview | 回答评分 | 可写 session |
| `web_search` | MCP shim | Web 搜索 | 外部只读 |
| `get_weather` | MCP shim | 天气 | 外部只读 |
| `search_place` | MCP shim | 地点搜索 | 外部只读 |
| `get_directions` | MCP shim | 路线规划 | 外部只读 |
| `search_jobs` | MCP shim | 职位搜索 | 外部只读 |

### 7.5 工具成功契约模板

| 工具类型 | 必须返回 | 不能返回 |
|----------|----------|----------|
| read | 数据摘要、来源、空结果说明 | 伪造空缺数据 |
| guide | 下一步问题/建议、依据 | 声称已写入 |
| write | 写入 id、readBack.ok、readBack.hash/状态 | 仅自然语言“成功” |
| high_risk_write | 用户确认记录、baseHash、readBack、version/status | 未确认直接 apply |
| export | filename、size、hash/path | 空文件成功 |
| admin | actor、previousStatus、nextStatus、readBack | 无权限状态变更 |
| external/MCP | source、latency/error、recoverable | 吞掉外部错误 |

---

## 8. 服务层架构

### 8.1 前端页面

当前有 22 个页面入口：

| 页面 | 说明 |
|------|------|
| `/` | 首页/工作台 |
| `/login`、`/register` | 登录注册 |
| `/agent` | Agent Chat 主入口 |
| `/cv` | 简历工作台 |
| `/evaluate`、`/evaluate/jds`、`/evaluate/reports`、`/evaluate/history` | JD 和报告 |
| `/compare` | Offer 对比 |
| `/interview` | 面试教练 |
| `/profile` | 求职画像 |
| `/discover` | 岗位发现 |
| `/tracker` | 投递跟踪 |
| `/analytics` | 求职分析 |
| `/explore` | 探索/发现入口 |
| `/settings` | 设置 |
| `/admin/users` | 用户管理 |
| `/admin/insights` | 团队洞察 |
| `/admin/memory` | 记忆治理 |
| `/admin/agent-runs` | Agent Run 监控 |
| `/admin/agent-reviews` | Agent 复盘治理 |

### 8.2 API 总览

当前 `src/app/api` 下有 112 个 route。按域拆分：

| 域 | 代表端点 | 说明 |
|----|----------|------|
| Auth/User | `/api/auth/login`、`/api/auth/register`、`/api/users/me` | 登录注册和当前用户 |
| Agent | `/api/agent/chat`、`/api/agent/run`、`/api/agent/image-intake`、`/api/agent/runs` | Agent Loop、图片、run |
| Agent Governance | `/api/admin/agent-runs`、`/api/admin/agent-reviews`、`/api/admin/agent-eval-candidates` | 运行台账与复盘 |
| CV | `/api/cv/data`、`/api/cv/import`、`/api/cv/edit-proposals/*`、`/api/cv/references` | 简历和参考简历 |
| JD/Evaluate | `/api/evaluate`、`/api/evaluate/jd`、`/api/data/reports`、`/api/data/jds` | JD 评估和报告 |
| Offer | `/api/offers`、`/api/offer-reports` | Offer 和评估报告 |
| Interview | `/api/interview/*`、`/api/agent/coach/*` | 面试题、评分、session |
| Memory | `/api/memory/retrieve`、`/api/agent/memory-*`、`/api/admin/memory` | 长短期记忆 |
| Scan | `/api/scan`、`/api/scan/jobs`、`/api/scan/status` | 岗位扫描 |
| Analytics | `/api/analytics/health-check`、`/api/analytics/weekly-report` | 分析与周报 |
| News/OCR/Export | `/api/news/*`、`/api/ocr/jd-screenshot`、`/api/export-file` | 辅助能力 |

---

## 9. 数据模型

### 9.1 数据层分工

| 文件/模块 | 当前角色 |
|-----------|----------|
| `postgres.ts` | PostgreSQL 连接与 pgvector 健康检查 |
| `postgres-schema.sql` | 当前 LAN runtime schema |
| `data-repositories.ts` | 双驱动 repository 抽象 |
| `server-db.ts` | SQLite fallback/archive adapter |
| `memory/*` | 向量记忆、候选记忆、治理 |

### 9.2 核心表

| 表 | 用途 |
|----|------|
| `users` | 用户、角色、审批、登录状态 |
| `applications` | 投递记录 |
| `reports` | JD A-G 评估报告 |
| `jds` | 保存的职位描述 |
| `profiles`、`profile_signals` | 求职画像和信号 |
| `cv_data` | 当前用户简历结构 |
| `resume_edit_proposals` | 简历修改草稿和应用状态 |
| `reference_resumes` | 优秀/参考简历 |
| `reference_resume_chunks` | 参考简历向量 chunk |
| `reference_resume_usage` | 参考简历使用反馈 |
| `offers`、`offer_reports` | Offer 和评估报告 |
| `sessions`、`session_memory` | 会话与摘要 |
| `agent_runs`、`agent_run_steps` | Agent 任务台账 |
| `agent_run_reviews`、`agent_eval_candidates` | 复盘和 eval 候选 |
| `memory_items`、`memory_evidence`、`memory_chunks` | 通用长期记忆 |
| `scan_queue`、`scan_jobs` | 岗位扫描 |

### 9.3 数据可靠性原则

1. 写入 API 不直接相信工具返回文本，必须读回。
2. 多用户数据默认携带 `user_id`。
3. 向量维度固定 1536，替换 embedding 模型前必须迁移或重建。
4. SQLite 数据可作为迁移源，但不能作为当前 LAN runtime 的 PRD 主路径。
5. Agent Run 与 Review 依赖 PostgreSQL；fallback 环境可降级但不声称完整治理。

### 9.4 数据字典

| 表 | 主键 | 关键字段 | 主要写入方 | 读回要求 |
|----|------|----------|------------|----------|
| `users` | `id` | username、role、status、token_version | auth/admin users | 登录/审批后读回 status |
| `applications` | `id` | company、role、score、status、report_path | evaluate/tracker | company+role 唯一读回 |
| `reports` | `id` | report_num、company、role、overall_score、blocks_json、source_hash | JD evaluation | report_num + blocks_json 读回 |
| `jds` | `id` | company、role、source_type、body、report_id | JD evaluation/discover | body/source_hash 读回 |
| `profiles` | `id` | data_json、goals_json、history_json | profile agent | data_json 读回 |
| `profile_signals` | `id` | signal_type、content_json、session_id | profile mining | quality gate + signal id |
| `cv_data` | `id` | data_json、updated_at | CV/import/resume edit | active version/section hash |
| `resume_edit_proposals` | `id` | section_id、base_hash、proposed_hash、status | resume agent | status + hashes |
| `reference_resumes` | `id` | role_category、visibility、status、quality_score、source_hash | CV/reference save | role/visibility/status |
| `reference_resume_chunks` | `id` | chunk_text、embedding_status、embedding_dimension | memory indexer | embedding_status |
| `reference_resume_usage` | `id` | accepted、feedback、task_type | memory feedback | usage row |
| `offers` | `id` | company、role、salary fields、latest_report_id | offer agent | offer id + fields |
| `offer_reports` | `id` | offer_snapshot_json、modules_json、red_flags_json、verdict | offer agent | modules/verdict |
| `sessions` | `id` | messages_json、memory_digest、interview_state_json、agent_state_json | Agent Chat | updated messages/state |
| `agent_runs` | `id` | task_type、agent_id、status、contract_json、result_json | Agent Loop | terminal status/result |
| `agent_run_steps` | `id` | phase、tool_name、status、verifier_json、error_json | Agent Loop | step timeline |
| `agent_run_reviews` | `id` | verdict、score、failure_types、eval_candidate_json | run-review | review id/verdict |
| `agent_eval_candidates` | `id` | name、failure_type、fixture_json、status、dedupe_key | run-review/admin | status transition |
| `memory_items` | `id` | memory_type、canonical_text、status、confidence、importance | memory writeback/admin | status/evidence |
| `memory_evidence` | `id` | source_type、source_id、quote、confidence | memory writeback | evidence row |
| `memory_chunks` | `id` | source_type、chunk_text、embedding_status、embedding | memory indexer | embedding_status |
| `scan_queue` | `id` | status、companies_total/done、jobs_found/new、error_log | scanner | status/progress |
| `scan_jobs` | `id` | company、title、url、dedup_key、status、jd_id | scanner | dedup_key/job status |

### 9.5 状态机

#### Agent Run

```text
planned
  -> running
  -> waiting_user
  -> verifying
  -> repairing
  -> recovered
  -> succeeded

terminal alternatives:
failed / needs_engineering / rolled_back / cancelled
```

| 状态 | 含义 | 可见动作 |
|------|------|----------|
| planned | 合同已创建但未执行 | 查看合同 |
| running | Agent/工具执行中 | 取消、查看步骤 |
| waiting_user | 等用户确认/补充 | 确认、取消、补充 |
| verifying | 读回/校验中 | 查看 verifier |
| repairing | 可恢复错误处理中 | 等待或取消 |
| recovered | 修复后完成 | 查看恢复证据 |
| succeeded | 成功标准全部满足 | 查看结果 |
| needs_engineering | 需要工程修复 | 生成 review/eval |
| failed | 不可恢复失败 | 查看错误和建议 |
| rolled_back | 已回滚 | 查看回滚证据 |
| cancelled | 用户/系统取消 | 无进一步副作用 |

#### Resume Edit Proposal

```text
pending -> applied
pending -> discarded
pending -> stale
applied -> rolled_back
```

| 状态 | 含义 | 禁止 |
|------|------|------|
| pending | 等用户确认 | 不得声称已保存 |
| applied | 已应用且读回通过 | 不得重复 apply 产生重复版本 |
| discarded | 用户放弃 | 不得再 apply |
| stale | base hash 过期 | 必须重新生成 |
| rolled_back | 已回滚 | 不得显示为当前版本 |

#### Memory

```text
memory_items: candidate -> active -> archived
candidate -> rejected
archived -> candidate

embedding_status: pending -> embedded
pending -> failed
pending -> skipped
failed -> pending (retry)
```

| 状态 | 处理 |
|------|------|
| candidate | 等待治理或更多证据 |
| active | 可检索/可用于 Agent |
| rejected | 不进入检索 |
| archived | 历史保留，不主动使用 |
| pending embedding | 待索引 |
| embedded | 可向量检索 |
| failed | 管理员可重试或禁用 |
| skipped | 明确跳过索引 |

#### Scan

```text
scan_queue: pending -> running -> completed/failed
scan_jobs: new -> saved/ignored/error
```

验收：扫描任务失败必须保留公司级 `error_log`；单公司失败不应使所有 job 消失。

### 9.6 数据迁移与文档漂移规则

| 场景 | PRD 口径 |
|------|----------|
| 当前局域网运行 | PostgreSQL + pgvector |
| 本地轻量 fallback | SQLite 可用但不是主 runtime |
| 迁移源 | SQLite 可作为历史数据源 |
| `DATA_CONTRACT.md` 旧口径 | 视为历史文档漂移，不作为当前 PRD 事实源 |
| hash/count 不一致 | 先判断 Postgres 是否已有新数据，不直接判定服务未起 |

---

## 10. API 端点全景

### 10.0 API 设计原则

| 原则 | 要求 |
|------|------|
| 用户隔离 | 所有用户数据 route 默认从当前 auth user 派生 `user_id`，不接受前端伪造 owner |
| 写入读回 | 写入、导出、管理员动作返回 read-back 或 verifier evidence |
| 错误可见 | API 错误包含可展示 message、machine code、recoverable 标记 |
| 幂等 | continue、apply proposal、admin approve/reject 等操作应避免重复副作用 |
| 局部降级 | 外部抓取、OCR、embedding、MCP 失败不应拖垮无关功能 |

### 10.1 Agent 端点

| 端点 | 职责 | 关键验收 |
|------|------|----------|
| `/api/agent/run` | 服务端 Agent Loop | SSE 输出 phase/tool/result |
| `/api/agent/chat` | 兼容聊天入口 | 不绕过治理 |
| `/api/agent/image-intake` | 图片识别和文档分类 | JD/Offer/简历/冲突/无关可区分 |
| `/api/agent/memory-context` | 获取上下文记忆 | 不泄露他人私有数据 |
| `/api/agent/memory-writeback` | 写回记忆 | 写后读回 |
| `/api/agent/runs` | run 列表/活动状态 | continue 不重复刷消息 |
| `/api/agent/runs/[id]/steps` | run step 详情 | verifier 和 error 可见 |
| `/api/agent/session-review` | 会话复盘 | 可生成 eval 候选 |
| `/api/agent/mcp/call` | MCP shim 调用 | 外部调用有边界和错误回传 |

### 10.2 CV 端点

| 端点 | 职责 |
|------|------|
| `/api/cv/data` | 读取/保存当前简历数据 |
| `/api/cv/import` | 导入用户简历 |
| `/api/cv/optimize-section` | 优化 section |
| `/api/cv/edit-proposals` | 列表/创建简历草稿 |
| `/api/cv/edit-proposals/[id]/apply` | 应用草稿 |
| `/api/cv/edit-proposals/[id]/discard` | 丢弃草稿 |
| `/api/cv/edit-proposals/[id]/rollback` | 回滚 |
| `/api/cv/references` | 优秀简历列表 |
| `/api/cv/import-reference` | 导入参考简历 |
| `/api/cv/references/[id]/reindex` | 重建向量索引 |
| `/api/cv/generate-pdf` | 生成简历 PDF |

### 10.3 Admin/Governance 端点

| 端点 | 职责 |
|------|------|
| `/api/admin/users` | 用户审批和管理 |
| `/api/admin/insights` | 团队洞察 |
| `/api/admin/memory` | 记忆治理动作 |
| `/api/admin/agent-runs` | Agent run 管理视图 |
| `/api/admin/agent-reviews` | Agent review 列表/详情 |
| `/api/admin/agent-eval-candidates/[id]` | eval 候选接受/拒绝/提升 |

### 10.4 端点规格矩阵

| 端点 | 方法 | 输入 | 输出 | 写入 | 失败态 |
|------|------|------|------|------|--------|
| `/api/auth/login` | POST | username/password | user + session cookie | last_login/token | invalid_credentials、pending_user |
| `/api/auth/logout` | POST | 当前 cookie | success | 清 cookie | 已登出也返回安全成功 |
| `/api/auth/register` | POST | username/password/displayName/email | pending/active user | users | duplicate username |
| `/api/users/me` | GET | cookie | current user | 否 | unauthenticated |
| `/api/sessions` | GET/POST | title/messages | session list/detail | sessions | auth required |
| `/api/sessions/[id]` | GET/PATCH/DELETE | sessionId、messages、agent_state | session | sessions | not found/owner mismatch |
| `/api/agent/run` | POST/SSE | message、session、images、task state | stream events | sessions、agent_runs | stream abort/tool error |
| `/api/agent/image-intake` | POST | image payload、intent | documentType、text、route | 可写 tool message/run step | OCR timeout/ambiguous |
| `/api/agent/runs` | GET/POST | filters/run create | run list/detail | agent_runs | postgres unavailable |
| `/api/agent/runs/[id]/steps` | GET | runId | step timeline | 否 | not found |
| `/api/agent/session-review` | POST | session/run evidence | review/candidate | agent_run_reviews | insufficient evidence |
| `/api/cv/data` | GET/PUT | cv data | saved cv/read-back | cv_data | validation fail |
| `/api/cv/import` | POST | file/text | parsed sections | cv_data optional | parse fail |
| `/api/cv/edit-proposals` | GET/POST | section/proposed diff | proposal | resume_edit_proposals | missing base hash |
| `/api/cv/edit-proposals/[id]/apply` | POST | confirmation | verifiedAction | cv_data + proposal | stale/hash mismatch |
| `/api/cv/edit-proposals/[id]/rollback` | POST | proposal id | verifiedAction | cv_data + proposal | no applied proposal |
| `/api/cv/references` | GET/POST | reference metadata | reference list/detail | reference_resumes | role missing |
| `/api/cv/references/[id]/reindex` | POST | reference id | embedding status | reference_resume_chunks | provider error |
| `/api/evaluate` | POST | JD text/context | evaluation | reports/jds | empty source |
| `/api/evaluate/stream` | POST/SSE | JD text/context | partial blocks | reports on completion | partial save/read-back fail |
| `/api/data/reports` | GET/POST | report filters/body | report list/detail | reports | duplicate/report invalid |
| `/api/data/reports/[reportNum]` | GET/PATCH | reportNum/metadata | report detail | reports | not found |
| `/api/reports/[reportNum]/pdf` | POST/GET | reportNum | PDF artifact | output file | render/empty file |
| `/api/offers` | GET/POST | offer fields | offer | offers | missing company/role |
| `/api/offer-reports` | GET/POST | offer/report payload | offer report | offer_reports | read-back fail |
| `/api/interview/coach` | POST | session answer/context | next question/feedback | session state | missing binding |
| `/api/interview/score` | POST | question + answer | score artifact | optional session | invalid answer |
| `/api/profile/analyze` | POST | profile materials | profile analysis | optional profile | low confidence |
| `/api/data/signals` | GET/POST | signal payload | signal list | profile_signals | quality gate reject |
| `/api/scan` | POST | scan config | scan id | scan_queue | invalid portal config |
| `/api/scan/jobs/[id]/jd` | POST/GET | job id | saved/read JD | jds | job not found |
| `/api/admin/memory` | GET/POST | governance action | summary/action result | memory/reference tables | permission denied/read-back fail |
| `/api/admin/agent-reviews` | GET/POST | filters/run id | reviews | agent_run_reviews | run not terminal |
| `/api/admin/agent-eval-candidates/[id]` | PATCH | action/status | candidate | agent_eval_candidates | invalid transition |

### 10.5 SSE 事件规格

| 事件 | 负载 | 用途 | UI 要求 |
|------|------|------|---------|
| `phase` | `{ phase, label }` | 展示当前阶段 | 顶部状态和消息内状态同步 |
| `token` | text delta | 流式文本 | 可中断恢复，不丢尾部 |
| `tool_call` | `{ name, params }` | 工具开始 | 创建 loading 工具卡 |
| `tool_result` | `{ name, success, data, uiPayload, verifiedAction }` | 工具结果 | 更新工具卡和 verifier |
| `tool_error` | `{ name, error, recoverable }` | 工具失败 | 展示错误和恢复建议 |
| `requires_confirmation` | proposal/intent | 等待用户确认 | 禁止自动执行 |
| `run_update` | run status | 活动 run 状态 | 更新 run strip |
| `done` | final message/run id | 完成 | 只在合同满足时成功 |
| `error` | code/message | 失败 | 不吞错误 |

### 10.6 权限矩阵

| 端点域 | pending | member | admin |
|--------|---------|--------|-------|
| auth/register/login | 可用 | 可用 | 可用 |
| user private data | 不可用 | 仅本人 | 可按治理需要查看 |
| Agent Chat | 不可用 | 可用 | 可用 |
| CV/JD/Offer/Profile | 不可用 | 仅本人 | 仅治理/调试视角 |
| Admin users | 不可用 | 不可用 | 可用 |
| Admin memory | 不可用 | 不可用 | 可用 |
| Agent run/review admin | 不可用 | 不可用 | 可用 |

---

## 11. Prompt 与上下文策略

### 11.1 Prompt 分层

| 层 | 内容 |
|----|------|
| 全局系统 prompt | 产品边界、工具格式、输出风格 |
| 子 Agent soul | 每个 Agent 的职责、反模式和工具策略 |
| 任务合同 | 成功条件、validators、allowed tools |
| 用户上下文 | Career DNA、简历摘要、最近 JD/报告/Offer |
| 会话记忆 | memory_digest、session state、active task |
| 长期记忆 | reference resume、memory items、feedback promoted patterns |

### 11.2 上下文优先级

1. 系统安全和任务合同。
2. 当前 active guided session。
3. 用户本轮显式输入。
4. 图片识别结果。
5. 当前会话历史。
6. 用户画像/简历/JD/Offer 数据。
7. 长期记忆。
8. 通用知识和外部搜索。

### 11.3 输出策略

| 场景 | 输出要求 |
|------|----------|
| JD/Offer 评估完成 | 摘要、结论、关键风险、下一步；完整报告进入报告库 |
| 简历修改草稿 | 明确原文、建议、风险、待确认 |
| 写入失败 | 说明未完成哪项校验，不说“已保存” |
| 工具失败 | 给可恢复建议或下一步，不吞错误 |
| 长内容 | Markdown 可读、局部滚动、不撑开页面 |
| 工具结果 | 折叠卡片，默认显示摘要 |

---

## 12. 行为约束

### 12.1 必须做到

- 读写分离：read-only 请求不得触发写入成功标准。
- 高风险写入必须用户确认。
- 写入/导出/Admin 动作必须 read-back。
- active session 必须在页面跳转后恢复。
- 工具失败必须可见，不得吞掉。
- 路由不确定时必须澄清。
- 保存前必须知道写入对象和位置。
- 所有中大改动必须有 OpenSpec change 或明确说明不需要。
- 修复必须沉淀 eval 或说明无法沉淀原因。

### 12.2 禁止行为

| 禁止 | 示例 |
|------|------|
| 禁止假成功 | “已保存”但数据库无记录 |
| 禁止静默改简历 | 未确认直接替换 section |
| 禁止错工具 | 自我定位调用 JD 评估 |
| 禁止错页面/错字段 | Agent 要求改设置页却写到 CV |
| 禁止吞输出 | 模型输出被截断却不提示 |
| 禁止裸 JSON | 工具结果直接显示完整 JSON |
| 禁止复制参考简历原文 | 优秀简历只能作为模式参考 |

---

## 13. 失败模式目录

### 13.1 Agent Chat P0 失败

| ID | 失败模式 | 严重级别 | 复现信号 | 期望处理 |
|----|----------|----------|----------|----------|
| F1 | 自我定位跑偏 | P0 | active `career_positioning_guidance` 跳到其他任务 | guided lock + eval |
| F2 | 子 Agent 状态不持久 | P0 | 页面切回后不记得任务 | session.agent_state_json 恢复 |
| F3 | Agent 间跳转错误 | P0 | 明确切换未切或误切 | explicit switch eval |
| F4 | 工具输出不是折叠卡片 | P1 | JSON/报告全文直接铺开 | tool card UI |
| F5 | 工具调用失败缺 read-back | P0 | `success=true` 但无 verifier | runtime gate 改失败 |
| F6 | Agent 输出被截断/吞掉 | P0 | final message 空、null、半截 | stream recovery + run review |
| F7 | 图片识别失败 | P0 | JD/Offer/简历图未分类 | retry_image/clarify |
| F8 | 简历保存未落库 | P0 | UI 说保存，cv_data 未变 | hash read-back |
| F9 | Continue 重复刷消息 | P1 | 点击继续重复追加历史 | idempotent resume |
| F10 | 记忆治理按钮无反馈 | P1 | approve/reject 后 UI 不变 | status transition feedback |
| F11 | 聊天长内容横向溢出 | P1 | 页面出现全局横向滚动 | CSS/Markdown regression |
| F12 | 跨页面状态失忆 | P0 | Agent -> CV -> Agent 后上下文丢 | session state hydrate |
| F13 | Agent 控制其他页面不准 | P1 | 写错 section/字段/只写一半 | target locator + verifier |
| F14 | eval 候选未沉淀 | P1 | review 有候选但无测试 | candidate promotion workflow |

### 13.2 数据层失败

| ID | 失败模式 | 处理 |
|----|----------|------|
| D1 | PostgreSQL 连接失败 | `check:postgres` 阻断 runtime 切换 |
| D2 | pgvector 不可用 | memory vector 功能降级并提示 |
| D3 | SQLite 直连残留 | `check:postgres-cutover` 报错，转 repository |
| D4 | 迁移 hash/count 不一致 | 明确说明 Postgres 已有新数据，不能简单比对旧 SQLite |
| D5 | user_id 丢失 | 阻断多用户数据写入 |

### 13.3 自动化 Loop 失败

| ID | 失败模式 | 处理 |
|----|----------|------|
| L1 | 官方 cron 空跑 | 探针记录 session id、assistant/tool/token count |
| L2 | fallback runner 未创建 | 创建/更新 heartbeat fallback |
| L3 | 修复 agent 未隔离 | 必须 git worktree |
| L4 | evaluator 缺失 | 独立 evaluator agent 打分 |
| L5 | 得分低于 90 仍通过 | 阻断合入，回到修复 |
| L6 | STATE 未写 | 本轮不算完成 |

---

## 14. 评估阈值与评测体系

### 14.1 阻断测试

| 命令 | 作用 |
|------|------|
| `npm run test` | 全量 Vitest |
| `npm run eval:memory` | 确定性 memory eval |
| `npm run smoke:embedding` | 真实 embedding provider smoke |
| `npm run check:postgres` | Postgres/pgvector 可用性 |
| `npm run check:postgres-cutover` | 切换校验 |
| `npx tsc --noEmit` | TypeScript 类型检查 |

### 14.2 Agent Eval 目标

| Eval 类别 | 最低通过 |
|-----------|----------|
| 路由/任务合同 | 95/100 |
| 写入读回 | 100/100 |
| 图片识别链路 | 90/100，失败必须可解释 |
| 面试策略 | 95/100 |
| 前端渲染 | 90/100 + 无 P0/P1 阻断 |
| Loop 运行 | 90/100 + STATE/memory 写回 |

### 14.3 evaluator 评分标准

| 分项 | 权重 |
|------|------|
| 问题复现准确 | 20 |
| 根因定位 | 20 |
| 修复最小且符合架构 | 20 |
| 测试/eval 覆盖 | 20 |
| 回归风险与文档/状态沉淀 | 20 |

通过线：总分 >= 90，且无 P0 未解决。

### 14.4 端到端验收用例

| 用例 ID | 场景 | 输入 | 预期 | 覆盖失败 |
|---------|------|------|------|----------|
| E2E-AGENT-001 | 简历只读查询 | “我现在的简历是什么” | 路由 `resume_query`，读取简历，不触发保存门禁 | F8 |
| E2E-AGENT-002 | 简历修改 | “把个人概述改得更偏 AI 产品” | proposal -> confirm -> apply -> read-back hash | F8、F13 |
| E2E-AGENT-003 | 页面切换保持 | Agent 中生成 proposal，切到 `/cv` 再回来 | pending confirmation 仍在 | F2、F12 |
| E2E-AGENT-004 | JD 图片评估 | 上传 JD 截图并说“评估这个” | image-intake -> `jd_evaluation` -> report saved | F7 |
| E2E-AGENT-005 | 图片冲突 | 文本说 JD，图片像 Offer | 问澄清，不执行业务工具 | F7、F3 |
| E2E-AGENT-006 | Offer 谈判复用 | 已有 offer report，问“怎么谈” | read_offer_report + negotiation，不重跑 evaluate_offer | F3 |
| E2E-AGENT-007 | 面试一题一答 | “基于刚才 JD 模拟面试” | 绑定材料，只问一道题 | F1/F3 类漂移 |
| E2E-AGENT-008 | 自我定位锁定 | 做定位后回答“我以前做过增长” | 继续定位，不跳 JD/简历保存 | F1 |
| E2E-AGENT-009 | 工具输出卡片 | 触发任意写入工具 | 默认折叠，显示中文名/摘要/verifier | F4 |
| E2E-AGENT-010 | 长内容渲染 | 粘贴超长 JD/表格/URL | 无全局横向滚动 | F11 |
| E2E-AGENT-011 | Continue 幂等 | run 中断后点继续两次 | 不重复追加同一历史消息 | F9 |
| E2E-AGENT-012 | 记忆治理反馈 | admin approve/reject candidate memory | 按钮 loading -> success，状态读回 | F10 |
| E2E-AGENT-013 | 输出截断恢复 | 模拟 stream abort | run failed/recoverable，UI 显示恢复建议 | F6 |
| E2E-LOOP-001 | 官方 cron liveness | 新 official session | 有 assistant/tool/token/state write-back 才健康 | L1 |
| E2E-LOOP-002 | 修复分发 | 检出多个问题 | 多 worktree 分发，evaluator 独立评分 | L3、L4 |

### 14.5 回归测试沉淀规则

| 失败类型 | 推荐测试位置 | 必须断言 |
|----------|--------------|----------|
| 路由错误 | `src/__tests__/agent-task-routing.test.ts` | taskType、allowedTools、auditSummary |
| 工具治理错误 | `src/__tests__/agent-tool-governance.test.ts` | allowed=false 或 requiresReadBack |
| 简历保存错误 | resume edit proposal tests | base hash、read-back hash、status |
| 图片识别错误 | image-intake / jd-image-routing tests | documentType、route、clarification |
| 面试状态错误 | interview session tests | active binding、一题一答 |
| UI 溢出 | gstack/Playwright visual check | no horizontal overflow |
| run/review 错误 | agent-run-review tests | failure_type、candidate fixture |
| memory governance | memory-governance-ui tests | status transition + UI feedback |

### 14.6 OpenSpec 与 gstack 门禁

| 改动幅度 | OpenSpec | gstack |
|----------|----------|--------|
| 文案/小样式 | 可不建，记录原因 | 视觉相关建议截图 |
| 单点 bugfix | 若行为合同变化则建 | 按需 `review` 或 `qa` |
| Agent 路由/工具治理 | 必须建 | `review` + 相关 eval |
| 数据模型/API | 必须建 | `review`，必要时 `qa` |
| Loop 自动化 | 必须建 | `review` + liveness proof |
| 跨页面控制能力 | 必须建 | `qa` + `browse`/截图 |

---

## 15. Loop Engineering

### 15.1 一等公民化目标

Loop 不是“定时提醒”，而是系统的治理子产品。它必须拥有：

| 能力 | 要求 |
|------|------|
| 状态 | `skills/agent-system-optimization-loop/STATE.md` 持久化 |
| 记忆 | automation `memory.md` 写回 |
| 调度 | official cron + fallback heartbeat |
| 发现 | CI、commit、run review、eval candidates、自检问题池 |
| 分发 | 每个修复开 git worktree |
| 验证 | 独立 evaluator，>=90 通过 |
| 沉淀 | OpenSpec、gstack 审查、eval 草案 |
| 汇报 | 解决不了的问题向用户提出 |

### 15.2 每轮输出

每轮 loop 至少产生：

1. 本轮发现的问题列表和优先级。
2. 分发给哪些执行 agent、对应 worktree。
3. 修复摘要和涉及文件。
4. evaluator 分数和不通过项。
5. 新增/更新 eval。
6. STATE.md 更新。
7. 未解决 blocker。

### 15.3 Product Repair Gate

自动化探针可以修 loop 基础设施；产品功能修复必须满足：

- 有明确问题证据。
- 中大改动开 OpenSpec change。
- 使用 gstack 做审查或 QA。
- 修复在隔离 worktree。
- evaluator >= 90。
- 合入前不破坏用户未提交工作。

---

## 16. 风险矩阵

| 风险 | 等级 | 影响 | 缓解 |
|------|------|------|------|
| Agent 错写简历 | P0 | 用户核心资产污染 | proposal + confirmation + read-back + rollback |
| Postgres/SQLite 状态混乱 | P0 | 数据丢失或误判 | README/ARCHITECTURE 口径统一，cutover check |
| 图片误分类 | P0 | JD/Offer/简历流程错跑 | image-intake router + clarification |
| 子 Agent 失忆 | P0 | 长任务无法完成 | session agent_state 持久化 |
| 工具治理缺 metadata | P0 | 工具滥用 | test/dev default deny |
| 记忆泄露 | P0 | 多用户隐私事故 | user_id、visibility、admin approval |
| 自动化空跑 | P1 | loop 失效 | liveness probe + fallback runner |
| 文档漂移 | P1 | 用户和 agent 判断错误 | PRD/README/docs index 与事实源同步 |
| UI 溢出 | P1 | 聊天页不可用 | Playwright/gstack 截图回归 |

---

## 17. 技术架构

### 17.1 技术栈

| 层 | 技术 |
|----|------|
| Web | Next.js 16、React 19、TypeScript |
| UI | Tailwind CSS、lucide-react、react-markdown |
| Agent | Custom ReAct-style loop、SSE、tool registry |
| Model | DeepSeek chat/eval、Zhipu vision、OpenAI-compatible embeddings |
| DB | PostgreSQL + pgvector 当前 LAN runtime |
| Fallback | SQLite/better-sqlite3 |
| Export | Playwright/Puppeteer/PDF routes |
| Test | Vitest、TypeScript、memory eval |

### 17.2 核心目录

| 目录 | 用途 |
|------|------|
| `src/app` | 页面和 API routes |
| `src/components` | UI 组件 |
| `src/lib/agent` | Agent、工具、路由、治理、run review |
| `src/lib/memory` | 长期记忆和治理 |
| `src/lib/data-repositories.ts` | 数据访问抽象 |
| `src/lib/postgres-schema.sql` | Postgres schema |
| `scripts` | DB、迁移、扫描、校验脚本 |
| `docs` | 当前文档 |
| `openspec` | 变更计划 |
| `skills/agent-system-optimization-loop` | 自动化 loop skill 与状态 |

---

## 18. 开发阶段与完成度

| 阶段 | 状态 | 说明 |
|------|------|------|
| Web 化 | 已完成 | Next.js 应用已取代 CLI-first 主体验 |
| 多用户认证 | 已完成 | admin/pending/member |
| PostgreSQL/pgvector | 已切当前 LAN | SQLite 仍保留 fallback/archive |
| Agent Chat | 已完成但重点优化 | 需要继续端到端稳定性治理 |
| 工具治理 | 已完成基础 | 需随新工具持续补 metadata/eval |
| Memory eval | 已完成基础 | 需扩展更多端到端失败 |
| Run Review | 已完成基础 | eval candidate 需更自动化沉淀 |
| Loop Automation | 设计和探针已有 | 官方 cron/fallback 健康需持续验证 |
| 跨页面 Agent 控制 | 待强化 | 精准定位和持久状态是下一重点 |

---

## 19. 上线与局域网部署策略

### 19.1 本地启动

```bash
npm install
cp .env.example .env.local
npm run doctor
npm run dev
```

### 19.2 LAN/PostgreSQL

```bash
DB_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/zhiyuan
npm run check:postgres
npm run check:postgres-cutover
```

Windows 局域网启动：

```powershell
.\start-lan.ps1
```

### 19.3 发布前检查

1. `npm run test`
2. `npm run eval:memory`
3. `npx tsc --noEmit`
4. `npm run check:postgres`
5. 关键 Agent Chat E2E smoke
6. Admin memory/agent-runs/agent-reviews smoke
7. gstack 前端截图回归

---

## 20. 附录

### 20.1 事实源文件

| 文件 | 用途 |
|------|------|
| `README.md` | 当前产品、工具数量、DB 口径 |
| `docs/ARCHITECTURE.md` | 当前架构 |
| `docs/AGENT_TOOL_GOVERNANCE.md` | 工具治理 |
| `docs/evolution/11-Agent聊天页-完整功能拆解.md` | Agent Chat 当前拆解 |
| `docs/evolution/22-当前系统状态与治理闭环.md` | Run/Review/Eval 当前状态 |
| `docs/evolution/23-Postgres向量记忆与数据治理.md` | PostgreSQL/pgvector/SQLite 分工 |
| `src/lib/agent/tools/index.ts` | 48 工具注册 |
| `src/lib/agent/task-contract.ts` | 任务合同 |
| `src/lib/agent/task-routing.ts` | 路由 |
| `src/lib/agent/tool-governance.ts` | 工具治理 |
| `src/lib/postgres-schema.sql` | 数据模型 |

### 20.2 术语

| 术语 | 定义 |
|------|------|
| Agent Task Contract | 一次 Agent 任务的类型、目标、成功标准和校验器 |
| Read-back | 写入后重新读取目标数据，证明写入真实发生 |
| Guided Session | 有阶段状态的长任务，例如自我定位或面试 |
| Eval Candidate | run-review 从失败中提取的候选回归测试 |
| MCP shim | 前端/Agent 可调用的外部连接代理工具 |
| Loop Engineering | 发现、分发、修复、验证、持久化的自动优化闭环 |
