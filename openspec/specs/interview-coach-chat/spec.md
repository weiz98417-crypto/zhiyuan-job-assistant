# Spec: Interview Coach Chat

## Purpose

TBD

## Requirements

### Requirement: 多轮流式教练对话

系统 SHALL 支持面试教练的多轮对话模式，用户可发送消息、接收流式结构化回复，并继续追问。教练对话 SHALL 支持接收题目上下文，围绕具体面试题目组织回答指导。

#### Scenario: 开始新对话（带题目上下文）

- **WHEN** 用户从题目卡片点击 [练习] 进入练习面板
- **THEN** 系统组装 system message 包含：题目文本、考察意图、JD 摘要、CV 摘要
- **AND** 用户输入框预填提示"请开始回答这道题"
- **AND** 调用 `/api/interview/coach/stream` SSE 端点，携带 questionContext
- **AND** 结构化回答逐段流式出现在对话区域

#### Scenario: 开始新对话（无题目上下文，向后兼容）

- **WHEN** 用户选择面试模式并输入经历描述后点击"生成"（独立教练入口）
- **THEN** 系统将模式说明作为 system message、经历作为 user message 组装为消息历史
- **AND** 调用 `/api/interview/coach/stream` SSE 端点（不带 questionContext）
- **AND** 结构化回答逐段流式出现在对话区域

#### Scenario: 流式分段输出

- **WHEN** API 返回 `section` 事件
- **THEN** 前端在对话区域渲染对应章节（如"背景""角色""行动""结果""反思"）
- **AND** 每个章节带有章节标签和内容
- **AND** 内容以流式增量呈现

#### Scenario: 追问列表可点击

- **WHEN** 流式完成后 API 返回 `followUps` 事件
- **THEN** 系统在最后一条助手消息下方渲染可点击的追问按钮
- **AND** 每个按钮显示追问文本和简短提示
- **WHEN** 用户点击某个追问按钮
- **THEN** 该追问文本作为 user message 添加到对话历史
- **AND** 系统自动调用流式 API 继续对话

#### Scenario: 手动输入追问

- **WHEN** 用户在输入框中输入内容并发送
- **THEN** 该内容作为 user message 添加到对话历史
- **AND** 系统调用流式 API 继续对话

#### Scenario: 对话历史保留

- **WHEN** 用户在同一会话内进行多轮对话
- **THEN** 全部消息历史保留在 `coachMessages` 状态中
- **AND** 消息历史传递给 API 以维持上下文连贯性
- **AND** 超出 20 条时自动裁剪最早的 user+assistant 消息对

#### Scenario: 保存对话到题库

- **WHEN** 用户在练习面板中点击 [保存到题库]
- **THEN** 系统提取题目、分类、最终回答、评分保存为 PracticeRecord
- **AND** 显示"已保存"确认提示
- **AND** 已练列表自动刷新

#### Scenario: 切换模式清空历史

- **WHEN** 用户在对话进行中切换到不同面试模式
- **THEN** 系统清空对话历史并显示提示
- **AND** 输入区域保持在新模式的初始状态
