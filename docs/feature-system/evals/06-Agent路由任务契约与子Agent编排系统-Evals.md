# Agent路由任务契约与子Agent编排系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 Agent路由任务契约与子Agent编排系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

任务意图识别、task contract、allowedTools、activeTask 锁定、server runner、run/step ledger 和 review trigger。

## 项目事实

### 关键实现面
- `src/lib/agent/task-routing.ts`
- `src/lib/agent/task-contract.ts`
- `src/lib/agent/orchestrator/index.ts`
- `src/lib/agent/loop/server-runner.ts`
- `src/lib/agent/run-ledger.ts`
- `src/lib/agent/registry/index.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/agent-task-routing.test.ts`
- `src/__tests__/agent-runtime-adapter.test.ts`
- `src/__tests__/interview-agent-prompt.test.ts`
- `src/__tests__/agent-run-ledger-routes.test.ts`
- `src/__tests__/agent-run-review-trigger.test.ts`
- `src/__tests__/job-discovery-agent-evals.test.ts`

### 从现有测试读到的行为
- agent-task-routing.test.ts 已覆盖 job_search、JD/Offer 图片路由、self-positioning、resume_query、active task 切换和 symbol-only 澄清。
- agent-run-ledger-routes.test.ts 已覆盖 run/step API 的 ledger 基础行为。
- job-discovery-agent-evals.test.ts 已把岗位发现 Agent 化的 B/E/R 场景落到真实路由与工具契约。

### 待补 eval 缺口
- 补 orchestrator 子 Agent handoff 的集成 eval。
- 补 route conflicts 的 snapshot。
- 补 server-runner 工具参数校验失败的 recovery eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 orchestrator 子 Agent handoff 的集成 eval

**为什么要补**: 这是当前 task-routing、task-contract、agent run/step ledger 和 deterministic review 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-task-routing.test.ts`、`src/__tests__/agent-runtime-adapter.test.ts`、`src/__tests__/interview-agent-prompt.test.ts`、`src/__tests__/agent-run-ledger-routes.test.ts`、`src/__tests__/agent-run-review-trigger.test.ts`。
- fixture 必须包含：taskType、contract policy、allowedTools、memoryTask、run status 和 review id。
- 断言必须读取：task contract、run ledger、step evidence 和 review failure_types。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 route conflicts 的 snapshot

**为什么要补**: 这是当前 task-routing、task-contract、agent run/step ledger 和 deterministic review 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-task-routing.test.ts`、`src/__tests__/agent-runtime-adapter.test.ts`、`src/__tests__/interview-agent-prompt.test.ts`、`src/__tests__/agent-run-ledger-routes.test.ts`、`src/__tests__/agent-run-review-trigger.test.ts`。
- fixture 必须包含：taskType、contract policy、allowedTools、memoryTask、run status 和 review id。
- 断言必须读取：task contract、run ledger、step evidence 和 review failure_types。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 server-runner 工具参数校验失败的 recovery eval

**为什么要补**: 这是当前 task-routing、task-contract、agent run/step ledger 和 deterministic review 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-task-routing.test.ts`、`src/__tests__/agent-runtime-adapter.test.ts`、`src/__tests__/interview-agent-prompt.test.ts`、`src/__tests__/agent-run-ledger-routes.test.ts`、`src/__tests__/agent-run-review-trigger.test.ts`。
- fixture 必须包含：taskType、contract policy、allowedTools、memoryTask、run status 和 review id。
- 断言必须读取：task contract、run ledger、step evidence 和 review failure_types。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 Agent路由任务契约与子Agent编排系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. JD/Offer/Resume/Profile/Interview 进入正确 taskType

**状态**: 已有自动化覆盖

**项目依据**:
- - 评估 JD。 - 查看当前简历。 - 修改简历。 - 保存优秀简历。 - 更新求职画像。 - 做职业定位。 - 生成面试题。 - 评估 Offer。 - 对比多个 Offer。 - 导出文件。
- - `src/__tests__/agent-task-routing.test.ts`：验证画像、简历、JD 图片、Offer 图片、面试、任务切换等路由边界。 - `src/__tests__/agent-runtime-adapter.test.ts`：验证当前 runtime resume 边界和 cancel 行为。 - `src/__tests_...
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“JD/Offer/Resume/Profile/Interview 进入正确 taskType”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD/Offer/Resume/Profile/Interview 进入正确 taskType”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD/Offer/Resume/Profile/Interview 进入正确 taskType”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: does not route self-positioning guidance into profile write contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps explicit profile write intents under verified profile update contracts
- `src/__tests__/agent-task-routing.test.ts`: routes current-resume read questions to a read-only resume query contract
- `src/__tests__/agent-task-routing.test.ts`: keeps explicit resume edits under verified write contracts

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. task contract 生成 policy、memoryTask 和 allowedTools

**状态**: 已有自动化覆盖

**项目依据**:
- - `taskType` - `taskId` - `baseSnapshot` - `requiresUserApproval` - `successCriteria` - `validators` - `routeLocked` - `allowedTools`
- 纸鸢求职助手的 Agent 系统不是“一个大模型回答所有问题”。它把用户意图、图片类型、当前任务状态、Agent registry、工具白名单、任务契约、读回验证和运行循环组合起来，让不同求职任务进入不同的 Agent 和不同的工具边界。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“task contract 生成 policy、memoryTask 和 allowedTools”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“task contract 生成 policy、memoryTask 和 allowedTools”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“task contract 生成 policy、memoryTask 和 allowedTools”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: routes clear job discovery requests to job_search with governed tools
- `src/__tests__/agent-task-routing.test.ts`: routes self-positioning to guidance contract with guide/read tools only
- `src/__tests__/job-discovery-agent-evals.test.ts`: E8 tool governance blocks unconfirmed scan writes

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. run 与 step 按 owner 创建和更新

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- - 评估 JD。 - 查看当前简历。 - 修改简历。 - 保存优秀简历。 - 更新求职画像。 - 做职业定位。 - 生成面试题。 - 评估 Offer。 - 对比多个 Offer。 - 导出文件。
- 第一，模型可能把只读问题当成写入任务。例如用户问“我现在的简历是什么”，系统应该读取简历，而不是创建简历修改提案。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“run 与 step 按 owner 创建和更新”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“run 与 step 按 owner 创建和更新”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“run 与 step 按 owner 创建和更新”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: does not route self-positioning guidance into profile write contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps explicit profile write intents under verified profile update contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps other durable task routing intact

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. terminal run 触发 deterministic review

**状态**: 已有自动化覆盖

**项目依据**:
- 这解释了为什么图片识别不只是 OCR。识别完还要判断“这张图要触发什么业务任务”。
- `agent-runtime-adapter.test.ts` 验证了一个现实边界：当前 orchestrator runtime adapter 对 durable run 的 resume 返回明确错误，说明“durable runs cannot resume yet”。取消未知 run id 可以不抛错。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“terminal run 触发 deterministic review”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“terminal run 触发 deterministic review”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“terminal run 触发 deterministic review”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-runtime-adapter.test.ts`: allows cancelling an unknown run id without throwing
- `src/__tests__/agent-run-ledger-routes.test.ts`: creates a run for the authenticated user
- `src/__tests__/agent-run-ledger-routes.test.ts`: updates a run only after ownership read-back
- `src/__tests__/agent-run-ledger-routes.test.ts`: cancels an active run through the owner-scoped route

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. requiresClarification 时禁止写入工具

**状态**: 已有自动化覆盖

**项目依据**:
- 第三，模型可能在工具失败后仍说“已完成”。文件导出、报告保存、简历写入都必须有读回证据。
- 纸鸢求职助手的 Agent 系统不是“一个大模型回答所有问题”。它把用户意图、图片类型、当前任务状态、Agent registry、工具白名单、任务契约、读回验证和运行循环组合起来，让不同求职任务进入不同的 Agent 和不同的工具边界。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“requiresClarification 时禁止写入工具”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“requiresClarification 时禁止写入工具”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“requiresClarification 时禁止写入工具”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: routes clear job discovery requests to job_search with governed tools
- `src/__tests__/agent-task-routing.test.ts`: routes self-positioning to guidance contract with guide/read tools only
- `src/__tests__/job-discovery-agent-evals.test.ts`: E8 tool governance blocks unconfirmed scan writes

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. active self-positioning 短回答不切任务

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手的 Agent 系统不是“一个大模型回答所有问题”。它把用户意图、图片类型、当前任务状态、Agent registry、工具白名单、任务契约、读回验证和运行循环组合起来，让不同求职任务进入不同的 Agent 和不同的工具边界。
- - `src/__tests__/agent-task-routing.test.ts`：验证画像、简历、JD 图片、Offer 图片、面试、任务切换等路由边界。 - `src/__tests__/agent-runtime-adapter.test.ts`：验证当前 runtime resume 边界和 cancel 行为。 - `src/__tests_...
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“active self-positioning 短回答不切任务”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“active self-positioning 短回答不切任务”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“active self-positioning 短回答不切任务”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: keeps short follow-up answers inside active self-positioning
- `src/__tests__/agent-task-routing.test.ts`: asks confirmation before switching away from active self-positioning

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. resume_query 保持 read-only

**状态**: 已有自动化覆盖

**项目依据**:
- 这些任务的风险完全不同。查看简历是只读，修改简历是高风险写入；问 Offer 谈判策略应读取已有报告，首次评估 Offer 才应保存新报告；面试准备要保持当前 JD 和简历快照。
- - JD 图片进入 `jd_evaluation`，允许 `evaluate_jd_full`。 - Offer 图片进入 `offer_evaluation`，允许 `evaluate_offer`。 - 简历截图如果没有编辑意图，进入 `resume_query`，不允许 `evaluate_jd_full` 或 `evaluate_offer`。 - ...
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“resume_query 保持 read-only”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“resume_query 保持 read-only”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“resume_query 保持 read-only”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: routes current-resume read questions to a read-only resume query contract
- `src/__tests__/agent-task-routing.test.ts`: keeps explicit resume edits under verified write contracts
- `src/__tests__/agent-task-routing.test.ts`: routes resume screenshots to read-only resume handling instead of JD or Offer evaluation when no edit is requested
- `src/__tests__/agent-task-routing.test.ts`: asks confirmation before switching from active guidance to resume query

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. unknown/conflicting task fail closed

**状态**: 已有自动化覆盖

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“unknown/conflicting task fail closed”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“unknown/conflicting task fail closed”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“unknown/conflicting task fail closed”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: keeps other durable task routing intact
- `src/__tests__/agent-task-routing.test.ts`: routes confirmed switches to the requested task

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 自我定位被路由成 profile_update

**状态**: 已有自动化覆盖

**项目依据**:
- `agent-task-routing.test.ts` 里多处验证这些边界，尤其是防止画像指导、简历只读和 Offer 工具互相串线。
- - `src/__tests__/agent-task-routing.test.ts`：验证画像、简历、JD 图片、Offer 图片、面试、任务切换等路由边界。 - `src/__tests__/agent-runtime-adapter.test.ts`：验证当前 runtime resume 边界和 cancel 行为。 - `src/__tests_...
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“自我定位被路由成 profile_update”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“自我定位被路由成 profile_update”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“自我定位被路由成 profile_update”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: does not route self-positioning guidance into profile write contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps explicit profile write intents under verified profile update contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps other durable task routing intact
- `src/__tests__/agent-task-routing.test.ts`: routes short evaluate replies from JD image clarification into JD evaluation instead of the stale profile lock

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. 图片澄清后评估无法进入 JD evaluation

**状态**: 已有自动化覆盖

**项目依据**:
- - JD 图片进入 `jd_evaluation`，允许 `evaluate_jd_full`。 - Offer 图片进入 `offer_evaluation`，允许 `evaluate_offer`。 - 简历截图如果没有编辑意图，进入 `resume_query`，不允许 `evaluate_jd_full` 或 `evaluate_offer`。 - ...
- 第二，模型可能把截图路由错。JD 截图应该进入 JD 评估，Offer 截图应该进入 Offer 评估，简历截图如果没有编辑意图应走简历只读处理。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“图片澄清后评估无法进入 JD evaluation”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“图片澄清后评估无法进入 JD evaluation”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“图片澄清后评估无法进入 JD evaluation”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: does not confuse JD evaluation with job discovery
- `src/__tests__/agent-task-routing.test.ts`: routes matching JD image requests into JD evaluation
- `src/__tests__/agent-task-routing.test.ts`: asks clarification when JD text conflicts with an Offer image
- `src/__tests__/agent-task-routing.test.ts`: routes matching Offer image requests into Offer evaluation

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. 下一题掉到 general_chat

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“下一题掉到 general_chat”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“下一题掉到 general_chat”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“下一题掉到 general_chat”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: does not route self-positioning guidance into profile write contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps explicit profile write intents under verified profile update contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps other durable task routing intact

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. route conflict audit 漏掉高优先级冲突

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`src/lib/agent/task-routing.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/orchestrator/index.ts`、`src/lib/agent/loop/server-runner.ts`。

**输入/fixture**:
- 正例：JD/Offer/Resume/Profile/Interview 明确意图和一个 terminal run，用来验证“route conflict audit 漏掉高优先级冲突”的成功路径。
- 反例：requiresClarification、active self-positioning、resume_query、unknown/conflicting task，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：taskType、contract policy、allowedTools、memoryTask、run status 和 review id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 task-routing、task-contract、agent run/step ledger 和 deterministic review 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“route conflict audit 漏掉高优先级冲突”对应动作，并记录请求、工具调用或页面状态。
3. 读取 task contract、run ledger、step evidence 和 review failure_types，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“route conflict audit 漏掉高优先级冲突”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent路由任务契约与子Agent编排系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: does not route self-positioning guidance into profile write contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps explicit profile write intents under verified profile update contracts
- `src/__tests__/agent-task-routing.test.ts`: keeps other durable task routing intact

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

- `src/__tests__/agent-task-routing.test.ts`
  - does not route self-positioning guidance into profile write contracts
  - keeps explicit profile write intents under verified profile update contracts
  - keeps other durable task routing intact
  - routes clear job discovery requests to job_search with governed tools
  - asks one clarification for vague job discovery requests
  - does not confuse JD evaluation with job discovery
  - routes change-batch requests to job_search without creating a vague new scan route
  - routes current-resume read questions to a read-only resume query contract
  - ...
- `src/__tests__/agent-runtime-adapter.test.ts`
  - exposes an explicit non-resume state for the current orchestrator
  - allows cancelling an unknown run id without throwing
- `src/__tests__/interview-agent-prompt.test.ts`
  - treats active interview session state as the source of truth
- `src/__tests__/agent-run-ledger-routes.test.ts`
  - creates a run for the authenticated user
  - lists active runs scoped by user and session
  - updates a run only after ownership read-back
  - appends a step only after ownership read-back
  - cancels an active run through the owner-scoped route
- `src/__tests__/agent-run-review-trigger.test.ts`
  - schedules deterministic review when a run reaches terminal status
- `src/__tests__/job-discovery-agent-evals.test.ts`
  - B1 enters job discovery confirmation for clear requests
  - B2 confirmation creates real scan_queue and returns read-back scanId
  - B3 run card shows scan progress and issue summary affordance
  - B4 discovered jobs render as up to five result cards
  - B5 opening JD reuses the existing scan job JD fetch route
  - B6 evaluation saves or reuses JD and enters existing Agent evaluation flow
  - E1 vague requests do not silently create scans
  - E2 profile prefill is visible in the confirmation card
  - ...


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- Agent路由任务契约与子Agent编排系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
