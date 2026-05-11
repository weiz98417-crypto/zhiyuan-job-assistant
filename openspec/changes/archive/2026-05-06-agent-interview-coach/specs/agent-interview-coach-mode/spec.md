## ADDED Requirements

### Requirement: 面试教练 Agent 模式

系统 SHALL 在 Agent Chat 中提供面试教练模式，用户可通过 suggestion chip 或自然语言触发。教练模式使用专用 System Prompt（覆盖六种面试场景），复用 Agent Chat 的流式对话和工具调用基础设施。

#### Scenario: Suggestion Chip 触发

- **WHEN** 用户在 Agent Chat 的 suggestion chips 区域看到"模拟面试" chip
- **AND** 用户点击该 chip
- **THEN** 系统发送预设消息"帮我做一次模拟面试练习"
- **AND** Agent 检测到面试 coaching intent，加载教练 System Prompt Overlay
- **AND** Agent 回复包含引导语："好的！我来帮你准备面试。请告诉我：1）你想准备哪个公司/岗位的面试？2）有没有特定想练习的题型？"

#### Scenario: 自然语言触发

- **WHEN** 用户输入包含面试 coaching 意图的消息（如"我想练习面试"、"准备一下字节的产品面"、"帮我针对刚才的JD出题"）
- **THEN** 系统检测到面试 coaching intent
- **AND** Agent 加载教练 System Prompt Overlay
- **AND** 后续对话在教练模式下进行

#### Scenario: 教练模式 System Prompt

- **WHEN** 教练模式被激活
- **THEN** System Prompt 包含六种面试模式定义：
  - 模式1: 项目复盘（互联网大厂，60%场景）
  - 模式2: 行为问答（外企/咨询，15%场景）
  - 模式3: 情景应对（大厂交叉面/群面，15%场景）
  - 模式4: 结构化面试（中小企业 50-500 人）
  - 模式5: 创始人对话（初创 <50 人）
  - 模式6: 稳重应答（国企/央企/银行）
- **AND** 每种模式包含：适用场景描述、回答结构框架、追问策略、权重偏向
- **AND** 如果 Agent 能获取到 JD 上下文，Prompt 包含 JD 的关键要求
- **AND** 如果 Agent 能获取到 CV 上下文，Prompt 包含 CV 摘要

#### Scenario: 模式自适应推荐

- **WHEN** 用户提到具体公司或公司类型
- **THEN** Agent 根据公司类型自动推荐匹配的面试模式
- **AND** 用户可接受推荐或手动选择其他模式

#### Scenario: 跨消息保持教练模式

- **WHEN** 教练模式激活后，用户在同一会话内继续对话
- **THEN** Agent 保持教练模式，直到用户明确切换（如"帮我看一下投递状态"）
- **AND** 非面试意图的消息自动退出教练模式

### Requirement: 教练模式 Suggestion Chips

Agent Chat 的 SuggestionChips SHALL 在教练模式下展示面试相关的快捷操作。

#### Scenario: 教练模式 Chips

- **WHEN** 教练模式激活
- **THEN** SuggestionChips 区域显示面试相关选项：
  - "换一道题" / "再出一道行为题" / "给我一个追问"
  - "评估我的回答" / "换个模式试试"
- **AND** 非教练模式的通用 chips 暂时隐藏

#### Scenario: 退出教练模式

- **WHEN** 用户点击"退出教练模式"或发送非面试意图的消息
- **THEN** Agent 恢复通用 System Prompt
- **AND** SuggestionChips 恢复通用列表
- **AND** 教练对话历史保留在当前会话中
