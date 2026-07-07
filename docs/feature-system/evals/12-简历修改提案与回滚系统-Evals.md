# 简历修改提案与回滚系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 简历修改提案与回滚系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

resume edit proposal 创建、应用、废弃、回滚、base hash、legacy save 兼容和伪成功清洗。

## 项目事实

### 关键实现面
- `src/lib/agent/resume-edit-proposals.ts`
- `src/lib/agent/resume-save-guard.ts`
- `src/app/api/cv/edit-proposals/route.ts`
- `src/app/api/cv/edit-proposals/[id]/apply/route.ts`
- `src/app/api/cv/edit-proposals/[id]/discard/route.ts`
- `src/app/api/cv/edit-proposals/[id]/rollback/route.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/resume-save-guard.test.ts`
- `src/__tests__/resume-edit-proposals-route.test.ts`
- `src/__tests__/agent-runtime-regressions.eval.test.ts`
- `src/__tests__/agent-quality-runtime-foundation.test.ts`

### 从现有测试读到的行为
- resume-save-guard.test.ts 已覆盖 stale proposal、apply、rollback、discard 和 legacy save 转 proposal。
- resume-edit-proposals-route.test.ts 覆盖 API 层 proposal 生命周期。
- agent-runtime-regressions.eval.test.ts 用于锁定 Agent 运行时的伪成功和写入边界。

### 待补 eval 缺口
- 补 proposal API 的用户隔离测试。
- 补前端 proposal card apply/discard/rollback 的 UI eval。
- 补多 proposal 并发时 latest applied 选择规则 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 proposal API 的用户隔离测试

**为什么要补**: 这是当前 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/resume-save-guard.test.ts`、`src/__tests__/resume-edit-proposals-route.test.ts`、`src/__tests__/agent-runtime-regressions.eval.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`。
- fixture 必须包含：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target。
- 断言必须读取：proposal 状态机、diff 内容、CV read-back、apply/rollback 结果。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补前端 proposal card apply/discard/rollback 的 UI eval

**为什么要补**: 这是当前 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/resume-save-guard.test.ts`、`src/__tests__/resume-edit-proposals-route.test.ts`、`src/__tests__/agent-runtime-regressions.eval.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`。
- fixture 必须包含：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target。
- 断言必须读取：proposal 状态机、diff 内容、CV read-back、apply/rollback 结果。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补多 proposal 并发时 latest applied 选择规则 eval

**为什么要补**: 这是当前 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/resume-save-guard.test.ts`、`src/__tests__/resume-edit-proposals-route.test.ts`、`src/__tests__/agent-runtime-regressions.eval.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`。
- fixture 必须包含：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target。
- 断言必须读取：proposal 状态机、diff 内容、CV read-back、apply/rollback 结果。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 简历修改提案与回滚系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 明确修改请求创建 pending proposal

**状态**: 已有自动化覆盖

**项目依据**:
- 创建提案不是把一段文本插进数据库。`POST /api/cv/edit-proposals` 会先完成这些检查：
- `create_resume_edit_proposal` 的工具描述非常明确：只保存为待审批草稿，不直接写入 CV。
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“明确修改请求创建 pending proposal”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“明确修改请求创建 pending proposal”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“明确修改请求创建 pending proposal”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot
- `src/__tests__/resume-save-guard.test.ts`: discards a pending proposal through the tool with status read-back
- `src/__tests__/resume-edit-proposals-route.test.ts`: keeps the default pending proposal list behavior
- `src/__tests__/agent-runtime-regressions.eval.test.ts`: recovery: pending resume proposal survives refresh and routes approval by proposal id

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. apply 需要 base version/hash 匹配

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 用户必须已登录。 2. `sectionId` 必须是合法板块。 3. `proposedContent` 必须通过 `validateResumeSectionContent()`。 4. 当前 CV 必须存在 active version。 5. 目标 section 必须存在。 6. 如果调用方带了 `expectedBaseVersion` 或...
- - `src/__tests__/resume-save-guard.test.ts`：验证保存意图识别、非简历内容拦截、伪成功提示清洗。 - `src/__tests__/resume-edit-proposals-route.test.ts`：验证提案接口、状态和错误处理。 - `src/lib/agent/tools/action/create-res...
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“apply 需要 base version/hash 匹配”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“apply 需要 base version/hash 匹配”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“apply 需要 base version/hash 匹配”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: blocks stale legacy save proposals when base version or hash changed
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: captures resume base version and hash for durable edit contracts

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. discard pending proposal

**状态**: 已有自动化覆盖

**项目依据**:
- 提案系统   -> 把被选中的变体转成 pending proposal   -> 等用户确认   -> 写入并读回   -> 支持回滚 ```
- 核心数据结构是 `ResumeEditProposalRecord`：
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“discard pending proposal”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“discard pending proposal”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“discard pending proposal”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: builds proposal action plans from refreshed chat history
- `src/__tests__/resume-save-guard.test.ts`: routes legacy section saves through a read-back verified proposal
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. rollback applied proposal

**状态**: 已有自动化覆盖

**项目依据**:
- rollback   -> 用户撤销已经 applied 的提案   -> 当前 section 必须仍然等于 proposed_content   -> 恢复 original_content   -> 提案状态变成 rolled_back ```
- 提案系统   -> 把被选中的变体转成 pending proposal   -> 等用户确认   -> 写入并读回   -> 支持回滚 ```
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“rollback applied proposal”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“rollback applied proposal”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“rollback applied proposal”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: builds proposal action plans from refreshed chat history
- `src/__tests__/resume-save-guard.test.ts`: routes legacy section saves through a read-back verified proposal
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. stale proposal 不能应用

**状态**: 已有自动化覆盖

**项目依据**:
- - `pending`：提案存在，但还没有写入正式简历。 - `applied`：提案已经写入，并完成读回。 - `discarded`：用户拒绝，不能再应用。 - `stale`：上下文已过期，不能继续使用。 - `rolled_back`：已应用内容被恢复。
- - 未确认时不会写入正式简历。 - 创建提案后可以读回同一个提案。 - CV 变化后旧提案不能应用。 - 应用后目标 section 内容和预期一致。 - 没有真实保存成功时，Agent 不会说“已保存”。
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“stale proposal 不能应用”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“stale proposal 不能应用”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“stale proposal 不能应用”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: blocks applying a stale resume edit proposal
- `src/__tests__/resume-save-guard.test.ts`: blocks stale legacy save proposals when base version or hash changed

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. rollback 当前内容不匹配时拒绝

**状态**: 已有自动化覆盖

**项目依据**:
- 回滚的关键边界是 `rollback_conflict`。如果提案应用后，用户或其他工具又改过同一个板块，当前内容已经不等于 `proposed_content`，系统会拒绝回滚。因为此时回滚会覆盖更新后的简历内容。
- rollback   -> 用户撤销已经 applied 的提案   -> 当前 section 必须仍然等于 proposed_content   -> 恢复 original_content   -> 提案状态变成 rolled_back ```
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“rollback 当前内容不匹配时拒绝”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“rollback 当前内容不匹配时拒绝”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“rollback 当前内容不匹配时拒绝”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: blocks rollback when the section changed after proposal apply
- `src/__tests__/resume-edit-proposals-route.test.ts`: lists the latest applied proposal for the rollback affordance
- `src/__tests__/agent-runtime-regressions.eval.test.ts`: recovery: agent page keeps a rollback affordance for the latest applied resume edit

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 无工具成功不能说已保存

**状态**: 已有自动化覆盖

**项目依据**:
- 如果模型输出里出现“已保存 / 已写入 / 已更新 / 已同步简历”等说法，但工具结果并没有证明保存成功，它会把回复替换成：
- - 用户只是问“我现在的简历是什么”，系统却误判为要保存或修改。 - AI 生成了一个“修改前 / 修改后 / 原因”的对照表，结果被当成简历正文写入。 - 用户还没确认，模型就把建议内容覆盖掉正式简历。 - 用户在提案生成后又改了简历，旧提案继续应用会覆盖新内容。 - 工具失败但 Agent 回复“已保存”，用户以为简历已经更新。
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“无工具成功不能说已保存”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“无工具成功不能说已保存”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“无工具成功不能说已保存”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: builds a save plan from the latest optimization tool result
- `src/__tests__/resume-save-guard.test.ts`: rewrites unsupported save claims when no save tool succeeded
- `src/__tests__/resume-save-guard.test.ts`: applies a proposal through the tool only when server read-back verified
- `src/__tests__/resume-save-guard.test.ts`: discards a pending proposal through the tool with status read-back

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. proposal owner scoped

**状态**: 已有自动化覆盖

**项目依据**:
- 核心数据结构是 `ResumeEditProposalRecord`：
- 创建提案不是把一段文本插进数据库。`POST /api/cv/edit-proposals` 会先完成这些检查：
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“proposal owner scoped”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“proposal owner scoped”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“proposal owner scoped”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: builds proposal action plans from refreshed chat history
- `src/__tests__/resume-save-guard.test.ts`: routes legacy section saves through a read-back verified proposal
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 占位符提案被接受

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 纸鸢求职助手的简历修改提案系统，解决的是 AI 写入简历时最敏感的问题：用户的真实经历不能被模型直接覆盖，任何正式写入都必须有草稿、确认、版本校验、读回证据和回滚路径。
- - 用户只是问“我现在的简历是什么”，系统却误判为要保存或修改。 - AI 生成了一个“修改前 / 修改后 / 原因”的对照表，结果被当成简历正文写入。 - 用户还没确认，模型就把建议内容覆盖掉正式简历。 - 用户在提案生成后又改了简历，旧提案继续应用会覆盖新内容。 - 工具失败但 Agent 回复“已保存”，用户以为简历已经更新。
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“占位符提案被接受”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“占位符提案被接受”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“占位符提案被接受”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: builds a real save plan from a pasted revised skills list
- `src/__tests__/resume-save-guard.test.ts`: builds a save plan from the latest optimization tool result
- `src/__tests__/resume-save-guard.test.ts`: does not hijack excellent reference resume save requests

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. diff table/code fence 污染正文

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - 用户只是问“我现在的简历是什么”，系统却误判为要保存或修改。 - AI 生成了一个“修改前 / 修改后 / 原因”的对照表，结果被当成简历正文写入。 - 用户还没确认，模型就把建议内容覆盖掉正式简历。 - 用户在提案生成后又改了简历，旧提案继续应用会覆盖新内容。 - 工具失败但 Agent 回复“已保存”，用户以为简历已经更新。
- 当前项目里，`src/lib/agent/resume-save-guard.ts` 就是为这些问题存在的。它会识别保存意图、过滤非简历正文、拒绝参考简历保存误判，并在没有真实保存成功时清洗掉“已保存”的自然语言成功提示。
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“diff table/code fence 污染正文”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“diff table/code fence 污染正文”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“diff table/code fence 污染正文”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: builds a real save plan from a pasted revised skills list
- `src/__tests__/resume-save-guard.test.ts`: builds a save plan from the latest optimization tool result
- `src/__tests__/resume-save-guard.test.ts`: does not hijack excellent reference resume save requests

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. read-back mismatch 仍说 Successfully saved

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手的简历修改提案系统，解决的是 AI 写入简历时最敏感的问题：用户的真实经历不能被模型直接覆盖，任何正式写入都必须有草稿、确认、版本校验、读回证据和回滚路径。
- 这个功能的产品原则是：AI 可以建议，用户决定写入，系统用读回证明结果。
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“read-back mismatch 仍说 Successfully saved”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“read-back mismatch 仍说 Successfully saved”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“read-back mismatch 仍说 Successfully saved”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: routes legacy section saves through a read-back verified proposal
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly
- `src/__tests__/resume-save-guard.test.ts`: applies a proposal through the tool only when server read-back verified
- `src/__tests__/resume-save-guard.test.ts`: discards a pending proposal through the tool with status read-back

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 废弃 proposal 仍可 apply

**状态**: 已有自动化覆盖

**项目依据**:
- 用户不一定会精确说“apply proposal rep_xxx”。`buildResumeEditProposalActionPlan()` 支持自然语言识别：
- 核心数据结构是 `ResumeEditProposalRecord`：
- 主要实现面：`src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts`、`src/app/api/cv/edit-proposals/route.ts`、`src/app/api/cv/edit-proposals/[id]/apply/route.ts`。

**输入/fixture**:
- 正例：明确改写某个 section 的 pending proposal，用来验证“废弃 proposal 仍可 apply”的成功路径。
- 反例：stale proposal、owner mismatch、placeholder 正文、read-back mismatch，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：proposalId、baseVersion、baseHash、status、sectionKey 和 rollback target；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 resume-edit-proposals route、proposal apply/discard/rollback 和 base hash 校验 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“废弃 proposal 仍可 apply”对应动作，并记录请求、工具调用或页面状态。
3. 读取 proposal 状态机、diff 内容、CV read-back、apply/rollback 结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“废弃 proposal 仍可 apply”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 简历修改提案与回滚系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/resume-save-guard.test.ts`: builds proposal action plans from refreshed chat history
- `src/__tests__/resume-save-guard.test.ts`: routes legacy section saves through a read-back verified proposal
- `src/__tests__/resume-save-guard.test.ts`: creates a read-back verified resume edit proposal instead of writing CV directly
- `src/__tests__/resume-save-guard.test.ts`: applies a pending resume edit proposal to the matching CV snapshot

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/resume-save-guard.test.ts`
  - builds a real save plan from a pasted revised skills list
  - builds a save plan from the latest optimization tool result
  - does not hijack excellent reference resume save requests
  - builds proposal action plans from refreshed chat history
  - rejects placeholder edit instructions instead of treating them as project content
  - rewrites unsupported save claims when no save tool succeeded
  - routes legacy section saves through a read-back verified proposal
  - creates a read-back verified resume edit proposal instead of writing CV directly
  - ...
- `src/__tests__/resume-edit-proposals-route.test.ts`
  - lists the latest applied proposal for the rollback affordance
  - keeps the default pending proposal list behavior
- `src/__tests__/agent-runtime-regressions.eval.test.ts`
  - baseline: blocks placeholder and half-written resume saves
  - boundary: accepts compact valid manual edits but rejects agent control markup
  - regression: never lets a failed verifier look like a saved resume
  - recovery: reload can read active durable runs for the current session
  - recovery: resume control can load active run details and latest step
  - recovery: cancel control calls the owner-scoped cancel endpoint
  - recovery: agent page renders resume and cancel controls for active durable runs
  - recovery: agent page keeps a rollback affordance for the latest applied resume edit
  - ...
- `src/__tests__/agent-quality-runtime-foundation.test.ts`
  - classifies every registered action tool
  - rejects placeholder document content and markdown control output
  - does not allow read-back mismatch to report success
  - reports blocking production SQLite imports and allowlisted bridge files
  - keeps migration verification strict but allows target drift in cutover mode
  - defines durable Postgres tables for agent runs and steps
  - requires task criteria before an agent can claim durable success
  - treats current resume lookup as read-only instead of a resume write
  - ...


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 简历修改提案与回滚系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
