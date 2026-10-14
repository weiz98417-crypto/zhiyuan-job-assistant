# Spec 40 第三批 Legacy Run 迁移与回滚证据

基线：`a8b4462`。本批是 B0 的隔离实现切片；生产版本仍为 0.13.2，未执行生产历史数据迁移、推送或部署，不能据此关闭 B0、67 项问题或 392 项验收。

## 实施与批准边界

`LegacyRunMigrationService` 提供批量只读检查、批准后执行、回滚检查及批准后回滚。清单按明确 Run/migration ID 排序，保存稳定 batch/entry ID、owner、operator、schema、来源与目标 hash、精确批准范围以及回滚和向前复核策略。批次允许逐项阻断，成功项与失败项分别留证，不把部分提交汇总为成功。

旧 Run 保留原 runId、owner、conversation、task/agent 绑定与输入原文。影响审查的 source hash 包含全部原输入（包括 rejected 输入）、最新 checkpoint、owner-bound session 行及该会话全部 `session_memory.summary_type=execution_conversation` 行；审查后来源变化会拒绝执行。Rejected 输入不会成为复核事实。执行事务锁定这些来源行，迁移后停在 Worker 所有的 `paused/preflight`，不启动旧 executor，也不把历史模型的“已保存”声明当成新的完成证据。

原 `legacy_migration` checkpoint 独立保留原 Run、全部原 inputs、原 checkpoint、session 行、持久会话 memory 行与 required checks 的快照。receipt 保存旧/新语义 hash 及真实数据库 image 的 before/after hash；后续 checkpoint 不替换它。事件及两类 outbox 保留审批审计。变更事务提交并释放连接后，另开只读事务独立读回。

执行先锁 sessions 父行，再读取并锁 execution conversation memory 行。实际 `PostgresSessionMemoryAdapter.append` 也先锁该 sessions 行，因此原 memory 行不存在时，首次 INSERT 仍与迁移/回滚串行。只锁已存在 memory 行不能保护空行竞争。迁移与回滚不覆写这些真实会话行，提交后新增持久会话会被独立读回拒绝，或者在后续 rollback 检查要求同 Run 向前复核。

这里的批准文件只是维护流程中的可评审 artifact，检查精确范围和身份字段一致性，尚未提供生产可信审批人的认证、签名或不可变批准账本。真实用户历史记录仍须先形成清单，按已批准方案逐批确认；不得直接拿本批合成 fixture 的批准文件处理生产记录。

## 安全回滚语义

策略为 `restore_original_payload_paused`：恢复原合同、result/error、预算与 policy payload，保留历史声明和原 task/agent/user/session/runId。操作状态保持 `legacy=false/runtime_mode=worker_all/execution_owner=worker/paused`，owner lease 清除，fence、snapshot version 与 event sequence 只前进。原 inputs 保持 consumed，原输入状态保存在快照，避免重新执行历史 pending 输入。原 required checks（包括未知任务的 task binding review）继续阻断自动推进。

回滚追加自己的 checkpoint、事件及 outbox，保留所有迁移审计，不携带 modelCompletion。新输入、状态、conversation、checkpoint 或其他 runtime image 变化都会要求 `forward_revalidation_required`，拒绝覆写或消费新数据，并提示在同一 Run 向前复核。

迁移或回滚 COMMIT 后独立读回失败时，结果明确为 `blocked` 与 `sideEffect=committed_requires_review`；不能声称事务已回滚，也不能把模型/tool success 作为成功。

## 维护 CLI

入口：`node scripts/legacy-run-migration.mjs --help`。四个命令为 `inspect`、`apply`、`inspect-rollback`、`rollback`，必须显式提供 database URL、owner、operator 和输出文件。重复 `--run` 或 `--migration` 可定义批次，变更只能依据 reviewed manifest 与 approval 文件。

CLI 不读取一般 `DATABASE_URL` 或 `.env`，拒绝覆盖输出，变更前先预留输出 artifact，owner/operator/operation 不一致先拒绝且不联网。输出含个人材料，应放在忽略的私有目录中，不能提交或公开。退出码 0 表示完整独立读回，2 表示逐项阻断或部分完成，1 表示参数/操作异常。

批准文件字段：`approvalId`、`approvedBy`、`operatorId`、`scopeHash`（manifest 的 approvalScopeHash）、`entryIds`（完整精确批准集合）。批准范围或 manifest 内容被修改都会拒绝执行。

## 隔离验证

唯一运行目标是本机隔离 PostgreSQL 16 + pgvector fixture：`127.0.0.1:55440/spec40_runtime`，连接池 `max:1`，清理仅针对各测试新建的合成 owner。未设置 fixture 环境变量则 PostgreSQL 测试显式 skip，不能计为通过。

2026-10-14 15:00:59 本机最新专项运行：

```powershell
$env:SPEC40_RUNTIME_DATABASE_URL='postgresql://spec40_fixture@127.0.0.1:55440/spec40_runtime'
npx vitest run src/__tests__/legacy-run-migration-batch.postgres.test.ts src/__tests__/legacy-run-migration-cli.test.ts src/__tests__/spec40-runtime-postgres.integration.test.ts
```

结果：3 files、40 tests 全部通过（本批批量 PG 29、CLI 4、既有 runtime PG 7）。覆盖稳定只读清单、owner 隔离、精确批准与防改、原快照、幂等、部分批次、并发执行、原 payload 回滚、未知 binding、rejected 输入保护、新输入/状态/conversation/checkpoint 阻断、审查后来源 conversation 变更、真实两连接插入竞争、提交后污染的独立读回拒绝，以及 CLI 四命令在隔离 PG 的真实闭环。

会话审查后变更用例先出现 RED：source hash 原先只保护 Run/input/checkpoint，变更后的 conversation 未阻断。修复后把 owner-bound session 全部内容加入来源 hash，并锁定迁移来源，专项全部转绿。

父代理随后独立发现 ADR-0036 的 Worker append 实际写 `session_memory`、无 request ID 时并不变更 sessions 行；只保护 sessions 仍会漏掉真实续轮。2026-10-14 14:55:02，真实 `PostgresSessionMemoryAdapter` 在隔离 PG 上的首次 INSERT/既有 UPDATE × apply/rollback 审查后续轮共四项 RED，错误报告 applied/rolled_back。将 execution conversation memory 全行纳入来源及 image hash 后四项转绿。

追加九项真实 PG 证据：原持久会话快照保留；Worker 先锁 sessions 的四种 apply/rollback × 首次 INSERT/既有 UPDATE 竞争都使旧清单阻断；迁移先锁空 memory 父会话的两个场景通过 `pg_blocking_pids` 证明确实阻塞 Worker 首次 append，释放后新内容保留且后续回滚拒绝；真实 Worker 在迁移或回滚 COMMIT 后、独立读回前 append 的两项结果都是 `committed_requires_review`。测试仅将生产 PostgreSQL 访问入口路由至隔离连接池，adapter 的 append/merge/read-back SQL 为实际实现，无业务 mock，也没有修改 sessions 来代替真实持久对话。

一次扩展运行在 14:59:45 出现 Vitest fork 意外退出（20 passed/29，无产品断言失败），该次不计通过。随后空行父锁两项精准运行与最新三文件 40 项完整专项均通过。

本批 `npx tsc --noEmit`、相关模块/CLI/测试 ESLint、CLI `--help` 打包执行及 `git diff --check` 均通过。完整套件由根代理统一收口。

## 仍然开放

生产 legacy inventory、可信批准来源、真实历史记录逐批确认、固定构建及正式迁移/回滚包聚合、完整 runner/Eval Run、55 工具及动态 MCP 覆盖、Judge 校准、N/A 批准、392 项全量执行与 canary 仍需继续完成。Mastra 等独立 provider 的外部存储不在此 PostgreSQL image 内，仍缺相应固定 provider inventory 与保护证据；当前 Postgres 切片不能作为所有 provider 的迁移安全证明。B0–B4 只允许隔离或预生产验收，B5 仍是一次正式生产切换。
