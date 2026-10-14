# Spec 40 W02 Runtime 后续实现与证据（2026-10-13）

本批实现 ISS-042、ISS-056、ISS-065 的运行时补洞，并接通定位确认、完整面试材料及 ADR-0029 旧 Run 显式迁移。问题状态保持 `fix_implemented_acceptance_pending`；本文件不是 392 项验收通过声明。

## 运行时行为

1. 明确“仅整理 Offer 事实”且禁止写入时，合同进入 `read_only_facts`。完成要求是本账号、当前 Run 的来源材料与事实投影，不再要求保存报告。纯指令没有可提取条件时保持 `waiting_user`；后续短答继续原 Run。已完成归属和 Offer 类型验证的附件，即使只有公司、岗位及入职日期，也可保留全文、将薪资福利列为未知后完成，避免反复索要同一材料。业务工具与生成模型均不参与该投影；该模式不抢占泛指“录用事实”的既有咨询路径。
2. 事实卡保存 `sourceQuote / sourceHash / userId / runId / sourceId`。Offer 附件还保存附件 hash。0% 公积金、0 个月试用期、明确无社保与未知项分别保留；奖金是否保证、币种是否明确独立显示，美元不会因包含“元”而误标为人民币。假设、示例、撤回和未知保持未知；假设作用域覆盖同一行及后续多行，直到明确真实条件锚点。`3千元 / 20,000元` 可精确提取；薪资、薪数范围和不支持的单位不当作单值。数值拒绝非有限值及超出 `Number.MAX_SAFE_INTEGER` 的绝对值。全文原文保留，未识别成字段的事实仍可核对来源。
3. 原准入任务被服务端更正时，`intent_resolved / after_model / model_interrupted` 的 fenced checkpoint 在同一事务同步 Run 的 `task_type / agent_id / contract_json`，Run ID、Conversation ID 与输入身份不变。不能只修改 checkpoint 后让下一次准入读到旧任务。
4. 图片用途续轮支持“整理/提取/梳理”；已识别的 Offer 图片不会因为用户只说“只整理事实”又询问用途。完整面试材料 resolution 从 Worker 经过 orchestrator、server loop 到领域服务；领域服务负责再次验源、保存正文与 hash，本批不信任模型提供的来源归属。
5. 定位确认经过 Worker 的 `mine_profile(action=complete)`，保留 governed attempt、fencing、幂等与禁写门。服务端只对精确用户确认、已经展示且包含当前全部 evidence ID 的定位结果安排此调用；有效合同转为 `profile_update`，仍使用原 Run。只有 `done + readBackVerified` 才输出已保存响应；不让模型补造确认或保存成功。定位确认与最终事实门只使用服务器持久化重置边界之后的消息，不接受客户端自报边界；本轮成功重置且读回验证通过后，Worker 写入隐藏的可信 tool receipt 并重新读取边界。后续边界丢失或回退时拒绝复用旧结论。损坏的旧定位边界不影响无关任务。
6. 消费输入后的模型中断保留原用户 turn 和 checkpoint；进程恢复不重复用户 turn，不把 partial 输出当成完成。存储完成重放只产生一次最终文本与完成事件。

## 旧 Run 迁移

公开操作 seam 为 `LegacyRunMigrationService.inspect(principal, runId)` 和 `apply(principal, runId, reviewedSourceHash)`。`inspect` 只读；`apply` 在事务内锁定本账号原 Run、重新对账来源 hash，并沿用其原 ID、Conversation 及 task binding。尚未接入自动生产迁移或批量任务。

- 非终态迁移后统一 `paused`，切换到 Worker 所有权并推进 fencing；模型“已保存”文字不会转成成功 criteria。
- 原 binding、原 result、原 checkpoint、来源输入 ID 和 fact refs 进入迁移审计。原输入仍保留原记录，但标记已消费，不能因为用户点击恢复就重新执行历史写入。
- 当前 Program 从 preflight 开始；原 base hash/version 保留供重新核对。缺材料、未知任务绑定或会话归属异常分别列出检查项。
- 没有新的材料或明确重新核对指令时，恢复仍等待用户；绑定/会话归属检查未解决时继续阻断执行。
- 历史终态不改写；迁移完成可按同一 reviewed hash 幂等调用。dry-run 后记录发生变化必须重新 inspect。
- 事务提交并释放连接后，使用独立连接路径读回原 Run/owner/task/contract、原输入正文与图片的 hash、已消费状态、两份 checkpoint 消息、`preflight / requiredChecks / legacyRevalidationRequired`、缺失 `modelCompletion` 及 event/两类 outbox。成功才返回 `readBackVerified`；幂等调用也重新验证。提交后读回损坏抛出待复核错误，不把已提交数据声称回滚。单连接池回归证明该步骤不嵌套持有事务连接。
- 本批没有迁移生产记录；真实用户历史清单及逐条确认仍属于后续验收/数据处理步骤。
- 完整可逆 rollback 包、生产迁移入口和批量迁移尚未完成；ADR-0029/B0 保持部分实现，不能据此关闭。

## 验证证据

| 层级 | 实际执行 | 结论与限制 |
| --- | --- | --- |
| UNIT/SIM | `agent-read-only-offer-facts.regression` 19 项 | 缺材料、短答续轮、任务纠正、图片续轮、已验附件全未知；假设/撤回/币种/数值范围/溢出与来源边界，无业务工具/生成模型调用；图片识别为 fixture |
| UNIT/SIM | `agent-consumed-input-recovery.regression` 1 项 | 消费后中断、恢复、最终完成重放；同 Run、用户/助手各一次、partial 不公开 |
| UNIT/SIM | `agent-positioning-worker-confirmation` 8 项 | 精确确认的 Worker 治理路径及禁止写入、重置场次/本轮重置/可信 receipt 后边界丢失阻断、服务器边界拒绝客户端替换、损坏状态及无关任务隔离；governed executor 的结果为 fixture，正式保存验源/读回由定位服务独立证据覆盖 |
| UNIT/SIM | `agent-interview-material-continuation` 1 项 | 完整 resolution 跨 server loop 边界，不转成面试回答；领域行为由面试专项覆盖 |
| PostgreSQL | `spec40-runtime-postgres.integration` 7 项 | 专用本机 PG 16 + pgvector、完整 schema，真实 PostgresAgentRunStore、DurableAgentRunService、Worker/engine；双 claim、旧 fence 拒绝、消费中断、checkpoint/effective contract 读回、replay、legacy dry-run/原 ID paused/来源变更拒绝/terminal 保持/原输入不自动重跑；提交后 contract/input/plan 三类真实 SQL 腐坏全部拒绝 |

最终精准复跑为 10 个文件、97 项通过（2026-10-13 14:04:24 本机测试输出时间）；其中新增 5 个文件共 36 项，7 项使用真实隔离 PostgreSQL。PG 的 Conversation transcript callback 持久化在隔离库 `sessions.messages_json`，连接池 `max: 1`；这组测试没有声称覆盖生产 SessionMemory adapter、真实模型、浏览器或线上故障。审查发现的边界先以失败回归证明，再修复并复跑；既有 intent/write-boundary 预期没有更改。

PostgreSQL 验证只允许 `127.0.0.1:55440/spec40_runtime`，执行时另设 `SPEC40_RUNTIME_DATABASE_URL`；未设变量时该文件 skip，不能计入 PG 通过。测试合成账号有唯一前缀，结束后删除其 Run、Conversation 与账号，未操作其他数据库。

最新 `tsc --noEmit` 通过，相关 ESLint 0 errors；观察到既有 `ModelGatewayError / GARBLED_RECOVERY_HINT / parseInterviewState` 三项 unused warnings，新增事实 helper/回归 lint 无 warning。`git diff --check` 通过。生产代码及回归已冻结，最终全套测试、production build、双轴审查与提交由主代理统一收口。

## 仍需验收

- 生产/browser/model 的 ISS-042/056/065 原场景证据与 392 项 manifest 关联，真实模型 rubric 不能用 fixture 替代。
- 真实 PostgreSQL SessionMemory transcript adapter、provider 流式断线及工具 attempt 对账的完整故障矩阵。
- 生产 legacy 数据只读清单、迁移入口及逐批确认；未知绑定/会话归属异常仍需人工核对，不允许自动猜测修复。
- 任意 Offer 表述/更正的语义扩展与附件识别质量；当前事实投影只对可识别的明文条件结构化，原文完整保留，未知条件不补成默认福利。

本批没有部署或生产数据变更。
