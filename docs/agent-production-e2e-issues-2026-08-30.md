# 纸鸢 Agent 生产端到端问题清单（2026-08-30）

## 结论

本轮不是“没有 Agent 记录”。生产数据库中，session 100-121 均有对应 Session、Turn 和 Agent Run 记录。主要问题集中在三层：

1. 主意图与约束没有被拆开，关键词会覆盖用户真正要做的事。
2. Task 已选对，但工具、持久化或合同闭环没有完成。
3. `waiting_user` / Gate 收到用户输入或批准后，同一 Run 没有稳定恢复。

按当前约定，以上主干问题全部冻结，不做逐条补丁。先讨论统一的意图、Task、Gate 和执行模型，再整体优化。

本轮只修复一个独立 UI 小问题：Gate 已拒绝后，Session 没有持久化卡片终态，刷新仍显示“批准并继续 / 拒绝”。本地回归测试已通过，尚未单独部署。

## 测试基线

- 生产版本：`20260830-200000-r23`
- 外网入口：`http://121.43.198.13:38084`
- 登录态：真实 QA 用户会话
- 测试方式：真实浏览器点击、输入、切会话、刷新；同时只读核对 PostgreSQL 中的 `sessions`、`agent_runs`、`agent_run_inputs`、`agent_run_gates`、`agent_run_events`
- 发布状态：`current` 指向 r23；Web / Worker 均 online；`/login` 返回 200
- 本地门禁基线：199 个测试文件、976 个用例通过；TypeScript 与生产构建通过

## 11 类短链路结果

| 能力 | 结果 | 生产证据 | 说明 |
| --- | --- | --- | --- |
| `general_chat` | 通过 | session 100 | Run 为 `general_chat / succeeded` |
| `career_positioning_guidance` | 部分通过 | session 101、102、117 | 正向三轮 UX 可用，但 Run 全记为 `general_chat`；带“不要更新画像”时误路由为 `profile_update` |
| `resume_query` | 通过 | session 103、121 | 能读取真实简历；取消简历写入后读回仍是原文 |
| `resume_edit` | 失败 | session 104、105、120 | 安全提案请求先误路由为查询；正向请求先生成假文案提案，后续真实 Gate 批准后不恢复 |
| `jd_evaluation` | 失败 | session 106、107 | Task 选对，但评估和报告落库合同失败 |
| `offer_evaluation` | 通过 | session 108 | 报告 #5、Offer #4 成功；HR 问询留在原 Conversation |
| `interview_coaching` | 部分通过 | session 109、110、118 | 含“JD要求”的面试请求误路由；正向请求能出第一题，但回答后没有反馈 |
| `profile_update` | 失败 | session 111 | 确认 Turn 已 consumed，但 Run 仍为 `waiting_user`，没有写入读回 |
| `reference_resume_save` | 不稳定 | session 112、119 | 一次能打开 Gate，一次同类请求直接合同失败 |
| `file_export` | 失败 | session 113、114 | 两次均未生成存在且非空的下载文件 |
| `job_search` | 失败 | session 115、116 | 两次均未显示确认问题、未创建可读回扫描结果 |

## 关键长链路结果

### 1. 新建 / 切换 / 刷新 Session

状态：通过。

- 新建对话：URL 从旧 Session 切到 `sessionId=99`。
- 切换历史会话：URL 正确切到 `sessionId=94`。
- 刷新：仍保持当前 Conversation 和消息。

### 2. Offer 评估 → HR 问询

状态：通过，保留为发布 Guardrail。

- Offer 评估：session 108，Run `offer_evaluation / succeeded`。
- 点击卡片“HR 问询”后，URL 始终保持 `sessionId=108`。
- HR 问询清单追加到原 Conversation；刷新后仍存在。

### 3. 职业定位三轮

状态：用户体验可继续，但 Task 归类错误。

- session 117 连续三轮都在同一 Conversation。
- 每轮都能基于上轮回答提出下一问题。
- 数据库中的三个 Run 均为 `general_chat / succeeded`，不是 `career_positioning_guidance`。

### 4. 模拟面试：提问 → 回答 → 反馈

状态：失败。

- session 118 能生成第一道结构化面试题。
- 用户回答已作为同一 Run 的第二个 Turn consumed。
- 系统没有生成承诺的反馈，反而又生成一张“第 1 题”，然后再次进入 `waiting_user`。
- 最后通过 UI 取消，Run 正确进入 `cancelled`。

### 5. 简历：提案 → 批准 → 读回

状态：失败，但没有误写数据。

- session 120 第一轮先由 `general_chat` 生成一份没有读取当前简历的“文案提案”，并错误声称没有写权限。
- 用户确认后才创建第二个 `resume_edit` Run、真实 proposal `rep_c359b6b123116976c439135f0ea8f461` 和 Gate。
- 从首次请求到真实 Gate 可操作约 4 分钟。
- Gate 数据库状态已是 `approved`，但 Run 仍为 `waiting_user`，没有执行应用与读回。
- 取消后 proposal 仍为 `pending`；session 121 读回当前简介仍是原文，证明没有误写。

### 6. 优秀简历 Gate

状态：路径不稳定。

- session 112 能打开 `save_reference_resume` Gate；拒绝后 Run 终结，未写入。
- session 119 的同类请求没有打开 Gate，直接因持久化合同未满足而失败。
- session 112 刷新后仍显示 pending 操作按钮，尽管数据库 Gate 已是 `denied`。该 UI 持久化问题已本地修复。

## 冻结的问题清单

| ID | 严重度 | 集群 | 问题 | 生产证据 | 处理状态 |
| --- | --- | --- | --- | --- | --- |
| PE2E-ROUTE-001 | P0 | 意图 | “不要更新画像”覆盖“职业定位”，错误选择 `profile_update` | 101、102 | 冻结，待设计 |
| PE2E-ROUTE-002 | P0 | 意图 | “不要直接写入”覆盖“创建待审批提案”，错误选择 `resume_query` | 104、105 | 冻结，待设计 |
| PE2E-ROUTE-003 | P0 | 意图 | 内容引用里的“JD要求”覆盖“模拟面试”主意图 | 109、110 | 冻结，待设计 |
| PE2E-ROUTE-004 | P1 | 意图/观测 | 正向职业定位能聊三轮，但 Task 全记为 `general_chat` | 117 | 冻结，待设计 |
| PE2E-EXEC-001 | P0 | 执行 | JD Task 选对，但评估生成和报告落库不闭环 | 106、107 | 冻结，待设计 |
| PE2E-EXEC-002 | P0 | 执行 | 文件导出 Task 选对，但没有生成文件 | 113、114 | 冻结，待设计 |
| PE2E-EXEC-003 | P0 | 执行 | 岗位搜索 Task 选对，但确认、扫描、读回都没完成 | 115、116 | 冻结，待设计 |
| PE2E-EXEC-004 | P1 | 执行 | 同类优秀简历请求有时出 Gate、有时直接失败 | 112、119 | 冻结，待设计 |
| PE2E-GATE-001 | P0 | 恢复 | profile Turn consumed 后仍 `waiting_user` | 111 | 冻结，待设计 |
| PE2E-GATE-002 | P0 | 恢复 | Gate `approved` 后 resume Run 仍 `waiting_user` | 120 | 冻结，待设计 |
| PE2E-FLOW-001 | P0 | 对话推进 | 面试回答后重复生成“第 1 题”，没有反馈 | 118 | 冻结，待设计 |
| PE2E-UI-001 | P1 | UI 投影 | Gate denied 后刷新仍显示 pending 操作按钮 | 112 | 本地已修，待统一部署 |
| PE2E-PERF-001 | P1 | 性能/状态 | Gate/真实 proposal 可能需要 2-4 分钟，前台长期显示模糊等待态 | 111、112、118、120 | 冻结，待设计 |

## 共同根因假设

这些是待讨论假设，不是已经确认的实现方案。

1. **主意图、约束、材料引用混在一个扁平关键词判断里。** “不要更新”“不要直接写入”应是执行约束，不应改变主 Task；“JD要求”是面试材料，不应把 Task 改成 JD 评估。
2. **Task 合同只在结尾判成功，缺少确定性的前置执行计划。** 模型可以先输出文本，但没有被强制完成 fetch / gate / tool / persist / read-back 的阶段序列。
3. **普通用户 Turn、Gate response、Task continuation 没有统一恢复语义。** 输入能写入并被 consumed，但 Run 可能再次落回 `waiting_user`。
4. **对话文案早于真实事实。** 简历链路先生成“文案提案”，几分钟后才出现真实 proposal，造成“看起来能做”和“实际上已执行”不一致。
5. **同一类请求存在多条非确定执行路径。** 优秀简历保存一次走 Gate，一次直接合同失败，说明工具调用计划不稳定。

## 建议讨论的统一方案边界

1. 定义 `IntentEnvelope`：`primaryTask`、`constraints`、`referencedMaterials`、`writePolicy`、`approvalPolicy` 分栏，不再用单一标签承载全部语义。
2. 定义每类 Task 的确定状态机：`preflight → clarify/gate → execute → verify → respond`，模型只能填内容，不能跳阶段。
3. 统一 continuation：普通回答、Gate response、批准/拒绝都映射到明确 checkpoint，并规定恢复后的下一状态。
4. 成功文案只能由已验证 artifact / DB read-back 生成；禁止模型在工具事实之前声称已创建 proposal、已保存或可执行。
5. 把本文件对应的 eval backlog 作为改造验收条件，一次性跑完短链路、长链路和数据库不变量后再统一部署。

## Eval 沉淀

- 机器可读用例：`src/__tests__/fixtures/agent-production-e2e-backlog.ts`
- Eval 完整性门禁：`src/__tests__/agent-production-e2e-backlog.eval.test.ts`
- Gate UI 回归：`src/__tests__/agent-gate-decision-persistence.regression-2.test.ts`
- 已有生产链路回归：`src/__tests__/agent-production-chain-regressions.eval.test.ts`

所有主干异常用例当前都标记为 `frozen_for_design`，避免在方案形成前用局部补丁把错误行为固化。
