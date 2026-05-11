# Spec: Explore Chat UI

## MODIFIED Requirements

### Requirement: 对话区宽度约束

需求探索页面的对话区 SHALL 在桌面端（≥1280px）填满右侧面板左侧的全部可用空间，与其他页面保持一致的流体布局策略。消息气泡宽度约束为 max-w-[90%] 以保证可读性。

#### Scenario: 宽屏对话区填满可用空间

- **WHEN** 用户在 1280px+ 屏幕访问 explore 页面
- **THEN** 对话区（消息列表 + 输入框）填满面板左侧的全部可用宽度（flex-1）
- **AND** 对话区内无额外的 max-width 居中包裹

#### Scenario: 消息气泡宽度

- **WHEN** 对话区宽于 672px
- **THEN** 消息气泡 max-width 为 90%，在宽屏上自然约束行宽
- **AND** 用户消息靠右对齐，AI 消息靠左对齐

#### Scenario: 窄屏自适应

- **WHEN** 用户在 <1280px 屏幕访问 explore 页面
- **THEN** 对话区无额外宽度约束，填满可用空间
