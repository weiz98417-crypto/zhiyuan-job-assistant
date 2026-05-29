## ADDED Requirements

### Requirement: Agent 统一对话页

系统 SHALL 提供 `/agent` 页面作为纸鸢 Agent 的统一对话入口，包含探索和执行两个 Tab，共享聊天消息流和 Agent Memory。

#### Scenario: 页面入口

- **WHEN** 用户访问 `/agent`
- **THEN** 默认显示探索 Tab
- **AND** 消息列表从 Agent Memory 加载最近 50 条交互记录渲染为对话
- **AND** 侧边栏 "AI Agent" 导航项高亮

#### Scenario: Tab 切换

- **WHEN** 用户点击 "执行" Tab
- **THEN** 聊天消息保持（不丢失）
- **AND** 输入框及发送按钮保留
- **AND** "总结"按钮仅在探索 tab 显示
- **AND** Tab 切换事件写入 AgentInteraction（trigger="user_query"）

#### Scenario: 空状态首次访问

- **WHEN** 用户首次访问 `/agent` 且无历史消息
- **THEN** 探索 Tab 显示 Agent 简介和 prompt chips
- **AND** 执行 Tab 显示 "切换到执行模式，让纸鸢帮你分析职位、追踪投递、检查 Pipeline"
- **AND** 两个 Tab 均显示欢迎消息："你好！我是纸鸢，你的 AI 求职伙伴"

#### Scenario: 消息持久化

- **WHEN** 用户在 Agent 页发送消息并接收回复
- **THEN** 消息以 AgentInteraction 格式写入 DexieDB（trigger="user_query"）
- **AND** 刷新页面后消息恢复
- **AND** 跨 Tab 切换消息不丢失

### Requirement: 聊天流跨 Tab 共享

Agent 页的消息列表 SHALL 在探索和执行两个 Tab 之间共享，纸鸢感知完整对话上下文。

#### Scenario: 探索消息在执行 Tab 可见

- **WHEN** 用户在探索 Tab 聊了 5 轮
- **AND** 用户切换到执行 Tab
- **THEN** 消息列表中保留全部 10 条消息（5 轮用户+纸鸢回复）
- **AND** 纸鸢的 System Prompt 包含最近的 AgentInteraction 摘要

#### Scenario: 执行消息在探索 Tab 可见

- **WHEN** 用户在执行 Tab 触发了工具调用（如 search_applications）
- **AND** 用户切换到探索 Tab
- **THEN** 工具调用结果作为普通消息显示（忽略 tool 渲染卡片）
- **AND** 探索 Tab 不显示工具调用按钮/面板

#### Scenario: 模式感知的消息渲染

- **WHEN** 消息的 mode 属性为 "execute" 且 role="tool"
- **THEN** 执行 Tab 渲染为工具结果卡片（显示 toolName + 格式化结果）
- **AND** 探索 Tab 渲染为普通 AI 消息（纯文本）

### Requirement: /explore 重定向

旧的 `/explore` 路由 SHALL 302 重定向到 `/agent?tab=explore`。

#### Scenario: 直接访问 /explore

- **WHEN** 用户或外部链接访问 `/explore`
- **THEN** 浏览器 302 重定向到 `/agent?tab=explore`
- **AND** 用户看到 Agent 页的探索 Tab

#### Scenario: 旧书签兼容

- **WHEN** 用户使用书签访问 `/explore`
- **THEN** 自动跳转到 `/agent?tab=explore`
- **AND** 页面功能完整，无 404 错误
