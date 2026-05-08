## ADDED Requirements

### Requirement: Agent Loop 循环执行

Agent Loop 引擎 SHALL 实现 Think → Act → Observe 循环，支持多轮迭代直到任务完成或达到终止条件。

#### Scenario: 单轮迭代

- **WHEN** LLM 在一次 thinking 后决定直接回复（无需工具）
- **THEN** Loop 不执行工具调用，直接进入 responding 阶段
- **AND** 迭代次数为 1

#### Scenario: 多轮迭代

- **WHEN** LLM 调用工具 → 获取结果 → 基于结果决定继续调用另一个工具
- **THEN** Loop 执行多次 Think→Act→Observe 循环
- **AND** 每次迭代的工具结果注入下一轮上下文

#### Scenario: 达到最大迭代次数

- **WHEN** Loop 执行次数达到 maxIterations（默认 5）
- **THEN** Loop 强制终止
- **AND** 输出当前已获取的所有结果
- **AND** 不发起新的工具调用

#### Scenario: 工具连续失败

- **WHEN** 连续 2 次工具调用返回 success=false
- **THEN** 当前任务终止
- **AND** 如果还有其他任务，跳到下一个
- **AND** 如果没有其他任务，输出已有结果

#### Scenario: 上下文溢出保护

- **WHEN** 消息列表超过上下文预算
- **THEN** 截断早期消息，保留最近 15 条
- **AND** Loop 继续执行

### Requirement: Loop 配置

Agent Loop SHALL 支持可配置参数，通过 LoopConfig 注入。

#### Scenario: 默认配置

- **WHEN** 不提供自定义配置
- **THEN** maxIterations=5, maxToolCallsPerTask=3, qualityGate=true

#### Scenario: 自定义配置

- **WHEN** 提供 LoopConfig 对象
- **THEN** Loop 使用自定义的 maxIterations、工具白名单、quality gate 开关

### Requirement: Quality Gate

Agent Loop SHALL 在最终输出前执行质量自检，不通过则继续迭代。

#### Scenario: 自检通过

- **WHEN** 回复基于工具数据、回答所有问题、给出具体建议
- **THEN** Quality Gate 通过，输出最终回复

#### Scenario: 自检不通过

- **WHEN** 回复缺少数据支撑或未回答所有问题
- **THEN** Quality Gate 不通过，agent 再执行一轮 thinking
- **AND** 最多额外迭代 1 轮

### Requirement: Loop 事件流

Agent Loop SHALL 通过异步生成器产出类型化事件，驱动 SSE 输出。

#### Scenario: 事件顺序

- **WHEN** Loop 执行多轮迭代
- **THEN** 事件按序产出：thinking → (tool_call → tool_result → thinking)* → responding → done
- **AND** 事件类型包含 phase / tool_call / tool_result / text / done

#### Scenario: 探索模式不走 Loop

- **WHEN** mode 为 explore
- **THEN** 不使用 Agent Loop，直接走原始流式回复逻辑
