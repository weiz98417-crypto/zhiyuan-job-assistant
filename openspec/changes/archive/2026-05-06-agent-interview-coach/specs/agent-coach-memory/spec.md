## ADDED Requirements

### Requirement: 教练对话写入 Agent Memory

面试教练对话 SHALL 写入 Agent 会话的 Memory 系统，与通用对话共享存储。

#### Scenario: 教练对话归入当前会话

- **WHEN** 用户在 Agent Chat 中进行面试教练对话
- **THEN** 对话消息存入当前 Agent 会话（无需创建独立会话）
- **AND** 对话结束后更新会话的 `memoryDigest`

#### Scenario: 练习信号自动提取

- **WHEN** 用户在教练对话中描述自己的经历、技能或回答
- **THEN** 现有 `scanMessage()` 机制自动扫描提取 profile signals
- **AND** 提取的信号写入 `profile_signals` 表
- **AND** 教练对话结束时触发 `triggerProfileUpdate({ force: true })`

#### Scenario: 评分结果影响画像

- **WHEN** 用户完成回答评分后，Agent 获取到弱项信息
- **THEN** 弱项信号写入 Agent Memory
- **AND** 画像系统在下次分析时纳入弱项维度
- **AND** 后续 Agent 对话可以引用这些弱项（"你之前练习时事件处理类题目得分较低..."）

#### Scenario: 跨会话引用教练记录

- **WHEN** 用户在不同会话中与 Agent 对话
- **THEN** Agent 可以从 Memory 中获取之前的面试练习记录
- **AND** Agent 可以引用历史表现（"你上次针对字节产品岗的练习中，行为类题目得分不错"）

### Requirement: 教练对话状态标记

教练对话消息 SHALL 标记来源，方便后续按类型筛选和展示。

#### Scenario: 消息标记

- **WHEN** 在教练模式下产生的 assistant 消息
- **THEN** 消息记录包含 `mode: "interview-coach"` 标记
- **AND** 工具调用结果包含 `source: "interview-coach"` 标记

#### Scenario: 会话标题自动生成

- **WHEN** 新建会话中首次触发面试教练模式
- **THEN** 会话标题自动设为"面试练习" + 公司/角色信息（如有）
- **AND** 格式为"面试练习 — {company} {role}"，如"面试练习 — 字节跳动 产品经理"
