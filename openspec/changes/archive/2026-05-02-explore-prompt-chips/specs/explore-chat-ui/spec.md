# Spec: Explore Chat UI

## MODIFIED Requirements

### Requirement: 空状态提示芯片

探索页面空状态 SHALL 展示 8 个提示芯片，覆盖主要求职话题，字体为 text-base (16px)，帮用户快速开始对话。

#### Scenario: 芯片展示

- **WHEN** 用户尚未发送任何消息
- **THEN** 空状态展示 8 个提示芯片，每行自适应排列
- **AND** 芯片字体为 text-base (16px)，内边距 px-4 py-2.5
- **AND** 芯片间距为 gap-3

#### Scenario: 芯片点击

- **WHEN** 用户点击任意芯片
- **THEN** 芯片文本填入输入框，输入框自动聚焦
