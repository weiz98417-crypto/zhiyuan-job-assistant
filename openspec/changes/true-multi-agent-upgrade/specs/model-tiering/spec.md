## ADDED Requirements

### Requirement: Agent 级别模型声明

每个 agent 的 AgentDefinition SHALL 包含 `model` 字段，声明其默认使用的 LLM 模型。
可选的 `model_pro` 字段声明升级模式使用的模型。

#### Scenario: agent 使用声明的模型
- **WHEN** evaluate agent 运行 ReAct loop
- **THEN** `callLLM()` 使用 agent 声明的 `model`（deepseek-v4-flash）

#### Scenario: agent 未声明 model
- **WHEN** agent 的 model 字段为空或 undefined
- **THEN** 使用 MODEL_CHAIN 的第一个可用模型（fallback 行为）

### Requirement: 模型分级分配

系统 SHALL 按以下默认分配模型：

| Agent | model | model_pro |
|-------|-------|-----------|
| orchestrator | deepseek-v4-flash | - |
| evaluate | deepseek-v4-flash | deepseek-v4-pro |
| resume | deepseek-v4-pro | - |
| interview | deepseek-v4-pro | - |
| profile | deepseek-v4-flash | - |
| general | deepseek-v4-flash | - |

#### Scenario: 简历 agent 总是用 Pro
- **WHEN** 用户触发简历相关操作（生成、优化、ATS 检查）
- **THEN** resume agent 使用 deepseek-v4-pro，不受用户措辞影响

#### Scenario: 评估 agent 默认用 Flash
- **WHEN** 用户说"帮我评估这个JD"（无"深度"等关键词）
- **THEN** evaluate agent 使用 deepseek-v4-flash

#### Scenario: 深度评估升级到 Pro
- **WHEN** orchestrator 分类时检测到用户说"深度评估""仔细分析"等措辞
- **THEN** 返回 `modelTier: "pro"`
- **AND** evaluate agent 使用 deepseek-v4-pro

### Requirement: MODEL_CHAIN fallback 不变

当 agent 声明的 model 不可用时，SHALL 按 MODEL_CHAIN 顺序 fallback 到下一个可用模型。
Fallback 时输出 warning 日志，记录原始 model 和实际使用的 model。

#### Scenario: 指定模型不可用
- **WHEN** evaluate agent 声明使用 deepseek-v4-flash 但 API 返回 5xx
- **THEN** `callLLM()` 自动 fallback 到 glm-4.6v-flashx
- **AND** 日志记录：`Model deepseek-v4-flash unavailable, fallback to glm-4.6v-flashx`

#### Scenario: 所有模型都不可用
- **WHEN** MODEL_CHAIN 中所有模型均不可用
- **THEN** `callLLM()` 抛出 error
- **AND** agent loop 向用户返回友好的错误信息
