# Spec 40 第三批：面试外部验收

本切片使用 e2e runner、真实 Chromium、真实鉴权与 CSRF HTTP API、生产 Worker bundle、独立本机 PostgreSQL。应用 source staging 与 .next、fixture、端口、数据库均独立于主仓库和其他代理；只包含合成账号与合成材料。

当前状态：本切片已冻结。最新生产 Worker 的 keyless 三条外部回归全部通过，真实模型 ISS-001 主线与原文评分证据完整闭环通过，证据防覆盖护栏通过。仍不构成 P0 全量关闭、完整 392 项验收或生产发布证据。

## 范围与 Oracle

- 启动 → 当前题 → 真实用户答案 → 下一题 → 暂停 → 刷新 → 恢复：以服务端原题 ID、答案原文、状态、checkpoint、Worker 输出与独立数据库读回对账。
- “只问问题”：控制指令不计答案；后续回答与恢复只输出当前一道题。
- 换绑负向：新材料提议先暂停，未验证/错误 token 不能改变原材料、回答或归档；合法 CV 哈希与源数据再验证单列。
- 归属与版本保护：跨账号读取/输入拒绝，browser 伪造 checkpoint 拒绝，同 request ID 重放不重复输入或推进。真实并发 CAS 的外部闭环尚未补齐；不得将幂等重放或 browser 拒绝写入计为并发 CAS 验收通过。
- 禁止副作用：控制指令及只读练习不创建 Offer/CV/profile/活跃记忆；面试领域状态由引擎维护，对话由 Worker 写入。

## 模型与隔离环境

已获授权复用服务器模型配置，仅复制模型字段至私有 `.private/spec40/server-model.env`。应用与 Worker 强制覆盖独立 PostgreSQL、随机 JWT、合成账号和专用数据目录；不复用生产数据库或生产账号。配置不进入仓库、报告或终端输出。

`keyless` 模式清空模型 Key，验收真实 fallback 出题与诚实 unscored 持久链路；`real` 模式单独验收真实模型出题、评分和原文证据 rubric。两类结果独立保存，fallback 通过不代表真实模型验收通过。首次真实模型失败捕获引用门禁遗漏，修复后 `frozen-real17` 真正评分及控制主线通过，严格评分断言不允许 unscored 替代。

## 执行记录与首次失败

| Evidence ID | 结果 | 定性与后续处理 |
| --- | --- | --- |
| `20261014-interview-launch2` | 3 failed | 测试在 AuthGate 完成前调用 API；保留报告，增加首页就绪等待。 |
| `20261014-interview-ready3` | interrupted | staging 漏复制 `lib/scan/orchestrator.mjs`；修正复制范围后重新执行。 |
| `20261014-interview-staging4` | 3 failed | 测试重复获取 CSRF 导致 cookie 与生产 fetch 缓存 token 不一致；改用生产浏览器 fetch 的 CSRF 链路。 |
| `20261014-interview-csrf5` | 3 failed | 测试轮询误读 Run response；独立 PG 读回确认另有 prepared 启动污染的 P0 产品缺陷。原始证据完整保留。 |
| `20261014-interview-prepared-fix6` | 3 failed | prepared 启动、答案绑定、诚实降级和暂停通过中间断言；刷新后就绪等待遗漏，以及两项产品控制语义失败。 |
| `20261014-interview-refresh-fix7` | 1 failed | 启动、原题答案绑定、暂停、页面刷新、恢复状态全部通过；末尾独立 oracle 只读旧 `sessions.messages_json`，已核实实际 Worker 历史在 `session_memory.execution_conversation`。修正读回正式持久表，不改原文断言。 |
| `20261014-interview-control-fix8` | 2 passed / 1 failed | 原文绑定完整闭环和只问问题持久化通过。缺失 CV 已正确暂停并创建待核验状态，helper 原来统一要求 `succeeded` 与 review 的 `waiting_user` 语义不符；负向分支改为精确要求 `waiting_user`，其他分支继续要求 `succeeded`。 |
| `20261014-interview-review-status9` | 1 passed | 缺失 CV、错误及不可执行确认、跨账号读取/输入、六表禁止副作用全部通过。 |
| `20261014-interview-real-provider10` | 1 failed | 请求 real 模式，但 e2e runner 的启动进程环境采用 allowlist，未传自定义 mode，应用实际 keyless。score 严格断言及时发现；此轮不计真实模型证据。command 显式传 mode，并增加运行态模式、Key 是否配置和 Worker hash 的独立匹配。 |
| `20261014-interview-real-explicit11` | 1 failed | 运行态已核验 real/Key configured/Worker hash。真实问题生成及回答评分完成，但模型评论混入 rubric evidence 并被生产保存，逐字原文断言失败。保留此轮独立 PG、trace 与私有应用日志。 |
| `20261014-interview-keyless-final12` | 3 passed | 同轮全部主用例通过；运行态 keyless/hash、独立会话历史读回核验。此结果不计真实模型评分通过。随后新增格式有效但值错误的确认 token、保留原材料恢复与 Run 跨账号读取分支，需新一轮证据。 |
| `20261014-interview-negative-complete13` | 3 passed | 新增负向分支同轮全部通过，账号隔离与六表零副作用保存独立 oracle。 |
| `20261014-interview-rubric-fix14` | 1 failed | 真实四维档位、原文引用全部通过；测试误把 durable 兼容 score 当成 /5。Spec 30 WP2 E4 明确该字段为 /10，改为精确 `2*(1+overallBand)`，不改原文引用断言或生产兼容契约。 |
| `20261014-interview-real-final15` | 1 failed | 真实模型重评后仍四维引用无效，生产安全降级为 unscored，严格真实评分断言失败。此轮使用在总重试上限/材料命令边界最新补丁前的 staging，不计最终真实评分通过。 |
| `20261014-interview-frozen-keyless16` | 3 passed | 最新冻结生产源码重新 staging；完整 keyless 三条、main 与 rebind 六表副作用、精确绑定、运行模式与 hash 全通过。18.60s。 |
| `20261014-interview-frozen-real17` | 1 passed | 同冻结 Worker hash，真实 DeepSeek 出题、四维真实评分、逐字原文引用、原题绑定、暂停、页面刷新、恢复、独立持久对账、main 六表副作用全部通过。83.16s。 |
| `20261014-interview-evidence-guard18` | 3 passed | 添加首失败证据独占保护后的 keyless 全三条通过，含 runner/child config 多进程重载兼容；17.63s。不改生产行为，保留17的真实模型证据。 |
| `20261014-interview-third-final-keyless19` | 3 passed | 第三批交接 Worker 最终冻结后重新 staging；完整 keyless 三条、原题绑定、恢复、负向确认、归属及禁止副作用全部通过。26.81s。 |
| `20261014-interview-third-final-real20` | 1 passed | 同19冻结 Worker，真实 DeepSeek 出题、四维整数评分及连续答案原文证据、暂停/刷新/恢复、独立持久读回与零禁止副作用通过。54.44s。 |

最终冻结证据：keyless 为 `third-final-keyless19`，真实模型为 `third-final-real20`，二者 Worker SHA-256 均为 `82ecc47953ddd49e458ba34b9457c91d96cb41982fa7a90c1eff512e63e47406`。结果目录 `.e2e/spec40-third-interview/<Evidence ID>/`，独立 PostgreSQL oracle 位于 `.e2e/spec40-third-interview/oracles/<Evidence ID>/`。应用日志分别保存于 `.private/spec40/interview/<Evidence ID>.log`。17/18的旧 Worker SHA-256 为 `0b494287984636f954be510ec1828cb99be2628480ac78d3a36b93c17bd252c5`，旧结果继续保留，未覆盖。

首次 prepared 污染证据位于 `.e2e/spec40-third-interview/20261014-interview-csrf5/oracles/prepared-first-worker-failure.json`：引擎启动前 `transcript` 已包含“开始模拟面试”，`questionGraph` 为空，Run 为 `waiting_user`。生产修复停止从会话消息推断 prepared/durable/legacy 的面试领域状态；仅引擎写领域状态，Worker 写对话。

`prepared-fix6` 的独立 PG 证据位于 `.e2e/spec40-third-interview/oracles/20261014-interview-prepared-fix6/`，运行报告与 trace 位于 `.e2e/spec40-third-interview/20261014-interview-prepared-fix6/`。产品失败如下：

1. **只问问题指令被计作答案**：输入“只问问题，不要解释”，`responseStyle` 未设为 `question_only`，`answers[0]` 存入该指令，阶段 intro → tech，实际输出含“反馈：回答已保存”。该控制应保留当前题且不得评分或新增答案。
2. **缺失 CV 的正式重启被降级为补充材料**：输入“用CV-v999从头面试”，引擎保持 `active` 且 `lastTurnResult.action=material_context`，输出要求继续回答当前题，未生成 `pendingMaterialChange`。正式换绑意图应先暂停并创建待确认状态；材料不存在时禁止换绑。
3. **真实 rubric 的 evidence 混入评论且未 veto**：`real-explicit11` 中 `highlight` evidence 为 `「最后把人工整理从5小时降到2小时」——唯一数字还是题干与简历中已给出的，候选人未补充独到判断、取舍理由或主动反思`，整串不是答案原文。现行 `findMissingEvidence` 仅判断长度，不核验回答原文包含。必须区分证据和评论，运行时逐字校验，失败重评后仍无有效原文引用应 unscored；禁止保存貌似有引用的分数。

刷新失败属于测试就绪问题，已增加 `/agent` 输入框渲染等待，不绕过 AuthGate。上述产品问题已由生产实现负责人修复；格式组合指令、明确但无法核验的换绑命令、真实原文引用均进入回归，测试保留原句和原断言，不收窄指令来获取通过。

每次 staging 新建随机合成账号，保留前次数据库证据，避免历史合成会话记忆进入新一轮绑定。独立 oracle 同时保留原始 `sessions.messages_json` 与 PostgreSQL 正式会话 `session_memory.execution_conversation`，并对照用户 HTTP 投影的角色、内容。

模型 rubric 外部断言要求四维 `structure/specificity/highlight/timing` 完整、每档为 0–4 整数、每个引用至少两字且完整包含于本次答案，durable 兼容字段 `score=2*(1+overallBand)`（Spec 30 WP2 E4），界面以 0–4 档位为主。目前只验证单答案评分事实完整性；不能声称全模型质量 rubric 或全部多轮功能完成。

最新静态核验：四个新增测试/配置/脚本的定向 ESLint 通过；全局 `npx tsc --noEmit` 在其他代理修复临时类型错误后通过。

## 首失败证据保护

所有入口必须显式设置同一个 `SPEC40_INTERVIEW_EVIDENCE_ID`，不再分别用 `Date.now()`。config 在 runner 启动/清空 results 之前，使用 `wx` 原子独占预留 ID；同 runner 与直接 child 可重载，其他运行重用 ID 一律拒绝，旧版已有目录也拒绝覆盖。oracle 使用不可变写入：同内容重载无修改，不同内容写入失败。

`src/__tests__/spec40-interview-evidence.test.ts` 四条回归通过，包含独立子进程重用 ID 必须在 startup marker 前退出，并保留旧 report/oracle 原始字节。另直接调用实际 e2e CLI 重用 `frozen-real17`：exit 2、应用未启动，旧结果和 oracle 共 11 个文件的前后 SHA-256 全部相等。证据文件 `.e2e/spec40-third-interview/evidence-guard-verification-20261014.json`。

## 未覆盖边界

- 真实并发 CAS 在本外部切片仍为 partial；已有直接 PostgreSQL 接缝测试不能替代浏览器/Worker 外部并发证据。
- 正向 JD/CV 换绑、材料内容变更后重新确认及完整归档恢复外部闭环仍待后续切片，本次只证明缺失材料与错误确认不能更改绑定。
- 多轮追问、跳题、结束与复盘、语音/设备矩阵及模型批量质量校准不在本次三个外部用例内；真实单答案通过不能替代这些分支。
- 历史数据只保留原始证据，本切片不迁移或处理真实用户数据。

## 复现命令

数据库仅允许 `127.0.0.1:55440/spec40_interview_external`，先配置 `SPEC40_INTERVIEW_EXTERNAL_DATABASE_URL`，不把凭据写入文档。

```powershell
node scripts/seed-spec40-interview-fixture.mjs
$env:SPEC40_INTERVIEW_MODEL_MODE = 'keyless'
$env:SPEC40_INTERVIEW_EVIDENCE_ID = 'unique-keyless-evidence-id'
npx e2e run --config e2e.spec40-interview.config.ts
$env:SPEC40_INTERVIEW_MODEL_MODE = 'real'
$env:SPEC40_INTERVIEW_EVIDENCE_ID = 'unique-real-model-evidence-id'
npx e2e run --config e2e.spec40-interview.config.ts --grep ISS-001
```

两个 Evidence ID 必须从未使用；重跑必须换新 ID。模型 Key 从私有配置读取，命令和报告不包含 Key。

运行证据保存于 `.e2e/spec40-third-interview`；私有运行日志、凭据与 staging 位于 `.private/spec40/interview`。失败首次结果与后续结果分别记录，不覆盖首次失败。
