## ADDED Requirements

### Requirement: 工具错误作为 Observation

系统 SHALL 将工具错误作为结构化 Observation 返回给 LLM,让模型自主处理用户沟通。Agent Loop SHALL NOT 替代模型生成用户提示。

#### Scenario: 乱码错误由模型告知用户

- **WHEN** read_file 返回 errorCategory="permanent" 且 error 为 "文件编码异常"
- **THEN** Observation 注入 `[TOOL_ERROR category=permanent] 文件编码异常`
- **AND** LLM 在下一轮生成自然告知:"这个文件显示为乱码,可能是编码不兼容。你可以..."
- **AND** 不是引擎硬编码的 GARBLED_RECOVERY_HINT

#### Scenario: 模型自主决定引导方式

- **WHEN** 收到 permanent 错误 Observation
- **THEN** 模型可选择:告知用户 + 建议替代方案 + 询问是否尝试其他方式
- **AND** 不受引擎固定提示限制

### Requirement: intermediate_steps 累积

Agent Loop SHALL 在每次工具执行后累积结构化步骤记录,用于超限时生成有意义的总结。

#### Scenario: 超限时输出步骤总结

- **WHEN** 循环达到 maxIterations
- **THEN** 输出 intermediate_steps 中每次尝试的工具名、参数摘要、错误类别
- **AND** 不输出空白"达到思考上限"

#### Scenario: 正常完成不清空步骤

- **WHEN** 循环正常结束
- **THEN** intermediate_steps 保留用于调试和日志
