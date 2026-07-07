# 求职画像系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 求职画像系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

profile mining、profile signals、技能质量门、目标公司/岗位、画像持久化、画像到 Agent 路由和推荐上下文。

## 项目事实

### 关键实现面
- `src/lib/profile-mining.ts`
- `src/lib/profile-storage.ts`
- `src/lib/profile-signal-persistence-verifier.ts`
- `src/lib/profile-skill-quality.ts`
- `src/lib/server-profile-engine.ts`
- `src/lib/agent/task-routing.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/profile-signal-verified-write.test.ts`
- `src/__tests__/profile-skill-quality.test.ts`
- `src/__tests__/career-positioning-result.test.ts`
- `src/__tests__/agent-task-routing.test.ts`

### 从现有测试读到的行为
- profile-signal-verified-write.test.ts 已覆盖单条/批量画像信号写入后读回，以及确认技能信号后晋升到 profile。
- profile-skill-quality.test.ts 已覆盖技能质量门，避免噪声短语进入画像。
- agent-task-routing.test.ts 已固定 self-positioning 走 guidance/read tools，而不是 profile write。

### 待补 eval 缺口
- 补 settings/profile goals route 保存目标公司的 eval。
- 补画像挖掘失败不覆盖旧画像的 UI eval。
- 补画像信号来源证据在 Admin/Review 中脱敏展示的 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 settings/profile goals route 保存目标公司的 eval

**为什么要补**: 这是当前 profile mining、profile signals、profile skill quality 和 profile goals 写入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/profile-signal-verified-write.test.ts`、`src/__tests__/profile-skill-quality.test.ts`、`src/__tests__/career-positioning-result.test.ts`、`src/__tests__/agent-task-routing.test.ts`。
- fixture 必须包含：signalId、profileId、skill label、quality score、goal company 和 userId。
- 断言必须读取：profile_signals read-back、profile skills、goals、质量过滤和 owner scope。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补画像挖掘失败不覆盖旧画像的 UI eval

**为什么要补**: 这是当前 profile mining、profile signals、profile skill quality 和 profile goals 写入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/profile-signal-verified-write.test.ts`、`src/__tests__/profile-skill-quality.test.ts`、`src/__tests__/career-positioning-result.test.ts`、`src/__tests__/agent-task-routing.test.ts`。
- fixture 必须包含：signalId、profileId、skill label、quality score、goal company 和 userId。
- 断言必须读取：profile_signals read-back、profile skills、goals、质量过滤和 owner scope。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补画像信号来源证据在 Admin/Review 中脱敏展示的 eval

**为什么要补**: 这是当前 profile mining、profile signals、profile skill quality 和 profile goals 写入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/profile-signal-verified-write.test.ts`、`src/__tests__/profile-skill-quality.test.ts`、`src/__tests__/career-positioning-result.test.ts`、`src/__tests__/agent-task-routing.test.ts`。
- fixture 必须包含：signalId、profileId、skill label、quality score、goal company 和 userId。
- 断言必须读取：profile_signals read-back、profile skills、goals、质量过滤和 owner scope。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 求职画像系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 从简历/对话中提取 profile signals

**状态**: 已有自动化覆盖

**项目依据**:
- `DELETE /api/data/profile` 会：
- - JD 要求不能进入用户技能。 - 没有用户自有证据的普通对话不能进入长期画像。 - 用户确认技能后，profile 里能读回该技能。 - 用户拒绝信号后，它不会继续作为确认事实使用。 - 重置画像会删除 signals。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“从简历/对话中提取 profile signals”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“从简历/对话中提取 profile signals”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“从简历/对话中提取 profile signals”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`: rejects low-value extracted profile signal examples before storage
- `src/__tests__/profile-skill-quality.test.ts`: filters polluted LLM profile skills before display
- `src/__tests__/profile-skill-quality.test.ts`: keeps JD-only requirements out of user profile signals

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. 写入 profile signal 后 read-back

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/profile-skill-quality.test.ts`：验证技能、底线、来源、噪声、JD 要求过滤。 - `src/__tests__/profile-signal-verified-write.test.ts`：验证 signal 写入读回、确认技能晋升 profile。 - `src/lib/profile-sig...
- - 同名技能合并。 - 手动来源优先。 - proficiency 取更高值。 - evidence 去重，最多保留 5 条。 - profile skills 最多保留 20 个。 - history 追加“确认画像技能”事件。 - 再读回 profile，确认 `profileContainsSkill()` 为真。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“写入 profile signal 后 read-back”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“写入 profile signal 后 read-back”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“写入 profile signal 后 read-back”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`: rejects low-value extracted profile signal examples before storage

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. 确认技能信号后晋升到 profile skills

**状态**: 已有自动化覆盖

**项目依据**:
- - JD 要求不能进入用户技能。 - 没有用户自有证据的普通对话不能进入长期画像。 - 用户确认技能后，profile 里能读回该技能。 - 用户拒绝信号后，它不会继续作为确认事实使用。 - 重置画像会删除 signals。
- 如果确认的是 `skill_claim`，系统还会执行 `upsertConfirmedSkill()`，把该技能晋升进 profile 的 `skills` 数组。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“确认技能信号后晋升到 profile skills”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“确认技能信号后晋升到 profile skills”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“确认技能信号后晋升到 profile skills”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`: rejects low-value extracted profile signal examples before storage
- `src/__tests__/profile-skill-quality.test.ts`: filters polluted LLM profile skills before display
- `src/__tests__/profile-skill-quality.test.ts`: keeps JD-only requirements out of user profile signals

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 目标公司进入首页新闻和岗位发现上下文

**状态**: 已有自动化覆盖

**项目依据**:
- 一个关键规则是：`sourceType === "jd"` 的 `skill_claim` 会被拒绝，错误原因是 `jd_requirement_is_not_user_skill`。这条规则直接防止“岗位要求会 SQL”被记成“用户会 SQL”。
- - 从 applications 计算投递数量、面试/offer 通过率、状态分布。 - 从 reports 计算平均评分和行业/岗位 archetype。 - 从 practiceRecords 计算训练记录数量和题型分布。 - 生成一个“统计画像生成（LLM 暂不可用）”历史事件。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“目标公司进入首页新闻和岗位发现上下文”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“目标公司进入首页新闻和岗位发现上下文”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“目标公司进入首页新闻和岗位发现上下文”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-task-routing.test.ts`: routes clear job discovery requests to job_search with governed tools
- `src/__tests__/agent-task-routing.test.ts`: asks one clarification for vague job discovery requests
- `src/__tests__/agent-task-routing.test.ts`: does not confuse JD evaluation with job discovery

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 自我定位建议不直接写 profile

**状态**: 已有自动化覆盖

**项目依据**:
- `DELETE /api/data/profile` 会：
- `profile-sop.ts` 管理 Agent 的自我定位流程。状态保存在 localStorage，key 是：
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“自我定位建议不直接写 profile”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“自我定位建议不直接写 profile”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“自我定位建议不直接写 profile”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`: rejects low-value extracted profile signal examples before storage

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. 低质量技能短语不晋升

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这个系统的产品目标是：让用户不必每次重新解释自己是谁、想找什么、不能接受什么，同时防止低质量信号污染长期记忆。
- 如果确认的是 `skill_claim`，系统还会执行 `upsertConfirmedSkill()`，把该技能晋升进 profile 的 `skills` 数组。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“低质量技能短语不晋升”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“低质量技能短语不晋升”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“低质量技能短语不晋升”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. 跨用户 profile 不互读

**状态**: 已有自动化覆盖

**项目依据**:
- `DELETE /api/data/profile` 会：
- 纸鸢求职助手的求职画像系统，不是一个“个人资料表”。它是 Agent 理解用户长期求职目标、能力证据、偏好和约束的记忆层。它决定了系统能不能从通用建议，走向“按这个用户的方向、经历、底线和历史反馈来判断机会”。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“跨用户 profile 不互读”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“跨用户 profile 不互读”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“跨用户 profile 不互读”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`: rejects low-value extracted profile signal examples before storage

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. 画像写入失败不吞掉旧画像

**状态**: 已有自动化覆盖

**项目依据**:
- `DELETE /api/data/profile` 会：
- - `src/__tests__/profile-skill-quality.test.ts`：验证技能、底线、来源、噪声、JD 要求过滤。 - `src/__tests__/profile-signal-verified-write.test.ts`：验证 signal 写入读回、确认技能晋升 profile。 - `src/lib/profile-sig...
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“画像写入失败不吞掉旧画像”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“画像写入失败不吞掉旧画像”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“画像写入失败不吞掉旧画像”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`: rejects low-value extracted profile signal examples before storage

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. guidance 被误路由为 profile_update

**状态**: 已有自动化覆盖

**项目依据**:
- `DELETE /api/data/profile` 会：
- 纸鸢求职助手的求职画像系统，不是一个“个人资料表”。它是 Agent 理解用户长期求职目标、能力证据、偏好和约束的记忆层。它决定了系统能不能从通用建议，走向“按这个用户的方向、经历、底线和历史反馈来判断机会”。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“guidance 被误路由为 profile_update”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“guidance 被误路由为 profile_update”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“guidance 被误路由为 profile_update”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`: rejects low-value extracted profile signal examples before storage

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. 批量信号只验证部分 id

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这个系统的产品目标是：让用户不必每次重新解释自己是谁、想找什么、不能接受什么，同时防止低质量信号污染长期记忆。
- 它的核心不是“多存点信息”，而是“只把有证据、有归属、有质量的信号沉淀下来”。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“批量信号只验证部分 id”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“批量信号只验证部分 id”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“批量信号只验证部分 id”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. 空技能覆盖已有技能

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - JD 里的要求被误当成用户技能。 - 面试题里的假设被误当成用户经历。 - Agent 输出的建议被误当成用户事实。 - 用户随口说的一句偏好被永久当成底线。 - 噪声词、泛词、失败提示进入技能库。
- - 泛词：业务、技术、能力、经验、项目、系统、平台等。 - 噪声词：面试题、考察点、失败提示、无关聊天片段。 - JD 要求：岗位职责、任职要求、至少、需要具备、N 年以上等。 - 没有自有证据的技能。 - 太短、太长或不像技能的词。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“空技能覆盖已有技能”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“空技能覆盖已有技能”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“空技能覆盖已有技能”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. 目标公司重复追加

**状态**: 已有自动化覆盖

**项目依据**:
- - 评估 JD 时不知道用户目标方向。 - 改简历时不知道哪些能力应该前置。 - Offer 分析时不知道薪资底线和工作方式偏好。 - 面试准备时不知道用户有哪些真实项目可以讲。 - 用户每次打开 Agent，都要重复介绍背景。
- 纸鸢求职助手的求职画像系统，不是一个“个人资料表”。它是 Agent 理解用户长期求职目标、能力证据、偏好和约束的记忆层。它决定了系统能不能从通用建议，走向“按这个用户的方向、经历、底线和历史反馈来判断机会”。
- 主要实现面：`src/lib/profile-mining.ts`、`src/lib/profile-storage.ts`、`src/lib/profile-signal-persistence-verifier.ts`、`src/lib/profile-skill-quality.ts`。

**输入/fixture**:
- 正例：简历/对话中的技能、目标公司、偏好和经确认的 profile signal，用来验证“目标公司重复追加”的成功路径。
- 反例：自我定位建议、低质量技能短语、空技能覆盖、跨用户 profile，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：signalId、profileId、skill label、quality score、goal company 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 profile mining、profile signals、profile skill quality 和 profile goals 写入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“目标公司重复追加”对应动作，并记录请求、工具调用或页面状态。
3. 读取 profile_signals read-back、profile skills、goals、质量过滤和 owner scope，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“目标公司重复追加”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 求职画像系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-skill-quality.test.ts`: normalizes and deduplicates credible user-owned skill claims
- `src/__tests__/profile-skill-quality.test.ts`: keeps confirmed user edits ahead of model-inferred duplicates

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/profile-signal-verified-write.test.ts`
  - verifies a single profile signal by reading it back before returning success
  - verifies batch profile signal writes by reading every inserted id back
  - verifies skill promotion into the profile after confirming a skill signal
- `src/__tests__/profile-skill-quality.test.ts`
  - rejects JD fragments, interview prompts, generic words, and chat filler
  - rejects low-value extracted profile signal examples before storage
  - requires user-owned evidence before accepting a known skill
  - normalizes and deduplicates credible user-owned skill claims
  - filters polluted LLM profile skills before display
  - enriches valid chat skills as candidates with evidence and source metadata
  - keeps JD-only requirements out of user profile signals
  - allows resume-backed skills to become confirmed candidates
  - ...
- `src/__tests__/career-positioning-result.test.ts`
  - treats generic completion text as unsafe for self-positioning final replies
  - turns the grilled-fish AI product conversation into a positioning result
  - builds a structured artifact that can be stored in guided session state
  - recognizes short confirmation replies for saving positioning results
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


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 求职画像系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
