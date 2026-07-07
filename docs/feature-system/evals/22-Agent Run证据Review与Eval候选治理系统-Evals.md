# Agent Run证据Review与Eval候选治理系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 Agent Run证据Review与Eval候选治理系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

agent_runs、agent_run_steps、deterministic review、session anomaly、failure taxonomy、eval candidate status 和 promotion draft。

## 项目事实

### 关键实现面
- `src/lib/agent/run-ledger.ts`
- `src/lib/agent/run-review.ts`
- `src/app/api/agent/runs/route.ts`
- `src/app/api/admin/agent-reviews/route.ts`
- `src/app/api/admin/agent-eval-candidates/[id]/route.ts`
- `src/app/api/agent/session-review/route.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/admin-agent-runs.test.ts`
- `src/__tests__/admin-agent-reviews.test.ts`
- `src/__tests__/agent-run-review.test.ts`
- `src/__tests__/agent-run-review-trigger.test.ts`
- `src/__tests__/agent-review-ui.test.ts`
- `src/__tests__/agent-session-review-route.test.ts`
- `src/__tests__/agent-run-ledger-routes.test.ts`

### 从现有测试读到的行为
- agent-run-review.test.ts 已覆盖 failure taxonomy、脱敏、缺 read-back、高风险写入、image intake 跳过、面试多题倾倒、guided task drift 和 promotion draft。
- agent-run-review-trigger.test.ts 已覆盖 terminal run 触发 deterministic review。
- admin-agent-reviews.test.ts 和 agent-review-ui.test.ts 已覆盖后台候选治理视图。

### 待补 eval 缺口
- 补 candidate dedupe_key 冲突更新而非重复插入的 route eval。
- 补 optional LLM judge warning 不降级 deterministic failure 的集成 eval。
- 补 run evidence 与 UI review detail 的对应 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 candidate dedupe_key 冲突更新而非重复插入的 route eval

**为什么要补**: 这是当前 agent run ledger、run review、eval candidates 和 Admin review action 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/admin-agent-runs.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`、`src/__tests__/agent-run-review.test.ts`、`src/__tests__/agent-run-review-trigger.test.ts`、`src/__tests__/agent-review-ui.test.ts`。
- fixture 必须包含：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status。
- 断言必须读取：run/step 记录、review JSON、candidate draft、redaction 和 Admin 403。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 optional LLM judge warning 不降级 deterministic failure 的集成 eval

**为什么要补**: 这是当前 agent run ledger、run review、eval candidates 和 Admin review action 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/admin-agent-runs.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`、`src/__tests__/agent-run-review.test.ts`、`src/__tests__/agent-run-review-trigger.test.ts`、`src/__tests__/agent-review-ui.test.ts`。
- fixture 必须包含：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status。
- 断言必须读取：run/step 记录、review JSON、candidate draft、redaction 和 Admin 403。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 run evidence 与 UI review detail 的对应 eval

**为什么要补**: 这是当前 agent run ledger、run review、eval candidates 和 Admin review action 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/admin-agent-runs.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`、`src/__tests__/agent-run-review.test.ts`、`src/__tests__/agent-run-review-trigger.test.ts`、`src/__tests__/agent-review-ui.test.ts`。
- fixture 必须包含：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status。
- 断言必须读取：run/step 记录、review JSON、candidate draft、redaction 和 Admin 403。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 Agent Run证据Review与Eval候选治理系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. run/step 按 authenticated user 创建

**状态**: 已有自动化覆盖

**项目依据**:
- - `id` - `user_id` - `session_id` - `task_type` - `agent_id` - `status` - `contract_json` - `result_json` - `error_json` - `created_at` - `updated_at` - `recent_steps`
- - `planned` - `running` - `waiting_user` - `verifying` - `repairing` - `succeeded` - `failed` - `rolled_back` - `cancelled`
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“run/step 按 authenticated user 创建”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“run/step 按 authenticated user 创建”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“run/step 按 authenticated user 创建”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-runs.test.ts`: rejects non-admin users
- `src/__tests__/admin-agent-reviews.test.ts`: rejects non-admin users
- `src/__tests__/agent-run-ledger-routes.test.ts`: creates a run for the authenticated user
- `src/__tests__/agent-run-ledger-routes.test.ts`: lists active runs scoped by user and session

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. terminal run 触发 review

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/admin-agent-runs.test.ts`：验证 Admin runs 返回脱敏摘要、统计和失败筛选。 - `src/__tests__/admin-agent-reviews.test.ts`：验证 review summaries、eval candidates 和候选状态更新。 - `src/__tests__...
- # 纸鸢求职助手 Agent Run 证据、Review 与 Eval 候选治理系统的产品构造
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“terminal run 触发 review”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“terminal run 触发 review”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“terminal run 触发 review”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-runs.test.ts`: returns redacted recent run summaries and Chinese monitor stats for admins
- `src/__tests__/admin-agent-reviews.test.ts`: returns review summaries and eval candidates for admins
- `src/__tests__/agent-run-review.test.ts`: creates session anomaly candidates when image intake has no durable run
- `src/__tests__/agent-run-review-trigger.test.ts`: schedules deterministic review when a run reaches terminal status

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. review 生成 failure_types 和 evidence

**状态**: 已有自动化覆盖

**项目依据**:
- `run-review.ts` 会对 evidence 做去重和脱敏，避免同一错误反复堆叠，也避免把敏感原文写进 review。
- 当 review verdict 不是 pass 时，系统可以生成 eval candidate。
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“review 生成 failure_types 和 evidence”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“review 生成 failure_types 和 evidence”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“review 生成 failure_types 和 evidence”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-reviews.test.ts`: returns review summaries and eval candidates for admins
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence
- `src/__tests__/agent-run-review-trigger.test.ts`: schedules deterministic review when a run reaches terminal status
- `src/__tests__/agent-session-review-route.test.ts`: creates eval candidates for image turns without durable run evidence

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. candidate 可 accepted/promoted

**状态**: 已有自动化覆盖

**项目依据**:
- 当 review verdict 不是 pass 时，系统可以生成 eval candidate。
- - `candidate` - `accepted` - `rejected` - `promoted`
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“candidate 可 accepted/promoted”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“candidate 可 accepted/promoted”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“candidate 可 accepted/promoted”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-reviews.test.ts`: updates eval candidate status with admin auth
- `src/__tests__/agent-review-ui.test.ts`: exposes Chinese admin navigation and eval candidate actions

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. review JSON 脱敏

**状态**: 已有自动化覆盖

**项目依据**:
- `run-review.ts` 会对 evidence 做去重和脱敏，避免同一错误反复堆叠，也避免把敏感原文写进 review。
- - `src/__tests__/admin-agent-runs.test.ts`：验证 Admin runs 返回脱敏摘要、统计和失败筛选。 - `src/__tests__/admin-agent-reviews.test.ts`：验证 review summaries、eval candidates 和候选状态更新。 - `src/__tests__...
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“review JSON 脱敏”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“review JSON 脱敏”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“review JSON 脱敏”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-reviews.test.ts`: returns review summaries and eval candidates for admins
- `src/__tests__/agent-run-review.test.ts`: sanitizes eval/review JSON before admin exposure
- `src/__tests__/agent-run-review-trigger.test.ts`: schedules deterministic review when a run reaches terminal status

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. 没有 durable run 的 session anomaly 也进候选

**状态**: 已有自动化覆盖

**项目依据**:
- # 纸鸢求职助手 Agent Run 证据、Review 与 Eval 候选治理系统的产品构造
- 纸鸢求职助手的 Agent Run 监控和 Agent Review，不应该拆成两个系统。真实产品链路是：每次 Agent 执行都会留下运行记录和步骤证据；管理员可以在后台查看最近运行、失败运行和步骤摘要；Review 会把运行证据转成 pass/warning/fail、失败类型、修复建议和 Eval 候选；Eval 候选再进入接受、拒绝或提升流程。
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“没有 durable run 的 session anomaly 也进候选”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“没有 durable run 的 session anomaly 也进候选”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“没有 durable run 的 session anomaly 也进候选”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: creates session anomaly candidates when image intake has no durable run
- `src/__tests__/agent-run-review.test.ts`: creates session anomaly candidates for failed tools without runs and false success messages
- `src/__tests__/agent-run-review.test.ts`: creates session anomaly candidates for guided task drift
- `src/__tests__/agent-session-review-route.test.ts`: creates eval candidates for image turns without durable run evidence

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. promoted 只生成草稿不写文件

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 文档必须写清：`promoted` 当前是生成草案和生命周期提示，不等于已经自动写入测试文件。
- - `candidate` - `accepted` - `rejected` - `promoted`
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“promoted 只生成草稿不写文件”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“promoted 只生成草稿不写文件”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“promoted 只生成草稿不写文件”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-runs.test.ts`: returns redacted recent run summaries and Chinese monitor stats for admins
- `src/__tests__/admin-agent-runs.test.ts`: keeps the failure filter available for investigation
- `src/__tests__/admin-agent-runs.test.ts`: rejects non-admin users

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. member 请求 Admin review 403

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/admin-agent-runs.test.ts`：验证 Admin runs 返回脱敏摘要、统计和失败筛选。 - `src/__tests__/admin-agent-reviews.test.ts`：验证 review summaries、eval candidates 和候选状态更新。 - `src/__tests__...
- # 纸鸢求职助手 Agent Run 证据、Review 与 Eval 候选治理系统的产品构造
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“member 请求 Admin review 403”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“member 请求 Admin review 403”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“member 请求 Admin review 403”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-runs.test.ts`: returns redacted recent run summaries and Chinese monitor stats for admins
- `src/__tests__/admin-agent-runs.test.ts`: rejects non-admin users
- `src/__tests__/admin-agent-reviews.test.ts`: returns review summaries and eval candidates for admins
- `src/__tests__/admin-agent-reviews.test.ts`: rejects non-admin users

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 高风险写入缺 read-back 未标 missing_readback

**状态**: 已有自动化覆盖

**项目依据**:
- - 工具是否被调用。 - 工具输入输出是什么摘要。 - 是否有 read-back。 - 任务契约是否满足。 - 错误发生在路由、工具、写入、图片、输出还是系统层。 - 是否有用户隐私泄露风险。
- - `missing_readback` 说明写入或导出缺少读回证据。 - `image_intake_failure` 说明图片没有先走 intake/classification/OCR。 - `tool_failed_but_message_success` 说明工具失败但助手说成功。 - `routing_error` 说明任务路由错。
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“高风险写入缺 read-back 未标 missing_readback”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“高风险写入缺 read-back 未标 missing_readback”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“高风险写入缺 read-back 未标 missing_readback”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence
- `src/__tests__/agent-run-ledger-routes.test.ts`: updates a run only after ownership read-back
- `src/__tests__/agent-run-ledger-routes.test.ts`: appends a step only after ownership read-back

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. 图片任务跳过 image intake

**状态**: 已有自动化覆盖

**项目依据**:
- - `missing_readback` 说明写入或导出缺少读回证据。 - `image_intake_failure` 说明图片没有先走 intake/classification/OCR。 - `tool_failed_but_message_success` 说明工具失败但助手说成功。 - `routing_error` 说明任务路由错。
- - 路由错误：检查 task routing 和 clarification gates。 - 工具契约不匹配：对齐 tool governance、task contract 和 allowed tools。 - 缺少 read-back：要求写入、导出、Admin 工具声明成功前必须有验证证据。 - 图片失败：先走 image intake、分类和 OC...
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“图片任务跳过 image intake”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“图片任务跳过 image intake”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“图片任务跳过 image intake”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags image business tasks that skip image intake
- `src/__tests__/agent-run-review.test.ts`: does not count business output text as an image intake step
- `src/__tests__/agent-run-review.test.ts`: passes image tasks when a real image-intake step is recorded

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. unknown failure label 未归 system_error

**状态**: 已有自动化覆盖

**项目依据**:
- - `routing_error` - `tool_contract_mismatch` - `missing_run` - `tool_failed_but_message_success` - `tool_succeeded_but_message_failure` - `missing_readback` - `partial_write` - `im...
- `repair-planner.ts` 根据 failure type 生成修复方向。
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“unknown failure label 未归 system_error”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“unknown failure label 未归 system_error”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“unknown failure label 未归 system_error”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-agent-runs.test.ts`: keeps the failure filter available for investigation
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: covers the deterministic failure taxonomy with synthetic runs

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 工具失败但 assistant 说成功

**状态**: 已有自动化覆盖

**项目依据**:
- - `missing_readback` 说明写入或导出缺少读回证据。 - `image_intake_failure` 说明图片没有先走 intake/classification/OCR。 - `tool_failed_but_message_success` 说明工具失败但助手说成功。 - `routing_error` 说明任务路由错。
- - 没有调用工具却声称完成。 - 工具失败了但助手说成功。 - 工具成功了但最后给用户错误提示。 - 写入了部分数据但没有读回验证。 - 图片识别失败却继续评估。 - 输出里泄露邮箱、手机号或 base64 图片。 - 同一类失败反复出现，却没有进入 eval。
- 主要实现面：`src/lib/agent/run-ledger.ts`、`src/lib/agent/run-review.ts`、`src/app/api/agent/runs/route.ts`、`src/app/api/admin/agent-reviews/route.ts`。

**输入/fixture**:
- 正例：authenticated user 的 run/step、terminal run review 和 candidate action，用来验证“工具失败但 assistant 说成功”的成功路径。
- 反例：无 durable run anomaly、敏感字段、member 请求、工具失败但 assistant 说成功，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：runId、stepId、reviewId、candidateId、failure_types、evidence 和 action status；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 agent run ledger、run review、eval candidates 和 Admin review action 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“工具失败但 assistant 说成功”对应动作，并记录请求、工具调用或页面状态。
3. 读取 run/step 记录、review JSON、candidate draft、redaction 和 Admin 403，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“工具失败但 assistant 说成功”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent Run证据Review与Eval候选治理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence
- `src/__tests__/agent-run-review.test.ts`: creates session anomaly candidates for failed tools without runs and false success messages

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/admin-agent-runs.test.ts`
  - returns redacted recent run summaries and Chinese monitor stats for admins
  - keeps the failure filter available for investigation
  - rejects non-admin users
- `src/__tests__/admin-agent-reviews.test.ts`
  - returns review summaries and eval candidates for admins
  - rejects non-admin users
  - updates eval candidate status with admin auth
  - returns promotion lifecycle draft for eval candidates
- `src/__tests__/agent-run-review.test.ts`
  - normalizes unknown failure labels to system_error
  - redacts private text, image payloads, and secrets
  - flags successful high-risk write tools without read-back evidence
  - flags image business tasks that skip image intake
  - does not count business output text as an image intake step
  - passes image tasks when a real image-intake step is recorded
  - flags resume markdown control pollution
  - flags interview multi-question dumps and context rebinding loss
  - ...
- `src/__tests__/agent-run-review-trigger.test.ts`
  - schedules deterministic review when a run reaches terminal status
- `src/__tests__/agent-review-ui.test.ts`
  - exposes Chinese admin navigation and eval candidate actions
- `src/__tests__/agent-session-review-route.test.ts`
  - creates eval candidates for image turns without durable run evidence
  - returns disabled when durable run ledger is unavailable
- `src/__tests__/agent-run-ledger-routes.test.ts`
  - creates a run for the authenticated user
  - lists active runs scoped by user and session
  - updates a run only after ownership read-back
  - appends a step only after ownership read-back
  - cancels an active run through the owner-scoped route


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- Agent Run证据Review与Eval候选治理系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
