## ADDED Requirements

### Requirement: Agent Loop 由模型 finish_reason 驱动

Agent Loop SHALL 读取 DeepSeek API 返回的 `finish_reason` 决定循环继续还是停止,不再由 Harness 基于 `toolCalls.length===0` 自行判断。

#### Scenario: 模型要求继续调用工具

- **WHEN** finish_reason 为 "tool_calls"
- **THEN** Agent Loop 执行工具并继续下一轮循环
- **AND** 不因 toolCalls 数组为空而提前退出

#### Scenario: 模型给出最终回答

- **WHEN** finish_reason 为 "stop"
- **THEN** Agent Loop 进入 responding 阶段
- **AND** 退出 while 循环

#### Scenario: 模型输出被截断

- **WHEN** finish_reason 为 "length"
- **THEN** Agent Loop 将现有内容作为最终回答输出
- **AND** 标注内容可能不完整

### Requirement: 工具错误作为 Observation 返回模型

工具错误 SHALL 作为结构化 Observation 注入 LLM 上下文,由模型自主决定如何告知用户。Agent Loop 引擎 SHALL NOT 在 permanent/need_user_input 时 hard return。

#### Scenario: permanent 错误不硬退出

- **WHEN** 工具返回 errorCategory="permanent"
- **THEN** Agent Loop 将错误信息封装为 `[TOOL_ERROR]` Observation 注入上下文
- **AND** 继续 while 循环让模型生成自然语言的用户引导
- **AND** 不执行 `return` 或 `break`

#### Scenario: need_user_input 不硬退出

- **WHEN** 工具返回 errorCategory="need_user_input"
- **THEN** 同上,错误作为 Observation 发给模型
- **AND** 模型在下一轮生成询问用户的具体问题
