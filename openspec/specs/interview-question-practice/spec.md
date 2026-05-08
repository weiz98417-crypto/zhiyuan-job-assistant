# Spec: Interview Question Practice

## Purpose

TBD

## Requirements

### Requirement: 题目→练习连接

系统 SHALL 支持从生成的题目卡片一键进入练习模式，练习上下文自动携带题目信息。

#### Scenario: 点击练习按钮

- **WHEN** 用户在题目卡片上点击 [练习此题] 按钮
- **THEN** 练习面板打开，顶部显示当前题目文本、分类标签、考察意图
- **AND** 教练对话区域显示引导消息："请针对这道题开始你的回答"
- **AND** 输入框获得焦点

#### Scenario: 练习上下文传递

- **WHEN** 练习面板首次加载
- **THEN** 系统向 `/api/interview/coach/stream` 发送请求，携带 questionContext
- **AND** questionContext 包含：question（题目文本）、context（考察意图）、storyHint（准备提示）、jdSummary（JD 前 500 字）、cvSummary（CV 前 500 字）
- **AND** 教练 system prompt 了解当前练习的具体题目

#### Scenario: 无题目上下文时教练兼容

- **WHEN** 教练 API 收到的请求不包含 questionContext
- **THEN** 教练按现有模式工作（根据用户输入的经历组织回答）
- **AND** 不影响评分等已有功能

### Requirement: 题目卡片增强

系统 SHALL 在题目卡片上展示更多信息并支持快捷操作。

#### Scenario: 题目卡片信息

- **WHEN** 题目列表渲染
- **THEN** 每张卡片展示：分类标签、题目文本、考察意图（一行）、准备提示（一行）
- **AND** 弱项题目卡片左边框显示琥珀色高亮

#### Scenario: 题目卡片操作

- **WHEN** 题目卡片渲染
- **THEN** 每张卡片底部显示 [练习此题] 按钮（主要操作）
- **AND** 如果已练习，额外显示 [重练] 和 [查看记录] 按钮
