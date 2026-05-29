## ADDED Requirements

### Requirement: 行业职级知识

系统 SHALL 包含中国互联网行业职级体系知识，嵌入 Agent 推理上下文。

#### Scenario: 职级映射查询

- **WHEN** Agent 评估一个 JD 的职级要求
- **THEN** 知识库提供 BAT/TMD 各公司的职级映射表
- **AND** 包含 P6/P7/P8 对应的年限、薪资、职责描述
- **AND** 包含国企/外企的对应职级参考

#### Scenario: 执行模式注入职级知识

- **WHEN** Agent 处于执行模式且用户有明确的目标职级
- **THEN** 与目标职级相关的知识被注入 LLM context
- **AND** 不相关的职级知识不注入（节省 tokens）

### Requirement: 薪资基准知识

系统 SHALL 包含按城市×级别×行业的薪资基准数据，用于评估 JD 薪资合理性。

#### Scenario: 薪资合理性评估

- **WHEN** Agent 评估一个 JD 的薪资
- **THEN** 知识库提供该城市+级别+行业的薪资范围参考
- **AND** 包含月薪（税前）、年终奖范围、期权/股票惯例

#### Scenario: 薪资知识注入

- **WHEN** JD 评估中涉及薪资分析（Block D）
- **THEN** 相关城市和级别的薪资基准注入 LLM prompt

### Requirement: 公司面试风格知识

系统 SHALL 包含主要公司的面试风格、轮次安排和技术栈偏好。

#### Scenario: 公司面试风格查询

- **WHEN** Agent 为用户推荐岗位或生成面试准备建议
- **THEN** 知识库提供该公司的典型面试流程
- **AND** 包含轮次数量、技术面风格、行为面侧重点

#### Scenario: 面试知识按需注入

- **WHEN** 用户即将面试某公司
- **THEN** 该公司的面试风格知识优先注入 Agent context

### Requirement: JD 信号词典

系统 SHALL 包含 JD 中常见"信号词"的解读词典，帮助 Agent 识别隐藏信息。

#### Scenario: 信号词识别

- **WHEN** JD 中出现信号词（如"抗压能力强"、"结果导向"、"弹性工作"）
- **THEN** 知识库提供对应的可能含义
- **AND** "抗压能力强" → 可能高强度/加班
- **AND** "结果导向" → 可能 KPI 压力大
- **AND** "弹性工作" → 可能随时响应/无明确边界

#### Scenario: 信号词注入

- **WHEN** JD 评估中检测到 ≥3 个信号词
- **THEN** 相关信号词的解读注入 LLM context
- **AND** Agent 在推荐理由中提醒用户注意信号词
