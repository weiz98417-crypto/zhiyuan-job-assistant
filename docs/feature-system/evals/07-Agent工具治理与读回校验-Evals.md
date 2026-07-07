# Agent工具治理与读回校验 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 Agent工具治理与读回校验 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

工具 governance metadata、effect、agent allowlist、task allowlist、requiresReadBack、completion gate 和 false success 清洗。

## 项目事实

### 关键实现面
- `src/lib/agent/tool-governance.ts`
- `src/lib/agent/task-contract.ts`
- `src/lib/agent/tools/readback-verification.ts`
- `src/lib/agent/tools/action-tool-risk.ts`
- `src/lib/agent/verified-action.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/agent-tool-governance.test.ts`
- `src/__tests__/agent-quality-runtime-foundation.test.ts`
- `src/__tests__/agent-repair-policy.test.ts`
- `src/__tests__/file-export-verified-write.test.ts`
- `src/__tests__/resume-save-guard.test.ts`

### 从现有测试读到的行为
- agent-tool-governance.test.ts 已覆盖每个 registered tool 必须有治理元数据、缺元数据默认拒绝和 read-back requirement 绑定 completion gate。
- file-export-verified-write.test.ts 已证明文件导出必须有 size/hash/read-back 证据才可声明成功。
- resume-save-guard.test.ts 已覆盖无工具成功时改写保存成功话术，以及 legacy save 走 proposal/read-back。

### 待补 eval 缺口
- 补动态 MCP 工具进入 registry 后的 governance eval。
- 补所有 action tool 风险分类和 governance metadata 的一致性表。
- 补最终 assistant 文案中 success gate 的集成 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补动态 MCP 工具进入 registry 后的 governance eval

**为什么要补**: 这是当前 tool registry、tool-governance、readback-verification 和 successCriteria 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-tool-governance.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`、`src/__tests__/agent-repair-policy.test.ts`、`src/__tests__/file-export-verified-write.test.ts`、`src/__tests__/resume-save-guard.test.ts`。
- fixture 必须包含：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash。
- 断言必须读取：auditToolGovernance 结果、ToolResult、read-back proof 和 file hash。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补所有 action tool 风险分类和 governance metadata 的一致性表

**为什么要补**: 这是当前 tool registry、tool-governance、readback-verification 和 successCriteria 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-tool-governance.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`、`src/__tests__/agent-repair-policy.test.ts`、`src/__tests__/file-export-verified-write.test.ts`、`src/__tests__/resume-save-guard.test.ts`。
- fixture 必须包含：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash。
- 断言必须读取：auditToolGovernance 结果、ToolResult、read-back proof 和 file hash。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补最终 assistant 文案中 success gate 的集成 eval

**为什么要补**: 这是当前 tool registry、tool-governance、readback-verification 和 successCriteria 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/agent-tool-governance.test.ts`、`src/__tests__/agent-quality-runtime-foundation.test.ts`、`src/__tests__/agent-repair-policy.test.ts`、`src/__tests__/file-export-verified-write.test.ts`、`src/__tests__/resume-save-guard.test.ts`。
- fixture 必须包含：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash。
- 断言必须读取：auditToolGovernance 结果、ToolResult、read-back proof 和 file hash。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 Agent工具治理与读回校验 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 所有注册工具 auditToolGovernance 返回空问题

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 每个注册工具都有治理元数据，缺失元数据的工具在测试和开发环境默认拒绝。 2. 只读任务不会调用写入工具，高风险写入不会越过确认。 3. 写入、导出、Admin 动作都带读回证据，读回失败不允许成功提示。 4. Agent 聊天页、业务页面、数据库记录和 run ledger 对同一动作的状态一致。
- # Agent 工具治理、读回校验与跨页面写入一致性的产品构造
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“所有注册工具 auditToolGovernance 返回空问题”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“所有注册工具 auditToolGovernance 返回空问题”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“所有注册工具 auditToolGovernance 返回空问题”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: binds governance read-back requirements to the runtime success gate
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: classifies every registered action tool

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. 高风险工具绑定 requiresReadBack

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢把 Agent 工具分成可读、可建议、可写入、高风险写入、导出、Admin、内部能力几类。用户看到的是一条聊天回复或一张工具卡片，系统内部实际在处理任务类型、Agent 身份、目标文档、用户确认、读回校验和成功证据。
- `agent-tool-governance.test.ts` 专门覆盖这些边界：缺少治理元数据的工具默认拒绝；只读任务不能调用高风险写入；澄清阶段不能抢先写；保存优秀简历必须先确认岗位类别。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“高风险工具绑定 requiresReadBack”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“高风险工具绑定 requiresReadBack”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“高风险工具绑定 requiresReadBack”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: blocks read-only advice from claiming resume saves through save tools
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: classifies every registered action tool

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. task contract successCriteria 控制最终成功

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 纸鸢把 Agent 工具分成可读、可建议、可写入、高风险写入、导出、Admin、内部能力几类。用户看到的是一条聊天回复或一张工具卡片，系统内部实际在处理任务类型、Agent 身份、目标文档、用户确认、读回校验和成功证据。
- 这不是一个后台技术开关，而是用户信任机制。比如用户问“我现在的简历是什么”，Agent 只能读简历；用户说“把这段经历改进一下”，Agent 可以生成提案；用户确认后，系统才允许应用提案并用 hash 读回证明写入成功。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“task contract successCriteria 控制最终成功”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“task contract successCriteria 控制最终成功”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“task contract successCriteria 控制最终成功”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. file_export 要求 file hash verified

**状态**: 已有自动化覆盖

**项目依据**:
- 第三类是假成功。文件导出、JD 报告保存、简历提案应用、Offer 报告保存都不能靠“我已完成”判断。项目要求写入后读回目标记录、文件大小或 hash，再允许前端显示完成状态。
- 纸鸢把 Agent 工具分成可读、可建议、可写入、高风险写入、导出、Admin、内部能力几类。用户看到的是一条聊天回复或一张工具卡片，系统内部实际在处理任务类型、Agent 身份、目标文档、用户确认、读回校验和成功证据。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“file_export 要求 file hash verified”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“file_export 要求 file hash verified”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“file_export 要求 file hash verified”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 缺治理元数据工具默认拒绝

**状态**: 已有自动化覆盖

**项目依据**:
- `agent-tool-governance.test.ts` 专门覆盖这些边界：缺少治理元数据的工具默认拒绝；只读任务不能调用高风险写入；澄清阶段不能抢先写；保存优秀简历必须先确认岗位类别。
- 1. 每个注册工具都有治理元数据，缺失元数据的工具在测试和开发环境默认拒绝。 2. 只读任务不会调用写入工具，高风险写入不会越过确认。 3. 写入、导出、Admin 动作都带读回证据，读回失败不允许成功提示。 4. Agent 聊天页、业务页面、数据库记录和 run ledger 对同一动作的状态一致。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“缺治理元数据工具默认拒绝”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“缺治理元数据工具默认拒绝”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“缺治理元数据工具默认拒绝”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: binds governance read-back requirements to the runtime success gate
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: classifies every registered action tool

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. guidance contract 禁止 high-risk write

**状态**: 已有自动化覆盖

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“guidance contract 禁止 high-risk write”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“guidance contract 禁止 high-risk write”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“guidance contract 禁止 high-risk write”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: maps self-positioning to guidance instead of profile write
- `src/__tests__/agent-tool-governance.test.ts`: blocks high-risk writes during guidance contracts
- `src/__tests__/agent-tool-governance.test.ts`: blocks high-risk writes while a route still needs clarification
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: treats current resume lookup as read-only instead of a resume write

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 澄清阶段禁止写入

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- `agent-tool-governance.test.ts` 专门覆盖这些边界：缺少治理元数据的工具默认拒绝；只读任务不能调用高风险写入；澄清阶段不能抢先写；保存优秀简历必须先确认岗位类别。
- # Agent 工具治理、读回校验与跨页面写入一致性的产品构造
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“澄清阶段禁止写入”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“澄清阶段禁止写入”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“澄清阶段禁止写入”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. resume_query 禁止保存工具

**状态**: 已有自动化覆盖

**项目依据**:
- `agent-tool-governance.test.ts` 专门覆盖这些边界：缺少治理元数据的工具默认拒绝；只读任务不能调用高风险写入；澄清阶段不能抢先写；保存优秀简历必须先确认岗位类别。
- 第一类是越权写入。用户只是咨询简历现状，Agent 却调用 `save_resume_section` 或 `apply_resume_edit_proposal`，把未确认内容写进简历。项目里已经用 `resume-save-guard` 和工具治理把“读取、生成草稿、创建提案、应用提案”分开。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“resume_query 禁止保存工具”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“resume_query 禁止保存工具”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“resume_query 禁止保存工具”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: keeps resume query contracts read-only
- `src/__tests__/agent-tool-governance.test.ts`: requires category confirmation before saving excellent resume memory

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. read-back mismatch 后仍保留成功文案

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢把 Agent 工具分成可读、可建议、可写入、高风险写入、导出、Admin、内部能力几类。用户看到的是一条聊天回复或一张工具卡片，系统内部实际在处理任务类型、Agent 身份、目标文档、用户确认、读回校验和成功证据。
- 这不是一个后台技术开关，而是用户信任机制。比如用户问“我现在的简历是什么”，Agent 只能读简历；用户说“把这段经历改进一下”，Agent 可以生成提案；用户确认后，系统才允许应用提案并用 hash 读回证明写入成功。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“read-back mismatch 后仍保留成功文案”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“read-back mismatch 后仍保留成功文案”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“read-back mismatch 后仍保留成功文案”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: binds governance read-back requirements to the runtime success gate
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: does not allow read-back mismatch to report success
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: allows final resume success through an applied proposal with read-back evidence
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: detects missing read-back evidence for high-risk action tools

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. export_file 缺 sha256 仍成功

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢把 Agent 工具分成可读、可建议、可写入、高风险写入、导出、Admin、内部能力几类。用户看到的是一条聊天回复或一张工具卡片，系统内部实际在处理任务类型、Agent 身份、目标文档、用户确认、读回校验和成功证据。
- 第三类是假成功。文件导出、JD 报告保存、简历提案应用、Offer 报告保存都不能靠“我已完成”判断。项目要求写入后读回目标记录、文件大小或 hash，再允许前端显示完成状态。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“export_file 缺 sha256 仍成功”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“export_file 缺 sha256 仍成功”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“export_file 缺 sha256 仍成功”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/file-export-verified-write.test.ts`: writes exported files and returns read-back size/hash evidence
- `src/__tests__/file-export-verified-write.test.ts`: requires file hash evidence before a file export task can claim success
- `src/__tests__/file-export-verified-write.test.ts`: rejects server export tool success when read-back hash evidence is absent

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. save_resume_section 绕过 proposal

**状态**: 已有自动化覆盖

**项目依据**:
- 第一类是越权写入。用户只是咨询简历现状，Agent 却调用 `save_resume_section` 或 `apply_resume_edit_proposal`，把未确认内容写进简历。项目里已经用 `resume-save-guard` 和工具治理把“读取、生成草稿、创建提案、应用提案”分开。
- 这个系统解决的是纸鸢 Agent 产品化里最容易出错的一件事：Agent 不是只能回答问题，它还会评估 JD、保存报告、生成文件、修改简历、写入画像、评估 Offer、创建面试会话、保存优秀简历素材。只要 Agent 可以写数据，就必须有“它能不能做、什么时候能做、做完怎么证明”的产品规则。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“save_resume_section 绕过 proposal”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“save_resume_section 绕过 proposal”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“save_resume_section 绕过 proposal”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: keeps resume query contracts read-only
- `src/__tests__/agent-tool-governance.test.ts`: requires category confirmation before saving excellent resume memory
- `src/__tests__/agent-tool-governance.test.ts`: blocks read-only advice from claiming resume saves through save tools
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: treats current resume lookup as read-only instead of a resume write

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 新工具无治理元数据也通过测试

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 每个注册工具都有治理元数据，缺失元数据的工具在测试和开发环境默认拒绝。 2. 只读任务不会调用写入工具，高风险写入不会越过确认。 3. 写入、导出、Admin 动作都带读回证据，读回失败不允许成功提示。 4. Agent 聊天页、业务页面、数据库记录和 run ledger 对同一动作的状态一致。
- `agent-tool-governance.test.ts` 专门覆盖这些边界：缺少治理元数据的工具默认拒绝；只读任务不能调用高风险写入；澄清阶段不能抢先写；保存优秀简历必须先确认岗位类别。
- 主要实现面：`src/lib/agent/tool-governance.ts`、`src/lib/agent/task-contract.ts`、`src/lib/agent/tools/readback-verification.ts`、`src/lib/agent/tools/action-tool-risk.ts`。

**输入/fixture**:
- 正例：已注册工具、带 read-back 的高风险写入、file_export，用来验证“新工具无治理元数据也通过测试”的成功路径。
- 反例：缺治理元数据工具、guidance contract、高风险写入、澄清阶段，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：toolName、effect、risk、requiresReadBack、successCriteria 和 verification hash；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 tool registry、tool-governance、readback-verification 和 successCriteria 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“新工具无治理元数据也通过测试”对应动作，并记录请求、工具调用或页面状态。
3. 读取 auditToolGovernance 结果、ToolResult、read-back proof 和 file hash，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“新工具无治理元数据也通过测试”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 Agent工具治理与读回校验 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: binds governance read-back requirements to the runtime success gate
- `src/__tests__/agent-quality-runtime-foundation.test.ts`: classifies every registered action tool

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/agent-tool-governance.test.ts`
  - classifies every registered tool with governance metadata
  - does not have high-priority route conflicts
  - default-denies tools missing governance metadata in tests and development
  - binds governance read-back requirements to the runtime success gate
  - maps self-positioning to guidance instead of profile write
  - blocks high-risk writes during guidance contracts
  - keeps resume query contracts read-only
  - blocks high-risk writes while a route still needs clarification
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
- `src/__tests__/agent-repair-policy.test.ts`
  - retries transient failures only within the configured limit
  - blocks validation failures before writes
  - requires rollback or failure when read-back verification mismatches
  - asks one clarification question for unclear intent or version conflicts
  - requires explicit approval for destructive risk and denies policy violations
- `src/__tests__/file-export-verified-write.test.ts`
  - writes exported files and returns read-back size/hash evidence
  - requires file hash evidence before a file export task can claim success
  - rejects server export tool success when read-back hash evidence is absent
  - verifies PDF bytes and SHA-256 before reporting a PDF download as ready
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


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- Agent工具治理与读回校验 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
