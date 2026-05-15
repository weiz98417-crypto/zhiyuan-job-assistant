## MODIFIED Requirements

### Requirement: Quality Gate

Agent Loop SHALL 基于 ToolResult.errorCategory 决定工具执行后的行为,替代基于 qualityHint 字符串拼接的方式。

#### Scenario: 自检通过(ok)

- **WHEN** 工具返回 errorCategory="ok" 且结果可基于分析回答
- **THEN** Quality Gate 通过,进入 responding 阶段输出最终回复

#### Scenario: 临时故障重试(transient)

- **WHEN** 工具返回 errorCategory="transient"
- **THEN** Agent Loop 增加 autoRetryCount
- **AND** 若 autoRetryCount ≤ MAX_AUTO_RETRY,继续下一轮 thinking 重试
- **AND** 若超过,强制 responding 并告知用户"服务暂不可用"

#### Scenario: 永久故障降级(permanent)

- **WHEN** 工具返回 errorCategory="permanent"
- **THEN** Agent Loop 不增加 autoRetryCount
- **AND** 直接进入 responding 阶段
- **AND** 输出工具返回的 error 信息给用户

#### Scenario: 需要用户输入降级(need_user_input)

- **WHEN** 工具返回 errorCategory="need_user_input"
- **THEN** Agent Loop 不增加 autoRetryCount
- **AND** 直接进入 responding 阶段
- **AND** LLM 应直接询问用户所需信息

#### Scenario: 向后兼容旧工具

- **WHEN** 工具未设置 errorCategory(旧工具)
- **THEN** success=true 视为 "ok"
- **AND** success=false 视为 "transient"(保持旧行为的可重试)
