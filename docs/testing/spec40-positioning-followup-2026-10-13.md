# Spec 40 / W06 定位事实与确认增量

日期：2026-10-13。关联问题：ISS-050。状态：增量实现及确定性验收完成；问题仍开放，不能视为真实模型或 Browser-Live 验收完成。

## 本次实现

- 定位结果按持久 Conversation 的真实 user turns 重建；学习、否定、计划、第三方及示例材料保留其真实含义，不升格为已掌握技能或本人行业经历。
- 模型输出触发个人能力/定位断言时，使用保守来源结果替换；不足来源时明确请求本人经历。来源展示包含 evidence ID、原文和 source turn ID。
- `mine_profile` 的引导动作从来源会话重建阶段与原始回答，不再把引导草稿写入 profile goals；模型改写用户 answer 被拒绝。reset 只持久化会话场次边界，不写 transcript、profile 或 signal。
- reset 要求最后一个持久 user turn 明确提出重置/重新开始定位，并具有稳定 turn ID。边界保留该原文及 hash；同一最新 reset turn 重试幂等，有后续新回答时不能重复旧 reset。session 其他 metadata 与面试状态保留，使用 checkpoint CAS 并独立读回。
- 阶段恢复、artifact 来源确认和 Worker 结果使用共享场次选择器；只读取 reset 之后的新材料。边界缺失、原文被替换或 metadata 损坏时拒绝恢复，不回退到全会话旧事实。
- Worker 成功执行并读回 reset 后，在持久 Conversation 留下隐藏 tool receipt。receipt 只用于发现场次 metadata 被整块删除或回退，不能自动恢复状态；尚未执行成功的用户 reset 请求不静默切换场次。SOP 服务仍不写 transcript。
- 确认必须使用 Worker 提供的 conversation ID 和最后一个持久用户回合的精确确认原文；“不要确认”和模型代填的确认不能写入。
- 保存前要求最近的持久 assistant 回合已展示当前 canonical 定位结论和全部 evidence ID。没有展示、来源不符或账号不符时，在写 profile 前拒绝。
- profile 保留原有 data、技能和非定位 goals；定位目标保留为待验证假设，信号标记 `hypothesis` / `confirmed`，关联来源会话。
- profile 写入后独立读取并核对 data、goals、history；signal 写入后独立读取并核对完整来源及 session ID。失败不返回完成。
- 浏览器定位专用直写分支、保存 helper 及临时确认 API 已删除。`mine_profile` 没有 Worker context 时拒绝执行；定位确认不再额外触发自动画像抽取。

## 验证与证据

测试 seam 为实际定位结果函数、Worker 工具边界、真实数据仓储及服务，不以按钮可点击作为通过标准。

1. Red：6 项服务持久化回归中，旧实现在假确认、未展示确认、guide 写画像等 5 个分支失败；补来源门后全部通过。
2. 定位针对性：4 个文件、50 项通过。覆盖学习/否定与自由模型造假、缺证据拒绝、账号来源、精确确认、保存前展示、原画像保留、读回丢证据故障、顺序重复确认。
3. 扩展关联回归：8 个文件、122 项通过，包含上述定位回归及 tool governance、task routing、worker exposure、production-chain regressions。
4. PostgreSQL：专用本机 PG16 / pgvector fixture 上 1 项真实数据闭环通过。使用合成账号/回合；真实 Session Memory 优先于故意污染的 `sessions.messages_json`；guide 零画像写、伪造技能及错误 owner 拒绝；保存后使用独立 SQL 连接读取 profile / signal；重复确认只有一条 history / signal。追加 reset 后，独立 SQL 验证场次边界及其他 metadata；刷新恢复 stage 0，旧 artifact 被拒绝，新结果只含本场 SQL 学习原文；注入 metadata 整块删除后，持久成功 tool receipt 使阶段恢复与确认均拒绝；两次不同场次确认各产生一条 history / signal。测试清理自身合成数据。
5. SQLite 故障：测试数据库触发器在 profile 写入时删除来源证据，独立读回拒绝成功且没有写 signal。该用例不依赖模拟浏览器 fetch。
6. Reset red/green：先追加 3 项场次回归，旧实现在未持久化边界、旧场事实混入新结果、模型代填 reset 分支均失败；实现后通过。增量还验证 reset 后新回答从 stage 1 开始、旧 reset 重试拒绝、边界缺失/变更/损坏拒绝、面试 checkpoint 不变，以及场次写入触发器删除 metadata 时独立读回失败。
   随后补 metadata 整块删除/旧场回退用例，修复前实际返回 stage 4 并包含旧 React；加入成功 receipt 防护后拒绝。未执行成功的 reset 请求保留原场次，作为对照通过。
7. 当前定位增量相关 ESLint 通过。Worker 场次 selector 接入及最终相关回归由 Runtime 代理核验，统一全量检查由父代理执行。

命令：

```powershell
npx vitest run src/__tests__/server-agent-profile-sop-tool.test.ts src/__tests__/career-positioning-persistence.test.ts src/__tests__/positioning-source-confirmation.test.ts src/__tests__/career-positioning-result.test.ts src/__tests__/agent-tool-governance.test.ts src/__tests__/agent-task-routing.test.ts src/__tests__/worker-tool-exposure.test.ts src/__tests__/agent-production-chain-regressions.eval.test.ts
$env:POSITIONING_POSTGRES_TEST_URL='postgresql://spec40_fixture@127.0.0.1:55440/spec40_positioning'
npx vitest run src/__tests__/positioning-source-confirmation.postgres.test.ts
```

PG 测试默认不执行，仅接受专用本机 fixture 地址；无生产账号、模型 key 或线上数据。

## 尚未关闭的验收

- 自由文本检测及事实抽取仍为保守规则，技能与场景覆盖有限；其他技能会请求补证，不能声称通用事实抽取和真实模型定位质量已经全部通过。
- 本增量没有执行 Browser-Live、真实模型单轮/多轮 rubric 或全部 392 项验收。ISS-050 保持开放。
- reset 场次边界及阶段恢复已通过仓储服务与实际 PG 的确定性验收；复杂混合任务、旧 SOP 草稿恢复和 Browser-Live 交互还需独立覆盖。旧 `_agentPositioningSop` 不再作为业务真源读取。
- signal 使用自然 hash 与顺序读查去重，没有数据库唯一约束；本次验证顺序重复确认，不证明强并发 exactly-once。
- profile 与 signal 分别写入且各自读回，未改成跨实体事务；后半失败不会报告成功，但部分落盘需由 Runtime 的 attempt / reconciliation 处理。
- 普通自动画像抽取链路仍需独立验源验收；本次只删除定位确认后的额外自动抽取入口。
- 最终全量 typecheck、完整 suite、build 与独立双轴 review 由父代理统一执行。增量过程中 typecheck 命中并行修改文件的错误，已向对应代理回报，不将其记为通过。

本增量没有提交或部署；生产发布依照分批修复、验收后发布的既定计划执行。
