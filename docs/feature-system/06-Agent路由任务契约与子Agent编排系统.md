# 纸鸢求职助手 Agent 路由、任务契约与子 Agent 编排系统的产品构造

纸鸢求职助手的 Agent 系统不是“一个大模型回答所有问题”。它把用户意图、图片类型、当前任务状态、Agent registry、工具白名单、任务契约、读回验证和运行循环组合起来，让不同求职任务进入不同的 Agent 和不同的工具边界。

所以 `Agent路由与任务契约系统` 和 `子Agent体系与编排器` 不应该拆开写。真实运行链路是连续的：先判断用户要做什么，再选择 Agent，再确定任务类型和允许工具，再进入编排器和 server runner，最后用任务契约判断能不能声称完成。

## 1. 产品定位

纸鸢里有很多看起来都像“跟 AI 说一句话”的任务：

- 评估 JD。
- 查看当前简历。
- 修改简历。
- 保存优秀简历。
- 更新求职画像。
- 做职业定位。
- 生成面试题。
- 评估 Offer。
- 对比多个 Offer。
- 导出文件。

这些任务的风险完全不同。查看简历是只读，修改简历是高风险写入；问 Offer 谈判策略应读取已有报告，首次评估 Offer 才应保存新报告；面试准备要保持当前 JD 和简历快照。

Agent 路由与编排系统的产品目标是：让用户自然表达需求，但系统内部必须把需求落到正确的任务边界。

```text
用户输入 / 图片 / 当前任务状态
  -> 意图分类
  -> 任务类型
  -> Agent 选择
  -> 工具白名单
  -> 任务契约
  -> Agent loop 执行
  -> 工具结果
  -> 完成条件判断
```

## 2. 为什么不能只靠模型自己判断

如果只让模型自己决定要不要调用工具，产品会出现几个严重问题。

第一，模型可能把只读问题当成写入任务。例如用户问“我现在的简历是什么”，系统应该读取简历，而不是创建简历修改提案。

第二，模型可能把截图路由错。JD 截图应该进入 JD 评估，Offer 截图应该进入 Offer 评估，简历截图如果没有编辑意图应走简历只读处理。

第三，模型可能在工具失败后仍说“已完成”。文件导出、报告保存、简历写入都必须有读回证据。

第四，不同 Agent 的工具边界不同。Offer Agent 不应该随便修改简历，Profile Agent 不应该默认调用 Offer 评估工具。

所以系统必须用代码层路由和任务契约约束模型行为。

## 3. 核心代码边界

| 能力 | 项目文件 | 产品含义 |
|---|---|---|
| 任务路由 | `src/lib/agent/task-routing.ts` | 根据 agentId、用户文本、图片识别和当前任务判断任务类型 |
| 任务契约 | `src/lib/agent/task-contract.ts` | 定义任务成功条件、校验器和完成判断 |
| Agent registry | `src/lib/agent/registry/index.ts`、`src/lib/agent/registry/types.ts` | 注册 general、evaluate、resume、profile、interview、offer 等 Agent |
| Agent 定义 | `src/lib/agent/registry/agents/*` | 每个 Agent 的名称、描述、工具列表和提示词边界 |
| 编排器 | `src/lib/agent/orchestrator/index.ts` | 分类意图、加载 Agent、过滤工具、进入运行循环 |
| LLM 意图分类 | `src/lib/agent/classify-intent-llm.ts` | 使用模型分类 Agent，失败后 fallback |
| Server runner | `src/lib/agent/loop/server-runner.ts` | 执行模型调用、工具调用、治理、SSE 事件 |
| 工具治理 | `src/lib/agent/tool-governance.ts` | 根据任务类型限制工具 |

这些文件共同构成 Agent 系统的“控制层”。

## 4. 子 Agent registry

当前 registry 里有多个 Agent 定义：

| Agent | 文件 | 产品职责 |
|---|---|---|
| general | `general-agent.ts` | 通用问答、任务入口、无法归类任务 |
| evaluate | `evaluate-agent.ts` | JD 评估、岗位分析、报告生成 |
| resume | `resume-agent.ts` | 简历读取、优化、提案与保存边界 |
| profile | `profile-agent.ts` | 求职画像、自我定位、偏好与信号沉淀 |
| interview | `interview-agent.ts` | 面试准备、问题生成、评分和复盘 |
| offer | `offer-agent.ts` | Offer 评估、对比、谈判和 HR 问题 |

这里的“子 Agent”不是独立部署的多个服务，而是 registry 里的任务角色。每个 Agent 有自己的工具集合和提示词约束，编排器会把当前用户请求交给合适的 Agent。

## 5. 意图分类

`classify-intent-llm.ts` 使用模型做意图分类，要求只输出 JSON：

```json
{"agentId": "...", "reason": "一句话中文"}
```

分类器的提示词里有明确规则，例如：

- 用户说“评估 JD”“分析职位”“看看岗位”进入 `evaluate`。
- 用户说 Offer 值不值得接进入 `offer`。
- 用户说面试准备进入 `interview`。
- 用户说简历优化进入 `resume`。

分类器还有两个重要机制：

- `detectModelTier()` 会根据用户请求判断默认或更强模型层级。
- 如果 LLM 分类失败，会 fallback 到 registry 里的规则分类。

这保证路由不完全依赖一次模型输出。

## 6. 图片路由

`task-routing.ts` 会结合 `ImageIntakeResult` 判断图片任务。

当前测试覆盖了几类情况：

- JD 图片进入 `jd_evaluation`，允许 `evaluate_jd_full`。
- Offer 图片进入 `offer_evaluation`，允许 `evaluate_offer`。
- 简历截图如果没有编辑意图，进入 `resume_query`，不允许 `evaluate_jd_full` 或 `evaluate_offer`。
- 图片意图不清楚时进入澄清或重试，而不是强行执行。

这解释了为什么图片识别不只是 OCR。识别完还要判断“这张图要触发什么业务任务”。

## 7. 任务类型

`task-contract.ts` 定义了当前 Agent 任务类型：

```text
profile_update
career_positioning_guidance
resume_query
resume_edit
jd_evaluation
offer_evaluation
reference_resume_save
interview_coaching
file_export
```

这些类型代表产品风险边界。

| 任务类型 | 产品风险 | 典型工具 |
|---|---|---|
| `resume_query` | 只读 | `read_file` 等读取工具 |
| `resume_edit` | 高风险写入 | `create_resume_edit_proposal`、`apply_resume_edit_proposal` |
| `jd_evaluation` | 报告写入 | `evaluate_jd_full` |
| `offer_evaluation` | Offer 与报告写入 | `evaluate_offer` |
| `profile_update` | 用户画像写入 | `mine_profile` |
| `career_positioning_guidance` | 指导，不应误写 | `self_positioning`、`get_profile` |
| `reference_resume_save` | 参考简历资产写入 | `save_reference_resume` |
| `interview_coaching` | 会话状态写入 | `generate_interview_questions` |
| `file_export` | 文件系统写入 | `export_file`、`download_report_pdf` |

## 8. 任务路由规则

`routeAgentTask()` 的输入包括：

- `agentId`
- `content`
- `imageIntake`
- `preferredDocumentType`
- `activeTask`

它会按顺序处理：

1. 图片识别结果。
2. 图片澄清回复。
3. 当前 guided session 是否锁定任务。
4. Agent id 和 documentType。
5. 特定文本意图，例如参考简历保存、自我定位、简历编辑、简历只读。
6. fallback 到 general no contract。

输出是 `AgentTaskRouteDecision`：

```text
taskType
contractPolicy
allowedTools
memoryTask
imageDecision
auditSummary
```

这份决策会进入后续工具治理和任务契约。

## 9. 工具白名单

任务路由会通过 `listToolNamesForTask()` 得到允许工具。

这意味着工具不是模型想调就调，而是由当前任务类型限制。

例如：

- `resume_query` 不允许 `apply_resume_edit_proposal`。
- `offer_evaluation` 允许 `evaluate_offer`。
- `career_positioning_guidance` 不允许 `evaluate_offer`。
- `interview_coaching` 允许 `generate_interview_questions`。

`agent-task-routing.test.ts` 里多处验证这些边界，尤其是防止画像指导、简历只读和 Offer 工具互相串线。

## 10. 任务契约

`createAgentTaskContract()` 会为任务创建完成条件。

契约包含：

- `taskType`
- `taskId`
- `baseSnapshot`
- `requiresUserApproval`
- `successCriteria`
- `validators`
- `routeLocked`
- `allowedTools`

默认成功条件按任务类型不同而不同。产品上最重要的例子有：

| 任务 | 成功条件含义 |
|---|---|
| 简历修改 | 需要草稿、用户确认、写入和 read-back |
| JD 评估 | 需要报告板块、评分、报告编号和读回 |
| Offer 评估 | 需要 Offer 报告、模块评分、报告编号和读回 |
| 参考简历保存 | 需要保存 ID 和读回证据 |
| 面试准备 | 需要生成问题并更新会话状态 |
| 文件导出 | 需要文件存在、大小和 hash |

这解决的是一个 AI 产品核心问题：模型说“完成”不等于任务真的完成。

## 11. 完成条件判断

`inferCompletedCriteriaFromToolResult()` 会根据工具结果提取完成证据。

例如：

- JD 评估工具返回 `reportNum`，才能满足报告保存条件。
- Offer 评估工具返回 `data.id` 或 `uiPayload.reportId`，才能说明报告存在。
- 文件导出必须有 `readBackVerified`、`size`、`sha256` 和文件名。
- 简历提案必须有对应提案和读回信息。

如果条件不满足，`evaluateTaskContractCompletion()` 会返回 `canClaimSuccess = false`，并生成安全回复，阻止助手伪造完成。

## 12. 编排器运行链路

`src/lib/agent/orchestrator/index.ts` 做的是运行前编排：

```text
接收用户内容和上下文
  -> 根据图片或 forcedAgentId 初步选择 Agent
  -> 调用 /api/agent/classify 或 fallback classifyIntent
  -> getAgentById 加载 Agent 定义
  -> 加载 agent.md / soul 提示词
  -> 取 Agent toolNames
  -> 从工具 registry 里过滤可用工具
  -> 调用 agentLoopServer
```

这条链路说明“子 Agent 编排”不是让多个 Agent 自由对话，而是由编排器选择当前任务最合适的 Agent，并把工具集合收窄。

## 13. Server runner

`server-runner.ts` 是实际运行循环。它负责：

- 调用模型。
- 执行工具。
- 格式化工具结果。
- 检查工具结果质量。
- 应用工具治理。
- 判断错误类别。
- 通过 SSE 事件把阶段、工具、文本、错误、完成状态返回前端。

它还定义了结果质量：

```text
good
empty
irrelevant
garbled
```

这对纸鸢很重要，因为项目里曾出现过 OCR 或工具结果乱码、空跑、无效内容等问题。Runner 不能把这些当作正常完成。

## 14. 当前运行边界

`agent-runtime-adapter.test.ts` 验证了一个现实边界：当前 orchestrator runtime adapter 对 durable run 的 resume 返回明确错误，说明“durable runs cannot resume yet”。取消未知 run id 可以不抛错。

这说明文档不能把当前系统写成已经完整支持后台长期恢复的 Agent 运行平台。当前更准确的说法是：前端会话可以保存和恢复，Agent run 有审计和状态，但 durable run resume 还不是完整能力。

## 15. 用户链路

完整链路如下：

```text
用户在 Agent Chat 输入自然语言或上传图片
  -> 前端带上当前会话、图片、guided session、URL 参数
  -> 路由层判断任务类型
  -> 编排器选择 Agent
  -> 工具白名单限制可调用工具
  -> 任务契约定义成功条件
  -> server runner 调用模型和工具
  -> 工具结果进入 SSE 和会话
  -> 契约判断能否宣称完成
  -> 前端展示文本、工具卡片和状态
```

这条链路的价值是把自然语言请求变成有边界、有工具、有证据的产品动作。

## 16. 失败模式

| 失败点 | 典型表现 | 正确处理 |
|---|---|---|
| LLM 分类失败 | 无法返回合法 JSON | fallback 到规则分类 |
| 图片路由不清楚 | 不知道是 JD、Offer 还是简历 | 进入澄清或重试 |
| 当前任务锁定 | 用户短回复被误路由 | guided session 保持原任务 |
| 只读问题误写入 | 问当前简历却创建修改提案 | `resume_query` 只允许读工具 |
| 工具结果缺证据 | 模型说完成但没有报告 ID | 契约阻止完成声明 |
| 文件导出无 hash | 文件可能没写成 | `file_export` 不满足完成条件 |
| durable run 恢复 | 当前尚不支持 | 明确返回不可恢复错误 |

## 17. 测试与证据

相关测试包括：

- `src/__tests__/agent-task-routing.test.ts`：验证画像、简历、JD 图片、Offer 图片、面试、任务切换等路由边界。
- `src/__tests__/agent-runtime-adapter.test.ts`：验证当前 runtime resume 边界和 cancel 行为。
- `src/__tests__/interview-agent-prompt.test.ts`：验证 Interview Agent prompt 使用 active interview session state。

这些测试说明 Agent 系统的质量不只是“能回答”，而是路由正确、工具受限、任务完成有证据。

## 18. 产品总结

纸鸢 Agent 路由与编排系统可以理解为六层：

```text
意图层：LLM 分类、规则 fallback、图片路由
任务层：AgentTaskType、guided session、active task
角色层：general / evaluate / resume / profile / interview / offer
工具层：toolNames、allowedTools、tool governance
契约层：successCriteria、validators、read-back
运行层：server-runner、SSE、工具结果质量
```

它的产品价值是让 AI Agent 从“会说话”变成“按正确边界做事”：用户可以自然表达，但系统必须决定该读、该写、该问、该评估、该导出，且只有完成条件满足时才能说完成。
