## MODIFIED Requirements

### Requirement: Quality Gate

Agent Loop SHALL 在每次工具执行后检查结果质量,包含乱码检测,在最终输出前执行质量自检,不通过则根据结果类型选择重试或降级。

#### Scenario: 自检通过

- **WHEN** 回复基于工具数据、回答所有问题、给出具体建议
- **THEN** Quality Gate 通过,输出最终回复

#### Scenario: 自检不通过

- **WHEN** 回复缺少数据支撑或未回答所有问题
- **THEN** Quality Gate 不通过,agent 再执行一轮 thinking
- **AND** 最多额外迭代 1 轮

#### Scenario: 检测到乱码内容

- **WHEN** 工具返回的文本内容被 `isGarbledText()` 判定为编码异常
- **THEN** quality 标记为 "garbled"
- **AND** 不增加 autoRetryCount(编码问题不是搜索失败)
- **AND** qualityHint 指示 LLM 当前内容编码异常

#### Scenario: 文件读取类工具的 garbled 直接降级

- **WHEN** 工具名含 `get_reference` 或 `Read`,且结果为 garbled
- **THEN** 标记 recoverable=false,不可重试
- **AND** agent 直接进入 responding 阶段
- **AND** 输出引导用户粘贴文本或重新上传的信息
- **AND** 不消耗剩余 iteration

#### Scenario: 非文件读取工具的 garbled 允许一次 fallback

- **WHEN** 工具结果 quality 为 "garbled" 且工具非文件读取类
- **THEN** agent 可尝试一次替代方法(换工具/换参数)
- **AND** 替代方法仍返回 garbled 时直接降级到用户交互
