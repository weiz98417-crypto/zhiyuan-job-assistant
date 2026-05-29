## ADDED Requirements

### Requirement: 工具注册表

系统 SHALL 提供一个声明式的 Agent 工具注册表，每个工具包含名称、描述、参数定义、执行器和结果格式化器。

#### Scenario: 注册查询工具

- **WHEN** Agent 需要查询用户数据（如搜索投递历史、获取报告详情）
- **THEN** 工具注册表中存在对应的查询工具
- **AND** 每个查询工具通过 DexieDB 直接查询，不经过 HTTP API

#### Scenario: 注册行动工具

- **WHEN** Agent 需要调用外部 API（如评估 JD、生成面试题）
- **THEN** 工具注册表中存在对应的行动工具
- **AND** 每个行动工具通过 fetch 调用对应的 API 路由

#### Scenario: 工具参数校验

- **WHEN** Agent 调用工具时传入了无效参数
- **THEN** 工具执行器返回明确的错误信息
- **AND** 错误信息包含缺失的参数名或无效值

#### Scenario: 工具结果格式化

- **WHEN** 工具执行完成并返回结果
- **THEN** formatResult 将结果转换为 LLM 可读的文本摘要
- **AND** 摘要控制在 500 tokens 以内（避免 context 膨胀）

### Requirement: 工具列表注入 LLM

系统 SHALL 在执行模式下将可用工具列表注入 LLM system prompt，让 LLM 决定调用哪些工具。

#### Scenario: 执行模式工具注入

- **WHEN** Agent 处于执行模式（仪表盘推理或用户主动提问）
- **THEN** LLM system prompt 末尾注入可用工具列表
- **AND** 每个工具以 "工具名: 描述 (参数: ...)" 格式呈现
- **AND** 工具列表控制在 500 tokens 以内

#### Scenario: 探索模式无工具注入

- **WHEN** Agent 处于探索模式（/explore 页面聊天）
- **THEN** LLM system prompt 不注入工具列表
- **AND** 探索模式仅使用 BASE/DEEP 聊天框架

### Requirement: Agent 上下文组装

系统 SHALL 提供上下文组装功能，在 Agent 推理前并行查询 Memory、Knowledge 和当前状态。

#### Scenario: 仪表盘上下文组装

- **WHEN** Agent 被仪表盘加载事件触发
- **THEN** 上下文组装器并行查询：
- **AND** Memory: 最近 5 次 AgentInteraction
- **AND** Memory: 当前 AgentPreferenceModel
- **AND** Data: CareerProfile（画像）
- **AND** Data: Pipeline 快照（各阶段数量 + 健康状态）
- **AND** Knowledge: 行业知识（按用户目标角色筛选）
- **AND** 组装结果序列化为 ~1500 tokens 的文本注入 LLM prompt

#### Scenario: 评估完成后上下文组装

- **WHEN** Agent 被评估完成事件触发
- **THEN** 上下文组装器额外包含刚完成的评估报告摘要

### Requirement: 工具名中文化展示

Agent Chat 中所有工具调用相关的 UI 元素 SHALL 使用中文名展示，不再显示英文工具名。

#### Scenario: 工具结果卡片中文化

- **WHEN** Agent Chat 渲染工具执行结果（ToolResultCard）
- **THEN** 卡片头部 SHALL 显示 "{emoji} {中文名}" 格式
- **AND** 原始英文 toolName 不再直接显示给用户
- **AND** 成功状态显示"完成"，失败状态显示"失败"

#### Scenario: 执行指示器中文化

- **WHEN** Agent Chat 渲染"正在执行"指示器（ExecutingIndicator）
- **THEN** 工具名 SHALL 显示中文版本
- **AND** emoji 显示在工具名之前

#### Scenario: 未映射工具兜底

- **WHEN** 工具名在映射表中不存在
- **THEN** 系统 SHALL 显示原始英文名 + 默认图标（🔧）
- **AND** 不会因此崩溃或白屏
