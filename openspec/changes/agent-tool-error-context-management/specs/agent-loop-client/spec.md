## MODIFIED Requirements

### Requirement: 工具结果质量检查

客户端 Agent Loop 中的质量检查 SHALL 基于 ToolResult.errorCategory 决定行为,使用 `ERROR_CATEGORY_ACTIONS` 表驱动逻辑替代当前分散的 if-else + qualityHint 字符串拼接。

#### Scenario: ok 结果继续

- **WHEN** 工具返回 errorCategory="ok"
- **THEN** 基于结果继续 Agent Loop 的正常思考流程

#### Scenario: transient 结果重试

- **WHEN** 工具返回 errorCategory="transient"
- **THEN** autoRetryCount 递增
- **AND** 未超过上限时 LLM 换参数重试

#### Scenario: permanent 结果降级

- **WHEN** 工具返回 errorCategory="permanent"
- **THEN** Agent Loop 直接进入 responding 阶段
- **AND** 输出错误信息给用户,不重试

#### Scenario: need_user_input 降级

- **WHEN** 工具返回 errorCategory="need_user_input"
- **THEN** Agent Loop 直接进入 responding 阶段
- **AND** 提示用户提供所需信息

#### Scenario: 旧工具 backward-compat

- **WHEN** 工具未设置 errorCategory
- **THEN** success 时视为 "ok",失败时视为 "transient"
