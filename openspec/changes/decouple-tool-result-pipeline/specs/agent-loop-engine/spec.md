## MODIFIED Requirements

### Requirement: Agent Loop 循环执行

Agent Loop 引擎 SHALL 实现 Think → Act → Observe 循环，支持多轮迭代直到任务完成或达到终止条件。

#### Scenario: 单轮迭代

- **WHEN** LLM 在一次 thinking 后决定直接回复（无需工具）
- **THEN** Loop 不执行工具调用，直接进入 responding 阶段
- **AND** 迭代次数为 1

#### Scenario: 多轮迭代

- **WHEN** LLM 调用工具 → 获取结果 → 基于结果决定继续调用另一个工具
- **THEN** Loop 执行多次 Think→Act→Observe 循环
- **AND** 每次迭代的 `llmSummary` 注入下一轮上下文

#### Scenario: 达到最大迭代次数

- **WHEN** Loop 执行次数达到 maxIterations（默认 5）
- **THEN** Loop 强制终止
- **AND** 输出当前已获取的所有结果
- **AND** 不发起新的工具调用

#### Scenario: 工具连续失败

- **WHEN** 连续 2 次工具调用返回 success=false 且 errorCategory 为 permanent
- **THEN** 当前任务终止
- **AND** 如果还有其他任务，跳到下一个
- **AND** 如果没有其他任务，输出已有结果

#### Scenario: 工具 transient 失败可重试

- **WHEN** 工具调用返回 success=false 且 errorCategory 为 transient
- **THEN** agent loop 自动重试最多 2 次
- **AND** transient 失败不计入连续失败计数

#### Scenario: 上下文溢出保护

- **WHEN** 消息列表超过上下文预算（MAX_CONTEXT_TOKENS，默认 64000 字符）
- **THEN** 截断早期消息，保留最近 15 条
- **AND** Loop 继续执行

### Requirement: Loop 配置

Agent Loop SHALL 支持可配置参数，通过 LoopConfig 注入。

#### Scenario: 默认配置

- **WHEN** 不提供自定义配置
- **THEN** maxIterations=5, maxToolCallsPerTask=3, qualityGate=true, maxContextTokens=64000, defaultToolCtxCap=800

#### Scenario: 自定义配置

- **WHEN** 提供 LoopConfig 对象
- **THEN** Loop 使用自定义的 maxIterations、工具白名单、quality gate 开关、上下文预算
