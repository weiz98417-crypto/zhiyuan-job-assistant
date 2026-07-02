# 15 Agent 可行性分析

本篇分析 Zhiyuan 为什么适合继续走 Agent-first 路线。分析依据来自首版 Demo：用户任务是否自然、业务 agent 是否能分工、工具和页面是否能承接真实业务对象、写入是否能被 read-back/verifier 证明。

结论先行：Agent-first 方向可行，但必须坚持“Agent Chat 是入口，页面是资产面板，Orchestrator 是内部编排，PostgreSQL + pgvector 是当前 runtime”的产品结构。

## 为什么求职产品适合 Agent-first

| 原因 | 说明 |
|---|---|
| 输入天然非结构化 | 用户会上传 JD、Offer、简历截图，也会用自然语言描述困惑 |
| 任务跨多个资产 | JD、简历、Offer、面试和自我定位互相影响 |
| 用户不想学习工具名 | 用户更自然地说“帮我评估”“帮我改”“继续面试” |
| 结果需要页面承接 | 报告、proposal、Offer 对比、面试进度不能只留在聊天里 |
| 写入需要可信边界 | 简历、画像、记忆和 Admin 动作都需要确认与读回 |
| 长期上下文有价值 | 职业方向、偏好、经历和反馈可以持续服务后续任务 |

Agent-first 不是让模型替用户做所有决定，而是让用户用自然语言启动任务，再通过页面确认和复查结果。

## 业务可行性

| 业务域 | 适合度 | 原因 |
|---|---:|---|
| JD 评估 | 高 | 材料长、结构不统一，需要解释、匹配和建议 |
| 简历查询 | 中高 | 自然语言查询体验好，但必须保持只读 |
| 简历优化 | 高 | 适合生成草稿和差异，但必须用户确认后写入 |
| Offer 分析 | 高 | 字段多、风险多、需要策略建议 |
| 面试准备 | 高 | 适合一题一答、状态延续和反馈 |
| 自我定位 | 高 | 需要连续追问和长期画像信号 |
| 记忆 | 中高 | 能提升连续性，但必须区分事实、偏好、推测和临时任务 |
| Admin | 中 | 适合摘要和辅助判断，但管理动作必须由权限和读回约束 |

## Agent 体系可行性

当前 6 个业务 agent 能覆盖首版主链路：

| Agent | 可行职责 |
|---|---|
| `general` | 通用求职咨询、兜底、能力说明和低风险查询 |
| `evaluate` | JD 解析、评估报告、报告追问 |
| `resume` | 简历查询、proposal、apply、rollback、参考简历 |
| `interview` | 面试准备、当前题目、回答反馈、材料绑定 |
| `profile` | 自我定位、画像信号、偏好和经历沉淀 |
| `offer` | Offer 评估、谈判策略、多 Offer 对比 |

Orchestrator 的可行角色是内部编排：识别任务、选择 agent、生成 task contract、限制工具范围。它不应该被设计为一个对外业务角色。

## 工具与数据可行性

| 能力 | 可行条件 |
|---|---|
| 48 个工具 | 每个工具必须有 effect、allowedTaskTypes、agentAllowlist、确认规则、read-back 要求 |
| PostgreSQL + pgvector | 当前 runtime，用于多用户、记忆检索、运行记录和业务对象读写 |
| SQLite | 只作为 fallback/archive/migration，不能写成当前主运行路径 |
| read-back/verifier | 所有高价值写入都要以对象读回、hash、文件存在或状态读回证明 |
| 页面承接 | 工具结果必须能进入 Reports、CV、Compare、Interview、Profile、Admin |

工具数量本身不构成可行性。可行性来自工具边界明确、写入可证明、页面能复查。

## 产品边界

Agent-first 可行的前提是边界足够清楚。

| 边界 | 判断 |
|---|---|
| 不自动改简历 | 先 proposal，再用户确认，再写入 |
| 不把 JD 要求写成用户画像 | JD 只是当前任务上下文 |
| 不把 Offer 当 JD | `offer` 与 `evaluate` 边界明确 |
| 不把 Orchestrator 当业务 agent | 6 个业务 agent 保持稳定 |
| 不把 SQLite 当当前 runtime | 当前 runtime 是 PostgreSQL + pgvector |
| 不用口头成功替代证据 | 写入成功必须 read-back/verifier |
| 不默认公开团队素材 | 团队记忆和参考简历需要可见性规则与 Admin 管理 |

## 可行性评分

| 维度 | 评分 | 说明 |
|---|---:|---|
| 用户需求适配 | 9 | 求职任务高度适合自然语言入口和上下文推理 |
| 多页面承接 | 8 | 页面能承接核心资产，后续要继续打磨联动 |
| Agent 分工 | 8 | 6 个业务 agent 足够覆盖首版主链路 |
| 工具可控性 | 7 | 已有 48 个工具基础，关键在元数据和读回约束 |
| 数据基础 | 8 | PostgreSQL + pgvector 支撑当前 runtime 与记忆 |
| 写入可信 | 7 | read-back/verifier 方向明确，需要覆盖所有高价值写入 |
| 记忆可信 | 6 | 价值高，但需要严格区分事实、偏好、推测和临时上下文 |

总体判断：继续推进 Agent-first 是合理选择。下一步不是扩大 agent 数量，而是把 6 个业务 agent、Orchestrator、工具、记忆和页面承接设计成稳定产品 runtime。

## 进入下一阶段的输入

| 输入 | 进入哪篇 |
|---|---|
| Demo 主故事和场景组 | 16 Demo 验证 |
| Agent-first 可行性结论 | 17 产品整体 Agent 化重构规划 |
| 6 个业务 agent 职责 | 18、19 |
| 48 个工具与 read-back 要求 | 18、20 |
| 记忆分类与可见性 | 20 |
| PostgreSQL + pgvector runtime 事实 | 18、20 |

## 可行性判断的关键证据

Agent-first 是否成立，要看它有没有解决传统页面入口解决不了的问题。

| 证据 | 页面方案的限制 | Agent-first 的价值 |
|---|---|---|
| 用户可以直接说“这个岗位能投吗” | 用户必须先知道去哪个页面 | Agent Chat 统一接收模糊目标 |
| JD 报告能接到 CV proposal | 页面之间要靠用户手动复制 | Agent 能带 report 上下文继续任务 |
| Offer 不被当成 JD | 靠页面入口可减少错误，但截图场景仍会混淆 | Agent 需要材料分类和路由 |
| 面试状态可恢复 | 单页面能保存状态，但用户会回到聊天继续 | Agent 需要绑定 session 和快照 |
| 写入必须确认 | 页面按钮能确认，但聊天里容易误导 | Agent contract 明确 requiresConfirmation |

因此，Agent-first 的可行性不来自“模型更聪明”，而来自它能把自然语言、页面对象、工具边界和数据证据连起来。

## 可行性风险和缓解

| 风险 | 表现 | 缓解方式 |
|---|---|---|
| 路由不稳定 | JD、Offer、简历截图混淆 | image-intake + task routing + 澄清问题 |
| 写入过度自动化 | 用户一句话导致简历被改 | proposal、confirmation、read-back |
| 上下文丢失 | 从 Reports 回 Agent 后不记得报告 | page handoff 传 reportId |
| agent 边界模糊 | `general` 什么都能做 | 6 个业务 agent + allowlist |
| 记忆污染 | 单次 JD 要求进入用户画像 | 记忆候选、来源、置信度、可撤回 |
| 成本不可控 | 每次任务都调用过多工具 | task contract 限制 allowedTools |

可行性分析必须同时说清“为什么能做”和“哪里容易失败”。这会直接指导 17-20 的系统规划。

## 继续推进的判断

Agent-first 可以继续推进，但必须带着边界推进。

| 判断 | 说明 |
|---|---|
| 值得继续 | 用户自然语言入口能降低求职任务启动成本 |
| 不能只靠模型 | 必须有 task contract、工具 allowlist 和页面承接 |
| 首版先控风险 | 简历、Offer、画像和记忆都要默认谨慎 |
| 数据先于话术 | read-back/verifier 比回答漂亮更重要 |
| 页面不能消失 | Agent Chat 是入口，业务页面是资产面板 |

这组判断让 Agent 可行性从“可以试试”变成“可以按边界进入系统设计”。
