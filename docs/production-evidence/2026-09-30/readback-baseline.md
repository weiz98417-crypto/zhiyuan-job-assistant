# 生产只读回读基线（2026-09-30；历史会话与局部清理证据）

状态：`partial`。本文件对应同目录的结构化回读快照；只记录元数据、计数、状态、长度和哈希，不保存 JD/简历正文、模型密钥或数据库 URL。原始回读只打开 PostgreSQL `READ ONLY` 事务，没有执行发布切换、PM2 操作或数据清理；文末另附会话 151 的受控清理后回读。清理只覆盖明确授权的 QA 会话及其草稿，不能代表全部 QA 数据已清除。

## 运行基线

- `current` 仍是 `/root/zhiyuan-job-assistant/releases/20260929-v0121-changelog-62654e4`，`VERSION=0.12.1`。
- Web 与 Agent Worker 均在线，生产 Worker 的模型密钥存在；本地 `deepseek-flash: no key` 只说明本地进程没有环境变量，不能推出生产缺密钥。
- 数据库白名单表存在：`sessions`、`agent_runs`、`agent_run_events`、`agent_run_gates`、`agent_tool_attempts`、`agent_run_checkpoints`、`agent_run_inputs`、`agent_run_outbox`、`agent_conversation_items`、`scan_queue`、`scan_jobs`、`scan_source_runs`、`jds`、`reports`、`resume_documents`、`resume_source_artifacts`、`resume_drafts`、`agent_eval_runs`、`agent_eval_layer_results`。
- `agent_conversation_items` 的字段包含 `conversation_id`、`run_id`、`artifact_id`、`artifact_version`、`artifact_hash`；当前记录数为 0。`agent_eval_runs` 和 `agent_eval_layer_results` 也均为 0。这里的 0 是事实缺口，不是通过：本次真实流程没有生成可回读的 Conversation Item/Artifact 投影，也没有持久化 production eval run。

## 账号与会话

- 应用 QA 账号为 active superadmin，最近登录时间为 2026-09-30；账号值未写入报告。
- `session_id=147`：普通对话证据对应的会话，历史记录仍在库。
- `session_id=149`：岗位发现确认与扫描会话。
- `session_id=150`：JD 评估会话。
- 149、150 的 QA 数据尚未清理；没有独立清理事件/表记录。

## 岗位发现 → JD → 报告

- 岗位确认 Run `aaf6f022-5a5d-4627-a1f3-8ff8e707dc0c` 属于 session 149，`job_search`、`worker_all`、`execution_owner=worker`、`status=succeeded`。`scan_portals` Gate 经 `pending → approved`，对应 Tool Attempt 为 `succeeded/verified`。
- 扫描 `1770f995-5e5c-4256-b35b-4550dd6de3fb` 为 `done`，28/28 公司处理、3 条新岗位；`scan_jobs` 有 3 行。扫描 `error_log` 有 36 条，来源中存在 `failed`、`blocked`、`empty`，只有一来源产生 4 parsed/4 matched/3 inserted；不能宣称所有来源成功。
- JD Run `f5c43012-4eed-47fe-a197-436ba2a45a91` 属于 session 150，`jd_evaluation`、`worker_all`、`execution_owner=worker`、`status=succeeded`。共 40 条有序 Event，包含 `run.created/claimed/checkpointed/model_output_complete/contract_evaluated/status_changed`；工具 `get_recent_jd_context` 与 `evaluate_jd_full` 成功。
- `report_num=18` 已持久化，评分 3.8/5、A–G 七块；关联 `jds.id=28`，JD 正文长度 106。岗位发现原始 JD 为 `jds.id=27`。

## 简历与 Artifact

- `resume_documents` 和 `resume_source_artifacts` 当前计数均为 0；因此没有本次生产旅程的简历读取/来源 Artifact 读回。
- `resume_drafts` 有两条历史 `status=draft`，内容与完整性键存在，未应用；不能把它们算成本次不落库草稿证据。
- `agent_conversation_items` 为 0，故缺少 Conversation Item、Artifact 版本/hash 投影读回。
- 生产 `agent_runs` 中上述主 Run 的 `parent_run_id` 均为空；149 的岗位扫描和 150 的 JD 评估属于不同会话，不能证明同一目标内 Agent→Worker→Agent 委派链。

## 清理与门禁结论

已落盘本轮浏览器截图（普通对话、历史刷新、简历草稿 Gate）和脱敏 network 白名单，且有 PostgreSQL 只读基线。会话 151 的软删除、Run 取消和草稿 `discarded` 已有独立的清理后回读；历史会话 149/150 及其扫描、JD 和报告仍在库，未执行清理。console 错误汇总、完整岗位→JD→简历跨任务交接、Artifact/Conversation Item 投影、候选版本在线复测仍缺失。因这些硬证据缺失，`FLOW-UI-001` 继续为 `partial`，发布硬门禁不能通过。

## 线上错误

旧 Worker error log 中 `operator does not exist: bigint = text`（PostgreSQL 42883）出现 4 次，均为 `[jd-evaluation-persistence] memory index/writeback failed`。根因是 memory SQL 将 `jsonb_array_elements_text(...) id` 的别名误当作文本列；本地已统一改为 `AS erased_fact(value)` 并验证生产修正 SQL 4/4 可解析。当前该账号 `memory_facts` 为 0，但发布前必须用修复包重新执行 JD 和记忆回写验证。


## 历史清理前只读快照（会话 151）（16:57–17:00 UTC+8）

- `sessions.id=151` 未软删除；普通聊天 Run `355fbca5-9d0e-4611-b0df-f44a09ee62de` 是 `succeeded/worker`，18 条 Event。
- 简历 Run `8c09f68a-e3cd-4f4e-a617-95bb59f4de61` 是 `waiting_user/worker`，41 条 Event；Tool Attempts 依次为 `read_file`、`get_recent_jd_context`、`optimize_resume_section`，均 `succeeded`。这是草稿阶段，未应用简历。
- `cv_data.id=1` 的 `data_json` 长度 10,295，MD5 为 `765c154bce83c1ed884eb6fde06306ed`；基线 `updated_at=2026-09-28T07:29:15.375Z`。本次 QA 新草稿 ID 为 `draft_1_9feff838c6f0fdd844d78647`，`artifact_id=draft_artifact_9feff838c6f0fdd844d78647`，`status=draft`，`base_version=v2`，`base_hash=fnv1a32:e5f8a2e2`，内容与完整性字段均存在；另有两条 9 月 29 日历史草稿。`resume_documents/source_artifacts` 仍为 0。
- Nginx access log 的脱敏白名单记录在 `network-access-whitelist.tsv`，只含时间、方法、路径、状态、响应长度；不是 HAR，不含 IP、query、Referer、User-Agent。
- 修正后的 suppression 查询已在生产 `READ ONLY` 事务中 6/6 执行成功；`VALUES` fixture 显示删除目标 fact `101` 被排除、`202` 保留。没有写入持久表。

## 历史清理前最新状态（仅取消 Run 后）

- 在会话软删除前只读确认：resume Run `8c09f68a-e3cd-4f4e-a617-95bb59f4de61` 已进入 `cancelled`，`completed_at=2026-09-30T09:06:33.652Z`；普通 Run `355fbca5-9d0e-4611-b0df-f44a09ee62de` 仍 `succeeded`。
- `sessions.id=151` 此时 `deleted_at=null`；草稿 `draft_1_9feff838c6f0fdd844d78647` 仍 `status=draft`、未应用。

## 清理后只读回读（2026-09-30 09:14 UTC）

- UI 已软删除 `session_id=151`，数据库 `deleted_at=2026-09-30T09:14:09.617Z`；截图 `session151-softdelete.jpg` 已由浏览器 QA 保存。普通 Run `355fbca5-9d0e-4611-b0df-f44a09ee62de` 仍 `succeeded`，简历 Run `8c09f68a-e3cd-4f4e-a617-95bb59f4de61` 为 `cancelled`。
- `draft_1_9feff838c6f0fdd844d78647` 仍是 `draft`，未应用；清理没有修改 `cv_data.id=1`（长度 10,295、MD5 `765c154bce83c1ed884eb6fde06306ed`、updated_at 仍为 2026-09-28）。没有本轮 `resume_edit_proposals`。
- 草稿表只有 `draft/selected/applied/discarded` 状态，没有 `archived` 字段；当前 `/api/cv/drafts` 没有归档入口。为避免直接改库，本次仅归档会话，草稿保留为可审计的未应用记录；后续应通过受控 API 将其标记 `discarded` 并再回读。

## 会话 151 清理后的最终回读

- 已在用户授权范围内通过服务端受控事务，将且仅将与 session 151、已取消 Run `8c09f68a-e3cd-4f4e-a617-95bb59f4de61` 精确关联的 `draft_1_9feff838c6f0fdd844d78647` 从 `draft` 标为 `discarded`。关联校验命中唯一 `optimize_resume_section` Tool Attempt；未删除正文或补丁。
- 更新前后正文 MD5 `beb5b99832a0a4d6700e2b6a7109084b` 与补丁 MD5 `c97cddbaca46af57c8707a99a973904e` 不变；`base_version=v2`、`base_hash=fnv1a32:e5f8a2e2` 不变。其他两条草稿仍为 `draft`，未触碰。
- `cv_data.id=1` 仍为 `active_version=v2`，长度 10,295、MD5 `765c154bce83c1ed884eb6fde06306ed`、`updated_at=2026-09-28T07:29:15.375Z`。当前 section 元数据哈希：summary `a96ef7169fcf4aaff65572b8c97f101c`、experience `1c6bb13fb473066ab07b7ca7028461cb`、projects `5cee60c332327ba6cdb1d35926eb9c44`、education `881be2189b6244d1f5a655d5c9ffbb67`、skills `00cc41f8f5d00dd17aae3142004c6b45`；均未改变。
- `discarded` 是可恢复状态：如需回滚，只能通过同一 owner 范围的受控 `resumeDrafts.updateStatus(draftId, "draft", userId)`，再做正文/哈希回读；本轮没有执行回滚。
