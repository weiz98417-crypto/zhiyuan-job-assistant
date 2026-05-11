# Spec: Explore Chat UI

## MODIFIED Requirements

### Requirement: 求职画像持久面板

"求职画像"结果面板 SHALL 在 XL 屏幕（≥1280px）上持久可见，宽度为 420px，内容使用上调一级的字体体系以保证大屏可读性。

#### Scenario: 分析前面板状态

- **WHEN** 用户尚未触发"帮我总结"或 AI 尚未分析完成
- **THEN** 面板显示 placeholder 状态：图标 + "开始聊天后，AI 会在这里自动分析你的求职画像..."
- **AND** 面板占据 420px 宽度

#### Scenario: 分析后面板显示

- **WHEN** AI 分析完成并返回 ProfileData
- **THEN** 面板标题为 text-lg (18px) font-bold
- **AND** Section 标题为 text-base (16px) font-medium
- **AND** 内容文本为 text-base (16px)
- **AND** 辅助/标签文本为 text-sm (14px)

#### Scenario: 面板独立滚动

- **WHEN** 面板内容超出可视高度
- **THEN** 面板内部出现垂直滚动条
- **AND** 左侧对话区独立滚动，不受面板影响

#### Scenario: 窄屏面板行为

- **WHEN** 用户在 <1280px 屏幕访问 explore 页面
- **THEN** 面板默认隐藏，通过 slide-in 打开
- **AND** 面板使用相同宽度和字体

### Requirement: 对话区宽度约束

需求探索页面的对话区 SHALL 在桌面端（≥1280px）填满右侧面板左侧的全部可用空间。消息气泡字体为 text-base (16px)。

#### Scenario: 宽屏对话区填满可用空间

- **WHEN** 用户在 1280px+ 屏幕访问 explore 页面
- **THEN** 对话区填满面板左侧的全部可用宽度
- **AND** 消息气泡 max-width 为 90%

#### Scenario: 聊天气泡字体

- **WHEN** 渲染任意聊天消息
- **THEN** 消息文字大小为 text-base (16px)
- **AND** 行高为 leading-relaxed
