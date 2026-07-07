# 优秀简历记忆系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 优秀简历记忆系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

参考简历保存意图、role_category、visibility、chunking、embedding、检索、反馈晋升和团队审批。

## 项目事实

### 关键实现面
- `src/lib/reference-resume-vector.ts`
- `src/lib/memory/eval-harness.ts`
- `src/lib/memory/vector-memory.ts`
- `src/lib/memory/governance.ts`
- `src/lib/memory/feedback-promotion.ts`
- `src/lib/agent/reference-resume-save-flow.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/reference-resume-vector.test.ts`
- `src/__tests__/reference-resume-save-flow.test.ts`
- `src/__tests__/memory-eval-harness.test.ts`
- `src/__tests__/memory-feedback-promotion.test.ts`
- `src/__tests__/memory-governance-ui.test.ts`
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`

### 从现有测试读到的行为
- memory-eval-harness.test.ts 已完整分出 memory baseline、boundary、regression evals。
- reference-resume-vector.test.ts 已覆盖保存意图识别、完整简历判定、role/visibility 归一化、脱敏、重复导入和 owner/team scope。
- memory-feedback-promotion.test.ts 已覆盖 accepted snippets 上浮、rejected snippets 下沉的反馈晋升路径。

### 待补 eval 缺口
- 补真实 OCR 截图到 save_reference_resume 的端到端 eval。
- 补 Admin 审批 team reference 后被普通用户检索到的集成 eval。
- 补 embedding provider 失败后 reindex UI 操作 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补真实 OCR 截图到 save_reference_resume 的端到端 eval

**为什么要补**: 这是当前 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/reference-resume-vector.test.ts`、`src/__tests__/reference-resume-save-flow.test.ts`、`src/__tests__/memory-eval-harness.test.ts`、`src/__tests__/memory-feedback-promotion.test.ts`、`src/__tests__/memory-governance-ui.test.ts`。
- fixture 必须包含：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback。
- 断言必须读取：reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 Admin 审批 team reference 后被普通用户检索到的集成 eval

**为什么要补**: 这是当前 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/reference-resume-vector.test.ts`、`src/__tests__/reference-resume-save-flow.test.ts`、`src/__tests__/memory-eval-harness.test.ts`、`src/__tests__/memory-feedback-promotion.test.ts`、`src/__tests__/memory-governance-ui.test.ts`。
- fixture 必须包含：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback。
- 断言必须读取：reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 embedding provider 失败后 reindex UI 操作 eval

**为什么要补**: 这是当前 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/reference-resume-vector.test.ts`、`src/__tests__/reference-resume-save-flow.test.ts`、`src/__tests__/memory-eval-harness.test.ts`、`src/__tests__/memory-feedback-promotion.test.ts`、`src/__tests__/memory-governance-ui.test.ts`。
- fixture 必须包含：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback。
- 断言必须读取：reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 优秀简历记忆系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 粘贴优秀简历可 chunk + embed

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手的优秀简历记忆系统，不是一个“范文收藏夹”。它把高质量简历转成两类长期资产：一类是可检索的参考片段，用于简历优化时提供同岗位、同板块的表达参照；另一类是抽象写作模式，用于迁移优秀简历的结构、指标意识和故事组织方式。
- 这个系统的产品目标是：让用户和团队沉淀优秀简历的判断力，而不是复制优秀简历的原文。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“粘贴优秀简历可 chunk + embed”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“粘贴优秀简历可 chunk + embed”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“粘贴优秀简历可 chunk + embed”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: scores complete, quantified resumes higher than fragments
- `src/__tests__/reference-resume-vector.test.ts`: does not delete reference_resume_chunks through the user_id cleanup list

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. 截图提取简历时只追问一次 role

**状态**: 已有自动化覆盖

**项目依据**:
- `redactReferenceResumeText()` 会替换：
- - `src/__tests__/reference-resume-save-flow.test.ts`：验证保存优秀简历的意图识别、岗位方向追问、确认和取消。 - `src/__tests__/reference-resume-vector.test.ts`：验证质量评分、脱敏、索引、检索查询和排序。 - `src/__tests__/excellent-...
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“截图提取简历时只追问一次 role”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“截图提取简历时只追问一次 role”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“截图提取简历时只追问一次 role”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: scores complete, quantified resumes higher than fragments
- `src/__tests__/reference-resume-vector.test.ts`: exposes save_reference_resume only through the resume agent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. 简历优化检索 role-relevant snippets

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手的优秀简历记忆系统，不是一个“范文收藏夹”。它把高质量简历转成两类长期资产：一类是可检索的参考片段，用于简历优化时提供同岗位、同板块的表达参照；另一类是抽象写作模式，用于迁移优秀简历的结构、指标意识和故事组织方式。
- 优秀简历记忆系统让这些判断不只停留在一次对话里，而是沉淀成后续优化可以检索和复用的材料。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“简历优化检索 role-relevant snippets”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“简历优化检索 role-relevant snippets”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“简历优化检索 role-relevant snippets”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: scores complete, quantified resumes higher than fragments
- `src/__tests__/reference-resume-vector.test.ts`: does not delete reference_resume_chunks through the user_id cleanup list

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. feedback 作为小权重排序信号

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 其中 feedbackTrustScore 来自用户后续接受或拒绝该参考片段的反馈。这个设计让参考简历不是一次性静态库，而是会随使用效果调整排序。
- 返回后按 importance、confidence、feedbackTrustScore 综合排序，最多注入 6 条。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“feedback 作为小权重排序信号”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“feedback 作为小权重排序信号”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“feedback 作为小权重排序信号”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: normalizes role categories and visibility values

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. JD/Offer/无关截图不进入优秀简历保存

**状态**: 已有自动化覆盖

**项目依据**:
- Agent 场景下，不是所有简历图片或文本都会保存成优秀简历。`reference-resume-save-flow.ts` 要同时满足：
- `redactReferenceResumeText()` 会替换：
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“JD/Offer/无关截图不进入优秀简历保存”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD/Offer/无关截图不进入优秀简历保存”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD/Offer/无关截图不进入优秀简历保存”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: scores complete, quantified resumes higher than fragments
- `src/__tests__/reference-resume-vector.test.ts`: exposes save_reference_resume only through the resume agent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. private references 永不跨用户

**状态**: 已有自动化覆盖

**项目依据**:
- 检索时，用户能看到自己的 `private`、`team_pending`、`team`，以及全局 `team`。也就是说，`team_pending` 不会扩散给其他人，但保存者自己仍可使用。
- 这个系统的产品目标是：让用户和团队沉淀优秀简历的判断力，而不是复制优秀简历的原文。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“private references 永不跨用户”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“private references 永不跨用户”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“private references 永不跨用户”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/memory-eval-harness.test.ts`: boundary: private references never cross users and team references require approval
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: boundary: private retrieval is owner scoped while approved team references can be shared

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. team references 必须 approved 后共享

**状态**: 已有自动化覆盖

**项目依据**:
- - `private`：仅本人可用。 - `team_pending`：申请团队共享，但未审核。 - `team`：团队可用。 - `disabled`：禁用。
- 私有参考简历可以保留原文用于个人检索；团队共享必须使用脱敏文本做索引和模式抽取。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“team references 必须 approved 后共享”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“team references 必须 approved 后共享”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“team references 必须 approved 后共享”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: provides admin review controls for pending team references
- `src/__tests__/reference-resume-vector.test.ts`: keeps retrieval scoped to owned references or approved team references
- `src/__tests__/memory-eval-harness.test.ts`: boundary: private references never cross users and team references require approval
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`: boundary: private retrieval is owner scoped while approved team references can be shared

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. 输出迁移结构但不复制长句

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 纸鸢求职助手的优秀简历记忆系统，不是一个“范文收藏夹”。它把高质量简历转成两类长期资产：一类是可检索的参考片段，用于简历优化时提供同岗位、同板块的表达参照；另一类是抽象写作模式，用于迁移优秀简历的结构、指标意识和故事组织方式。
- - 这些是抽象写作模式，不是当前用户事实。 - 只能改善结构、具体性、指标框架和故事逻辑。 - 不能复制来源措辞，不能编造事实。 - 如果和当前 CV 或 JD 冲突，以用户 CV 和 JD 为准。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“输出迁移结构但不复制长句”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“输出迁移结构但不复制长句”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“输出迁移结构但不复制长句”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: normalizes role categories and visibility values

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. weak candidate patterns 被当成 active guidance

**状态**: 已有自动化覆盖

**项目依据**:
- - chunk 必须已 embedded。 - chunk 状态必须 active。 - 用户能访问该可见性。 - 如果有 roleCategory，优先同岗位、general 或空角色。 - 如果有 sectionType，优先同板块。
- - PostgreSQL 可用。 - `memory_type = excellent_resume_pattern`。 - `status = active`。 - 属于当前用户或团队可见。 - roleCategory 匹配、general 或空角色。 - `confidence >= 0.65`。 - `importance >= 0.55`。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“weak candidate patterns 被当成 active guidance”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“weak candidate patterns 被当成 active guidance”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“weak candidate patterns 被当成 active guidance”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/memory-eval-harness.test.ts`: regression: weak candidate patterns are not retrieved as active guidance
- `src/__tests__/memory-feedback-promotion.test.ts`: requires admin approval before team memory becomes shared active guidance

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. embedding failures 丢 source chunks

**状态**: 已有自动化覆盖

**项目依据**:
- - `name` - `source` - `sections_json` - `raw_text` - `tags` - `notes` - `role_category` - `visibility` - `status` - `quality_score` - `anonymized` - `shared_text_redacted` - `sourc...
- - `reference_resume_id` - `owner_user_id` - `visibility` - `status` - `role_category` - `section_type` - `chunk_index` - `chunk_text` - `content_hash` - `embedding_model` - `embedd...
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“embedding failures 丢 source chunks”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“embedding failures 丢 source chunks”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“embedding failures 丢 source chunks”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: adds vector chunks and usage tables to PostgreSQL schema
- `src/__tests__/reference-resume-vector.test.ts`: short-circuits duplicate imports by source hash
- `src/__tests__/reference-resume-vector.test.ts`: provides an owner-scoped reindex endpoint for failed chunks
- `src/__tests__/memory-eval-harness.test.ts`: creates repeatable 1536-dimensional mock embeddings

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. source hash duplicate 重复导入

**状态**: 已有自动化覆盖

**项目依据**:
- - `name` - `source` - `sections_json` - `raw_text` - `tags` - `notes` - `role_category` - `visibility` - `status` - `quality_score` - `anonymized` - `shared_text_redacted` - `sourc...
- 索引前会删除该 reference resume 的旧 chunks，保证重建索引不会产生重复片段。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“source hash duplicate 重复导入”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“source hash duplicate 重复导入”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“source hash duplicate 重复导入”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: short-circuits duplicate imports by source hash

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 联系信息未脱敏进入共享检索

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这让团队共享有审核缓冲，不会把低质量或未脱敏材料直接放进公共记忆。
- 私有参考简历可以保留原文用于个人检索；团队共享必须使用脱敏文本做索引和模式抽取。
- 主要实现面：`src/lib/reference-resume-vector.ts`、`src/lib/memory/eval-harness.ts`、`src/lib/memory/vector-memory.ts`、`src/lib/memory/governance.ts`。

**输入/fixture**:
- 正例：粘贴或截图提取的完整优秀简历、role_category、visibility 和反馈样本，用来验证“联系信息未脱敏进入共享检索”的成功路径。
- 反例：JD/Offer/无关截图、private 跨用户、team_pending、embedding failure、重复 source hash，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：referenceId、sourceHash、roleCategory、visibility、chunk ids、embedding status 和 feedback；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 reference-resume-save-flow、reference-resume-vector、memory eval harness 和治理 UI 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“联系信息未脱敏进入共享检索”对应动作，并记录请求、工具调用或页面状态。
3. 读取 reference_resumes、reference_resume_chunks、检索排名、脱敏文本和 reindex 状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“联系信息未脱敏进入共享检索”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 优秀简历记忆系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/reference-resume-vector.test.ts`: detects explicit excellent resume save intent
- `src/__tests__/reference-resume-vector.test.ts`: recognizes complete resume-like text and rejects noisy fragments
- `src/__tests__/reference-resume-vector.test.ts`: normalizes role categories and visibility values

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

- `src/__tests__/reference-resume-vector.test.ts`
  - detects explicit excellent resume save intent
  - recognizes complete resume-like text and rejects noisy fragments
  - normalizes role categories and visibility values
  - redacts personal contact data before shared retrieval
  - scores complete, quantified resumes higher than fragments
  - uses feedback as a small ranking signal without promoting bad samples
  - adds vector chunks and usage tables to PostgreSQL schema
  - does not delete reference_resume_chunks through the user_id cleanup list
  - ...
- `src/__tests__/reference-resume-save-flow.test.ts`
  - stores extracted resume text and asks exactly one role-category question when missing
  - completes the pending save from the next role-category answer
  - uses suggested role only after user confirmation
  - can confirm the suggested role and request team sharing in the same answer
  - uses team visibility only when sharing is explicit
  - recognizes cancellation answers
- `src/__tests__/memory-eval-harness.test.ts`
  - defines the AI PM wedge fixtures used by deterministic evals
  - creates repeatable 1536-dimensional mock embeddings
  - runs seeded reference retrieval and collects ranked source labels
  - reports retrieval hits, source labels, quality delta, copy overlap, and policy violations
  - baseline: pasted excellent resume save can be chunked and embedded
  - baseline: screenshot-extracted resume asks one role follow-up and preserves text
  - baseline: resume optimization retrieves role-relevant snippets and pattern guidance
  - boundary: unrelated, JD, and offer screenshots do not enter excellent-resume save flow
  - ...
- `src/__tests__/memory-feedback-promotion.test.ts`
  - does not promote team-shared memory from one accepted output
  - promotes private candidate memory only after repeated positive feedback
  - requires admin approval before team memory becomes shared active guidance
  - repeated negative feedback rejects memory and downranks snippets
  - tracks edit distance and scoped feedback separately
  - rejects generic or low-evidence pattern text
  - routes optimization feedback through the promotion service
  - uses snippet-level, scoped usage for reference reranking
  - ...
- `src/__tests__/memory-governance-ui.test.ts`
  - requires admin access before any governance action can run
  - keeps normal reference material APIs lightweight and owner-scoped
  - renders admin governance queues and safe actions
  - degrades vector governance gracefully on SQLite and hides raw internals from users
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`
  - baseline: pasted excellent resume with role category can complete a save action
  - baseline: screenshot-extracted resume without role category asks a follow-up while preserving text
  - boundary: non-resume screenshots do not enter excellent-resume save flow
  - boundary: private retrieval is owner scoped while approved team references can be shared
  - regression: accepted references rank up and rejected references rank down
  - regression: pattern extraction produces abstract memory instead of copied resume text


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 优秀简历记忆系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
