# Spec 19: Scheduled Unattended Job Digest

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0039、ADR-0017、ADR-0018、词表「无人值守 Run」「岗位精选」「持续岗位发现」、Spec 01/02；批次归属 0.14.0（C1）

## Problem Statement

词表已定义「持续岗位发现」但运行时没有任何用户可用的定时触发；机会池供给（scan-worker）与 agent 运行时是两条脱钩的管线。无人值守执行若无显式契约，调度触发会绕过为用户输入设计的治理前提——写工具、记忆写入、自动投递都可能在无人监督下发生。

## Solution

新增 `scheduled_run` 调度表与 agent-worker 内调度 tick；到点经 Run Admission 创建完整持久 Agent Run，绑定只读契约（写工具不在 allowlist），只读既有机会池产出「岗位精选」digest（新增 Top 5 + 一句话点评 + 去重说明），投递到独立常驻对话；错过调度有明确对账语义。

## User Stories

1. 作为求职者，我希望每周一早上收到本周新机会精选与点评，从而不必每天手动扫描。
2. 作为求职者，我希望精选明确说明它只汇总了既有机会池，从而不误以为它偷偷扫描了。
3. 作为求职者，我希望没有新机会时也收到说明与放宽条件建议，而不是一周静默。
4. 作为求职者，我希望精选任务不能修改我的简历、记忆或发起投递，从而对"自动运行"放心。
5. 作为运维人员，我希望错过的调度有确定的补跑/跳过规则且失败通知可见，从而不出现静默断供。
6. 作为实现 Agent，我希望无人值守 Run 与用户发起 Run 走同一 Admission 与证据管线，从而不维护两套治理。

## Implementation Decisions

- `scheduled_run` 表 additive；调度 tick 挂在 agent-worker 既有轮询循环（1s 唤醒检查），不新增进程；触发时间 Asia/Shanghai 周一 08:00。
- **系统发起的 Admission 入口**：既有 Admission（ADR-0035）由 Turn 驱动 POST；无人值守需新增系统发起入口——幂等键为 scheduled_run id，active-run 冲突时跳过本次并记录；复用同一 Admission 决策代码，调度器不直接执行任何工作（ADR-0039）。
- **岗位精选 Program 注册的完整涟漪**：新增 AgentTaskType 波及 `TASK_CONTRACT_POLICY`（tool-governance.ts:703-716）、相关工具 `allowedTaskTypes`、`TASK_LABELS` 与 `TASK_PROGRAM_REGISTRY` 的 version 字面量（task-program.ts:7,24）——变更单逐项列出；Program 无 clarify_or_gate 阶段（无人可澄清），阶段为 preflight → digest → persist → respond（先例 file_export，task-program.ts:35）；无写阶段，但必须产出持久化 digest 才能声明成功（确定性 Program 的成功出口约束）。
- 只读契约：精选 Run 的工具 allowlist 不含任何 write-effect 工具；LLM 点评是输出内容不是写入；机会池读取按用户归属校验。
- 水位线：每用户记录上次精选时间，精选范围为自水位线以来新增且未投递过的机会 Top 5，附去重说明（对齐词表「岗位精选」定义）；无新增时产出说明文案 + 放宽条件引导（不联动扫描，2026-10 计划决策 #11）。
- 对账：错过 24h 内开机补跑一次；超过 24h 跳过并在下次精选说明（ADR-0039）。
- 投递与失败通知分离：digest 以 Conversation Item 落入常驻「岗位精选」对话——首次精选时由**系统**创建（归属用户，求职旅程栏显示为持续旅程；2026-10 计划决策 #17）；失败/跳过产生用户可见通知；静默失败视为缺陷。

## Testing Decisions

- 调度单测：到点触发、24h 内补跑、超时跳过并说明、重复触发幂等。
- 水位线确定性单测：Top 5 = 自水位线以来新增且未投递过的机会，含跨周去重断言。
- 系统发起 Admission 单测：幂等键防重复创建；active-run 冲突跳过并记录。
- 只读契约单测：无人值守 Run 对全部 write-effect 工具的调用返回治理拒绝（deny，不弹 Gate）。
- 旅程 e2e：人为触发 → 独立对话出现 digest 卡；无新增 → 降级文案正确。
- 归属与隔离：用户 A 的精选不读用户 B 的机会池（跨用户泄漏为硬失败）。
- Program reducer 测试：必做阶段（digest 持久化）缺失时不得声明成功。

## Out of Scope

- 设置页开关与自定义频率（二期）；扫描联动；自动投递；邮件/webhook 多渠道通知。
- 改变 scan-worker 行为（其 Postgres 封锁已在提交 50919be 修复）。

## Further Notes

- 岗位精选与对话式岗位发现共用机会池与「岗位发现结果卡」词汇，但精选是只读汇总，不是新的扫描任务。
