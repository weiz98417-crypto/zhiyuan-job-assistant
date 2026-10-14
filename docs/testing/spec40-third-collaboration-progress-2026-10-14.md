# Spec40 第三批 W02 协作修复进展

日期：2026-10-14。工作基线：`a8b4462`（master）。范围仅 B0/B1 隔离候选；本批验证完成后提交当前分支，没有 push、deploy 或生产数据修改。

## 已实现的行为

- `delegate_research` 从当前持久化用户消息校验专家、研究目标、明确授权与依赖等级，冻结授权 quote/hash、来源版本/hash、只读工具交集和结构化输出契约，使用稳定 delegationId 创建 session_id 为 NULL 的真实子 Agent Run。
- 子 Run 由正常 Worker 队列执行，拥有独立 fencing token。结构化 findings 只有在完整结束、来源契约通过、持久化 checkpoint 和父端独立读回后才可被父模型消费；started/finished/error/consumed 使用同一 delegationId。
- 子权限不含写工具、用户交互、个人记忆写入与再次委派。required 研究失败使父任务等待；supporting 失败允许原回答继续，但引擎强制追加缺失研究限制。Program 权威声明：仅 general_chat 明确允许 supporting，其余没有声明时保守 required；用户辅助措辞不能降级 Program 要求。
- `transfer_to_agent` 同目标保留 runId、目标、taskType、Program、完成进度和来源，持久化专家身份、授权、工具交集后分别读取 Run/checkpoint 核验。接手模型收到专家系统身份、来源正文、原约束和受限工具集合。模型提供的任意 summary 不成为交接事实。
- 交接审计追加中断时明确返回 audit_pending：身份已持久化，但未声称交接完整成功。Worker 从冻结 checkpoint 与事件复核并恢复同一 handoffId，恰一次补齐审计；专家身份和 marker 穿过后续 checkpoint、中断及完成。
- 共享明确执行授权校验拒绝引用、解释、条件、否定和能力问句；专家别名必须紧随协作动词，目标正文含“简历”不能误授权 resume，合法目标中的“解释/如何/引用书名”不误拒。
- 后继用户约束继续收紧冻结合同，默认模型入口获得原来源正文/hash、授权及工具交集；显式空数组始终表示零工具权限，safe_tool_replan 与后续 Worker 恢复也不能回退到专家完整工具。持久来源、授权或工具被篡改时，在模型调用和会话写入前拒绝。
- 授权、来源、空权限、旧 fence、来源 bytes/owner 变更在执行前拒绝；排队超时请求取消，父取消级联到子，执行中的 child 收到 AbortSignal，取消后部分文本不成为成功发现。

## 来源与队列的最小修改

`collaboration-sources.ts` 只接受有独立 owner/hash 校验的来源：attachment 校验 owner/run/images hash 并冻结抽取正文；tool_attempt 通过现有 PostgresRunContextSource 精确读取对应 id/hash/version 的摘要。来源 A 不携带 B，B 变更不会改变 A 的契约；A 正文变更改变稳定 identity，旧 child 契约不能通过重新校验。其他 JD/resume/report 等来源类型目前明确 fail closed。

`PostgresRunContextSource` 的已完成工具事实增加可选 sourceRef，保持摘要与具体 attempt 的归属；没有新建 store 或 claim 路径。

真实 PostgreSQL 首次执行揭示原正常 claim 的同用户串行谓词阻止父运行期间 child 被任何 Worker 领取。修复仅在现有 claim 谓词中允许真实、同 owner、有效父挂靠的 worker_readonly/delegated_research 子及该父下的研究 sibling；普通 root、写 child、伪造 parent、失效父和无关 active Run 保持拒绝。取消请求仍可由正常队列完成取消。

## 实际验证

- `durable-collaboration-runtime.test.ts`：39 个 Runtime/AgentChat 纵切通过，包括同目标专家工具/来源、授权/source/emptylist/stalefence 无禁止副作用、真实 Worker 交接中断恢复、自定义及默认模型入口、后继只读收紧、零工具安全重规划、冻结契约篡改拒绝、跨目标明确 partial、Program required 不降级、child timeout、父取消、执行中取消、required/supporting 失败和稳定 lifecycle/父消费。独立 Spec 复审另运行该文件 39/39 通过，未修改代码。
- `durable-collaboration-postgres.integration.test.ts`：9 个真实 PostgreSQL case 通过。隔离位置为 127.0.0.1:55440/spec40_collaboration，使用新增专用库、schema-only 克隆和合成 owner，不接触其他 fixture/生产。case 核验 queued child 正常领取、独立 Worker/fence、真实 get_pipeline_status 读取、Tool Attempt 与 checkpoint SQL 独立读回、父后继模型消费以及七种 unsafe claim 拒绝；另有 source A/B 隔离 case。
- 同一轮定向相邻 Runtime、Program、协作、投影和 loop gate 回归已通过；`postgres-run-context-source.test.ts` 通过。全局 `npx tsc --noEmit --pretty false` 与 `git diff --check` 通过。
- 保留首败：同目标交接原先更换 taskType；接手工具扩权；遗漏 delegate 工具权限；父取消未传到运行中 child；真实 PG claim 阻塞 child；用户 optional 措辞把 Program-required 降级。均已形成 RED→GREEN 永久回归。
- 最终恢复专项 4 文件 86 项通过。首次空工具恢复测试错误要求 failed，实际治理正确拒绝后进入 queued/safe_tool_replan；独立诊断确认无禁止调用后，仅修正生命周期预期并补下一 Worker 的零权限与恰一次审计断言。首败和诊断保留在 `.private/spec40/third-handoff-recovery-final.log` 与 `third-empty-scope-diagnosis.log`，绿色结果在 `third-handoff-recovery-green.log`。再新增三项冻结契约篡改保护后，Runtime 文件 39 项通过，证据在 `third-handoff-frozen-guard.log`。

## 尚未完成的验收

- 跨目标工具仅返回 admission_required 并保留原 Run；真正 Run Admission 创建新 Run、传允许 artifact、前任务安全暂停以及 Tracker 谈薪/HR 入口仍为 partial。
- 真实浏览器刷新/重连、真实模型质量、两专家冲突、完整深度/并发参数组合与 392 项正式验收尚未执行，本文件不把上述单元/PG 绿色等同 AC-COL 全通过。
- 不支持独立核验的领域来源继续 fail closed；没有以旧来源猜测 owner/hash 或偷偷放宽。
- 本批冻结后根代理统一完整测试 316 文件、1854 项通过/2 项跳过；类型和 Web/Worker 构建通过，定向 ESLint 无错误。Standards 与 Spec 独立双轴审查未发现本批剩余阻塞项；不标记 ISS-053 或整个 W02 closed。
