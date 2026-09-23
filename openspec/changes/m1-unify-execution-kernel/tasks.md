# Tasks: m1-unify-execution-kernel

## 0. Production Cutover（发布即切换，决策 #21：不做预检）

- [ ] 0.1 M1 发布包随附生产 env 变更：`AGENT_RUNTIME_MODE=worker_all`，`pm2 env` 留档；实现 `AGENT_LEGACY_ESCAPE_HATCH` 回滚 flag（默认关，见 design.md）。
- [ ] 0.2 部署后监控：每日核查 `agent_runs.execution_owner` 分布与失败 run 归因，连续 7 天无 P0 回归。
- [ ] 0.3 观察期内如需回滚：开 escape hatch 恢复 directMode 临时旁路；观察期结束随第 1 节删除一并移除 flag 与旁路。

## 1. Dead Code Removal

- [x] 1.1 删除 `src/lib/agent/loop/client-runner.ts` 及其仅存的测试引用（`agent-image-loop.test.ts` 等），`formatJDEvaluationSummary` 若仍有价值迁至 evaluate-jd-full 工具侧。
- [x] 1.2 删除 `src/lib/agent/loop/remote-runner.ts` 与 page.tsx 的 `agentLoopRemote` 调用分支及过时注释（"classify + agentLoopClient"）。
- [x] 1.3 删除 `/api/agent/run` 的 directMode 分支；非 directMode 的 `orchestrateGen` 分支确认仅剩 eval 脚本调用后，为 eval 脚本改走 durable API 或保留最小旁路并注明。
- [x] 1.4 `runtime-mode.ts` 收敛：`AGENT_RUNTIME_MODE` 仅接受 `worker_all`，其余值告警并回落 worker（保持向前兼容读取）。

## 2. Worker Gap Closure（行为等价五缺口）

- [x] 2.1 `orchestrateGen` → `agentLoopServer` 传递 `interviewState` / `interviewRebindAction`（对齐 directMode 现状，证据：orchestrator/index.ts:207-227）。
- [x] 2.2 服务端提示词重建覆盖 interviewContext / rebindContext / guidedDirective（原 page.tsx:1606-1652 客户端拼接职责上移）。
- [x] 2.3 Run Admission 的服务端 contract 重建携带客户端 journey artifacts 与 resume baseVersion/baseHash（run-admission.ts:171-195）。
- [x] 2.4 worker 观察者补齐 persist_done / search_start / search_result / offer 状态推导三类事件（page.tsx:800-879 观察者扩展）。
- [x] 2.5 imageIntake 路由结果进入服务端 Run Admission（durable-run-client 传输字段 + admitAgentRun 消费）。
- [x] 2.6 修复 `career_positioning` 不在 `AGENT_MEMORY_TASKS` 白名单导致 DEFAULT_DENY 的策略漏洞（属 M5 前的止血，不引入新机制）。

## 3. ModelGateway 收编

- [x] 3.1 新建单一网关模块（fallback 链、SSE 解析、tool_call 分片重组、超时与重试），`server-runner.callLLM`、`/api/agent/think`、`classify-intent-llm` 三处调用方全部切换。注意 `/api/agent/think` 在 M1 后仍存活（`agent/memory/episodic.ts`、`semantic.ts` 仍在调用，至 M5 会话层引入后随 localStorage 记忆线一并退役），本项是收编其 MODEL_CHAIN 而非删除路由。
- [x] 3.2 删除三份 MODEL_CHAIN 拷贝；`.env` 模型配置读取收口。

## 4. Spec & Test Hygiene

- [x] 4.1 归档/改写 spec：`agent-loop-client`、`react-agent-loop`、`agent-think-proxy`、`sse-robust-parsing`。
- [x] 4.2 僵尸测试删除清单执行；worker 路径补对应回归。
- [x] 4.3 更新 `docs/ARCHITECTURE.md` 的 runtime 模块表（移除 "Transitional legacy-mode adapter" 行）。

## 5. Acceptance Gates

- [ ] 5.1 PE2E 11 类短链路全过（fixture：`agent-production-e2e-backlog.ts`，解冻对应用例）。
- [ ] 5.2 PE2E-UI-001 验收（Gate 终态持久化，随统一部署）。
- [ ] 5.3 行为等价抽查：JD 图评估、简历 Gate 批准/拒绝、面试 wait_user 三条链路在 worker 路径与删除前 legacy 路径输出一致。
- [ ] 5.4 TypeScript / lint / 生产构建通过；全量测试通过（第 4 节删除清单内的僵尸用例除外），不以固定用例数为基线。
