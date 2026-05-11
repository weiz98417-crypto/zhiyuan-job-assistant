## MODIFIED Requirements

### Requirement: 求职画像持久面板

"求职画像"结果面板 SHALL 在 Agent 页的探索 Tab 中作为右侧面板显示，不再绑定 `/explore` 路由。

#### Scenario: 分析前面板状态

- **WHEN** 用户尚未触发"帮我总结"或 AI 尚未分析完成
- **THEN** 面板显示 placeholder 状态：图标 + "开始聊天后，AI 会在这里自动分析你的求职画像..."
- **AND** 面板占据 420px 宽度

#### Scenario: 分析后面板显示

- **WHEN** AI 分析完成并返回 ProfileData
- **THEN** 面板显示：匹配类型、推荐方向（带置信度百分比）、技能清单（核心/次要分类）、工作偏好、硬约束、求职叙事
- **AND** 面板底部显示 "保存到档案" 按钮
- **AND** 保存操作同时写入 DexieDB CareerProfile + AgentPreferenceModel（source="explore"）

#### Scenario: 面板独立滚动

- **WHEN** 面板内容超出可视高度
- **THEN** 面板内部出现垂直滚动条
- **AND** 左侧对话区独立滚动，不受面板影响

#### Scenario: 窄屏面板行为

- **WHEN** 用户在 <1280px 屏幕访问 Agent 页
- **THEN** 面板默认隐藏，通过 slide-in 按钮打开
- **AND** 面板使用相同宽度和字体

## REMOVED Requirements

### Requirement: 对话区宽度约束

**Reason**: `/explore` 页面不再独立存在，Agent 页面有自己的布局约束
**Migration**: Agent 页面使用新的布局方案（聊天居中 + 右侧面板），不再需要独立的 explore 宽度约束

## ADDED Requirements

### Requirement: 聊天组件可复用

聊天渲染逻辑 SHALL 从 explore 页面提取为独立组件 `AgentChat`，供 Agent 页的两个 Tab 共用。

#### Scenario: 探索 Tab 使用 AgentChat

- **WHEN** 用户位于探索 Tab
- **THEN** AgentChat 渲染消息列表 + 输入框
- **AND** 输入框上方显示 "总结" 按钮
- **AND** tool 消息渲染为纯文本

#### Scenario: 执行 Tab 使用 AgentChat

- **WHEN** 用户位于执行 Tab
- **THEN** AgentChat 渲染消息列表 + 输入框
- **AND** 不显示 "总结" 按钮
- **AND** tool 消息渲染为工具结果卡片（toolName + 格式化摘要）

#### Scenario: 消息模型兼容

- **WHEN** AgentChat 接收消息数组
- **THEN** 支持 `{ role, content, mode, toolName?, toolResult? }` 格式
- **AND** role="tool" 时根据 mode 选择渲染策略
