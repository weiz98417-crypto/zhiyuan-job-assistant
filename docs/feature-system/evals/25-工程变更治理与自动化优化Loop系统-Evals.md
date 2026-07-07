# 工程变更治理与自动化优化Loop系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 工程变更治理与自动化优化Loop系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

OpenSpec 变更、feature-system 文档、check 脚本、run review、eval candidate、repair planner 和文档覆盖测试。

## 项目事实

### 关键实现面
- `openspec/`
- `scripts/check-jd-eval-partials.mjs`
- `src/lib/agent/run-review.ts`
- `src/lib/agent/repair-planner.ts`
- `src/__tests__/feature-system-evals-docs.test.ts`
- `docs/feature-system/evals/`

### 已落地或部分落地的 eval 资产
- `src/__tests__/agent-run-review.test.ts`
- `src/__tests__/admin-agent-reviews.test.ts`
- `src/__tests__/agent-repair-planner.test.ts`
- `src/__tests__/agent-repair-policy.test.ts`
- `src/__tests__/jd-eval-partial-candidate.test.ts`
- `src/__tests__/sqlite-postgres-migration.test.ts`
- `scripts/check-jd-eval-partials.mjs`

### 从现有测试读到的行为
- agent-run-review.test.ts 已覆盖 promoted eval candidate 只生成 redacted regression draft，不自动写文件。
- agent-repair-planner/policy 已覆盖修复规划的边界。
- feature-system-evals-docs.test.ts 用来保护每个 feature-system 文档都有对应 eval 文档。

### 待补 eval 缺口
- 补 OpenSpec change 与 feature-system 文档一致性的自动检查。
- 补 check 脚本默认 dry-run 不写数据的统一 eval。
- 补文档覆盖测试要求每个 eval 区分已落地/待补。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 OpenSpec change 与 feature-system 文档一致性的自动检查

**为什么要补**: 这是当前 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-run-review.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`、`src/__tests__/agent-repair-planner.test.ts`、`src/__tests__/agent-repair-policy.test.ts`、`src/__tests__/jd-eval-partial-candidate.test.ts`。
- fixture 必须包含：change id、script output、candidate id、suggested test name 和 retry count。
- 断言必须读取：规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 check 脚本默认 dry-run 不写数据的统一 eval

**为什么要补**: 这是当前 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-run-review.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`、`src/__tests__/agent-repair-planner.test.ts`、`src/__tests__/agent-repair-policy.test.ts`、`src/__tests__/jd-eval-partial-candidate.test.ts`。
- fixture 必须包含：change id、script output、candidate id、suggested test name 和 retry count。
- 断言必须读取：规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补文档覆盖测试要求每个 eval 区分已落地/待补

**为什么要补**: 这是当前 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-run-review.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`、`src/__tests__/agent-repair-planner.test.ts`、`src/__tests__/agent-repair-policy.test.ts`、`src/__tests__/jd-eval-partial-candidate.test.ts`。
- fixture 必须包含：change id、script output、candidate id、suggested test name 和 retry count。
- 断言必须读取：规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 工程变更治理与自动化优化Loop系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 重大工程变更有规范或文档证据

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 工程变更治理与自动化优化Loop不是求职者直接使用的功能，而是纸鸢在0-1产品成型后维持质量、发现回归、沉淀修复证据的内部系统。它把需求、实现、测试、运行证据、复盘和自动巡检连接起来，避免产品功能越做越多后失去可验证性。
- 这些OpenSpec不是旁支材料。它们让产品问题可以被转成有边界的工程变更：影响哪些能力、允许做什么、不允许越过什么、验收看哪些证据。
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“重大工程变更有规范或文档证据”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“重大工程变更有规范或文档证据”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“重大工程变更有规范或文档证据”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. check 脚本输出可复跑结果

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 复盘结果进入`agent_run_reviews`，可转成`agent_eval_candidates`。Admin可以接受、拒绝或提升候选，让运行时失败变成后续验证资产。
- `skills/agent-system-optimization-loop/STATE.md`是当前Loop状态源。它记录了自动化健康、运行环境、轮转池、已知问题、最近运行和验证结果。
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“check 脚本输出可复跑结果”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“check 脚本输出可复跑结果”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“check 脚本输出可复跑结果”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. run review 生成 eval candidate

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。 2. 核心产品链路有基线、边界、回归验证。 3. Agent运行能沉淀run、step、review和eval candidate。 4. 读写类任务失败时不能冒充成功。 5. 数据修复类任务有dry-run、verify和读回。 6. 自动化Loop每次正式运行都写回`STATE.md`和...
- Agent Run Review是工程治理和产品体验之间的桥。它把一次Agent运行拆成run、step、verifier、error和review。
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“run review 生成 eval candidate”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“run review 生成 eval candidate”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“run review 生成 eval candidate”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: creates session anomaly candidates when image intake has no durable run
- `src/__tests__/agent-run-review.test.ts`: turns promoted eval candidates into redacted regression drafts without auto-apply
- `src/__tests__/admin-agent-reviews.test.ts`: returns review summaries and eval candidates for admins
- `src/__tests__/admin-agent-reviews.test.ts`: updates eval candidate status with admin auth

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 文档覆盖测试保护 eval docs

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。 2. 核心产品链路有基线、边界、回归验证。 3. Agent运行能沉淀run、step、review和eval candidate。 4. 读写类任务失败时不能冒充成功。 5. 数据修复类任务有dry-run、verify和读回。 6. 自动化Loop每次正式运行都写回`STATE.md`和...
- 项目已经沉淀了大量eval和测试，不需要在无事实处编造。可以按三类理解：
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“文档覆盖测试保护 eval docs”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“文档覆盖测试保护 eval docs”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“文档覆盖测试保护 eval docs”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. candidate accepted 不自动改代码

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 数据修复不能盲写，必须有dry-run、确认、读回和可回滚证据。 2. Agent写入类修复必须经过任务契约和工具治理。 3. OpenSpec用于中等及以上变更，尤其涉及数据、Agent、权限、迁移和安全边界。 4. gstack/浏览器证据用于验证真实页面行为，但不能替代单元测试和数据读回。 5. Eval候选被接受或提升后，仍需开发者显式纳入测试...
- 1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。 2. 核心产品链路有基线、边界、回归验证。 3. Agent运行能沉淀run、step、review和eval candidate。 4. 读写类任务失败时不能冒充成功。 5. 数据修复类任务有dry-run、verify和读回。 6. 自动化Loop每次正式运行都写回`STATE.md`和...
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“candidate accepted 不自动改代码”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“candidate accepted 不自动改代码”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“candidate accepted 不自动改代码”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. promoted 不自动写测试文件

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 数据修复不能盲写，必须有dry-run、确认、读回和可回滚证据。 2. Agent写入类修复必须经过任务契约和工具治理。 3. OpenSpec用于中等及以上变更，尤其涉及数据、Agent、权限、迁移和安全边界。 4. gstack/浏览器证据用于验证真实页面行为，但不能替代单元测试和数据读回。 5. Eval候选被接受或提升后，仍需开发者显式纳入测试...
- 工程变更治理与自动化优化Loop不是求职者直接使用的功能，而是纸鸢在0-1产品成型后维持质量、发现回归、沉淀修复证据的内部系统。它把需求、实现、测试、运行证据、复盘和自动巡检连接起来，避免产品功能越做越多后失去可验证性。
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“promoted 不自动写测试文件”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“promoted 不自动写测试文件”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“promoted 不自动写测试文件”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. check 脚本默认不写生产数据

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 数据修复不能盲写，必须有dry-run、确认、读回和可回滚证据。 2. Agent写入类修复必须经过任务契约和工具治理。 3. OpenSpec用于中等及以上变更，尤其涉及数据、Agent、权限、迁移和安全边界。 4. gstack/浏览器证据用于验证真实页面行为，但不能替代单元测试和数据读回。 5. Eval候选被接受或提升后，仍需开发者显式纳入测试...
- 1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。 2. 核心产品链路有基线、边界、回归验证。 3. Agent运行能沉淀run、step、review和eval candidate。 4. 读写类任务失败时不能冒充成功。 5. 数据修复类任务有dry-run、verify和读回。 6. 自动化Loop每次正式运行都写回`STATE.md`和...
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“check 脚本默认不写生产数据”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“check 脚本默认不写生产数据”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“check 脚本默认不写生产数据”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. repair 不无限重试

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“repair 不无限重试”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“repair 不无限重试”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“repair 不无限重试”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. promoted draft 缺 suggested test name

**状态**: 已有自动化覆盖

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“promoted draft 缺 suggested test name”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“promoted draft 缺 suggested test name”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“promoted draft 缺 suggested test name”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: generates redacted OpenSpec draft suggestions without writing files
- `src/__tests__/agent-run-review.test.ts`: turns promoted eval candidates into redacted regression drafts without auto-apply
- `src/__tests__/admin-agent-reviews.test.ts`: returns promotion lifecycle draft for eval candidates

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. partial write candidate 重复

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。 2. 核心产品链路有基线、边界、回归验证。 3. Agent运行能沉淀run、step、review和eval candidate。 4. 读写类任务失败时不能冒充成功。 5. 数据修复类任务有dry-run、verify和读回。 6. 自动化Loop每次正式运行都写回`STATE.md`和...
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“partial write candidate 重复”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“partial write candidate 重复”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“partial write candidate 重复”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence
- `src/__tests__/admin-agent-reviews.test.ts`: updates eval candidate status with admin auth

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. 重复失败未转 needs engineering

**状态**: 已有自动化覆盖

**项目依据**:
- 复盘结果进入`agent_run_reviews`，可转成`agent_eval_candidates`。Admin可以接受、拒绝或提升候选，让运行时失败变成后续验证资产。
- 1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。 2. 核心产品链路有基线、边界、回归验证。 3. Agent运行能沉淀run、step、review和eval candidate。 4. 读写类任务失败时不能冒充成功。 5. 数据修复类任务有dry-run、verify和读回。 6. 自动化Loop每次正式运行都写回`STATE.md`和...
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“重复失败未转 needs engineering”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“重复失败未转 needs engineering”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“重复失败未转 needs engineering”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-repair-planner.test.ts`: marks repeated attempts as needs engineering

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 新增 feature-system 文档无 eval

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 新能力能在OpenSpec、代码、测试和文档里找到对应关系。 2. 核心产品链路有基线、边界、回归验证。 3. Agent运行能沉淀run、step、review和eval candidate。 4. 读写类任务失败时不能冒充成功。 5. 数据修复类任务有dry-run、verify和读回。 6. 自动化Loop每次正式运行都写回`STATE.md`和...
- 这套系统的目标不是“写更多文档”，而是让每个重要变更有事实来源、有验证入口、有状态记录。
- 主要实现面：`openspec/`、`scripts/check-jd-eval-partials.mjs`、`src/lib/agent/run-review.ts`、`src/lib/agent/repair-planner.ts`。

**输入/fixture**:
- 正例：一项重大变更、一条可复跑 check、一个 run review candidate，用来验证“新增 feature-system 文档无 eval”的成功路径。
- 反例：accepted/promoted 自动改代码、脚本写生产数据、repair 无限重试、新 feature 无 eval，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：change id、script output、candidate id、suggested test name 和 retry count；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 工程规范文档、check 脚本、run review、eval candidate 和 feature-system 文档覆盖测试 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“新增 feature-system 文档无 eval”对应动作，并记录请求、工具调用或页面状态。
3. 读取 规范/ADR、脚本退出码、candidate 草稿、文档覆盖测试和人工晋升状态，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“新增 feature-system 文档无 eval”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 工程变更治理与自动化优化Loop系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-run-review.test.ts`: normalizes unknown failure labels to system_error
- `src/__tests__/agent-run-review.test.ts`: redacts private text, image payloads, and secrets
- `src/__tests__/agent-run-review.test.ts`: flags successful high-risk write tools without read-back evidence

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

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
- `src/__tests__/admin-agent-reviews.test.ts`
  - returns review summaries and eval candidates for admins
  - rejects non-admin users
  - updates eval candidate status with admin auth
  - returns promotion lifecycle draft for eval candidates
- `src/__tests__/agent-repair-planner.test.ts`
  - reruns image intake when the original image is still usable
  - asks the user when only a thumbnail or unreadable image remains
  - repairs guided task drift by resuming the active task
  - does not claim success when read-back is missing after a save claim
  - marks repeated attempts as needs engineering
- `src/__tests__/agent-repair-policy.test.ts`
  - retries transient failures only within the configured limit
  - blocks validation failures before writes
  - requires rollback or failure when read-back verification mismatches
  - asks one clarification question for unclear intent or version conflicts
  - requires explicit approval for destructive risk and denies policy violations
- `src/__tests__/jd-eval-partial-candidate.test.ts`
  - turns orphan JD reports into redacted partial_write eval candidates
  - upserts candidates into the agent eval queue
- `src/__tests__/sqlite-postgres-migration.test.ts`
  - enumerates runtime SQLite tables and excludes non-durable FTS tables
  - marks news cache as volatile so verification ignores runtime cache churn
  - requires an explicit default owner for null or missing user_id rows
  - validates JSON columns before jsonb insertion
- `scripts/check-jd-eval-partials.mjs`


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 工程变更治理与自动化优化Loop系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
