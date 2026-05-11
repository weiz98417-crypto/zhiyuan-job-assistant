# Spec: Explore Chat UI

## ADDED Requirements

### Requirement: 对话区宽度约束

需求探索页面的对话区 SHALL 在桌面端（≥1024px）约束为 `max-w-2xl` (672px) 并居中显示，确保消息行宽在 40-45 个中文字符范围内，匹配 ChatGPT/DeepSeek 行业标准阅读宽度。

#### Scenario: 宽屏对话区居中

- **WHEN** 用户在 1280px+ 屏幕访问 explore 页面
- **THEN** 对话区（消息列表 + 输入框）约束为 max-w-2xl (672px) 并在可用空间内居中
- **AND** 单行中文不超过 45 字

#### Scenario: 消息气泡宽度

- **WHEN** 对话区宽度为 672px
- **THEN** 消息气泡 max-width 为 90%（约 605px）
- **AND** 用户消息靠右对齐，AI 消息靠左对齐

#### Scenario: 窄屏自适应

- **WHEN** 用户在 <1024px 屏幕访问 explore 页面
- **THEN** 对话区无 max-width 约束，填满可用空间
- **AND** 保持当前移动端单栏布局

### Requirement: 空状态引导

对话区在无用户消息时 SHALL 显示紧凑的引导卡片，包含 3-4 个可点击的 prompt chips，帮助用户快速开始对话。

#### Scenario: 首次进入

- **WHEN** 用户首次进入 explore 页面（无历史消息）
- **THEN** 显示居中的引导卡片
- **AND** 卡片包含引导文字"开始聊起来吧，你不需要有答案"
- **AND** 显示至少 3 个 prompt chip，如"我之前做过..."、"我想找钱多事少的..."、"转行有没有机会？"

#### Scenario: 点击 prompt chip

- **WHEN** 用户点击某个 prompt chip
- **THEN** chip 文本自动填入输入框
- **AND** 输入框自动聚焦
- **AND** 用户可以编辑文本后发送或直接按 Enter 发送

#### Scenario: 已有消息后

- **WHEN** 对话中已有至少一条用户消息
- **THEN** 引导卡片消失，显示正常消息列表

### Requirement: 求职画像持久面板

"求职画像"结果面板 SHALL 在 XL 屏幕（≥1280px）上持久可见，宽度为 384px (w-96)，字体大小为 text-sm（14px），包含独立的垂直滚动。

#### Scenario: 分析前面板状态

- **WHEN** 用户尚未触发"帮我总结"或 AI 尚未分析完成
- **THEN** 面板显示 placeholder 状态：图标 + "开始聊天后，AI 会在这里自动分析你的求职画像..."
- **AND** 面板依然占据 384px 宽度，保持布局稳定

#### Scenario: 分析后面板显示

- **WHEN** AI 分析完成并返回 ProfileData
- **THEN** 面板显示：匹配类型、推荐方向（带置信度百分比）、技能清单（核心/次要分类）、工作偏好、硬约束、求职叙事
- **AND** 面板标题为 text-base (16px) font-bold
- **AND** 内容文本为 text-sm (14px)
- **AND** 辅助文本为 text-xs (12px)

#### Scenario: 面板独立滚动

- **WHEN** 面板内容超出可视高度
- **THEN** 面板内部出现垂直滚动条
- **AND** 左侧对话区独立滚动，不受面板影响

#### Scenario: 窄屏面板行为

- **WHEN** 用户在 <1280px 屏幕访问 explore 页面
- **THEN** 面板默认隐藏
- **AND** 用户可以通过按钮或手势打开面板（保持当前 slide-in 行为）

### Requirement: 高度自然填充

页面整体高度 SHALL 自然填充 AppShell 内容区的高度，不再使用固定的 `max-h-[800px]` 限制。

#### Scenario: 长对话

- **WHEN** 对话消息数量超过可视区域高度
- **THEN** 消息区出现垂直滚动条
- **AND** 输入框固定在底部可见
- **AND** 新消息自动滚动到底部

#### Scenario: 短对话

- **WHEN** 对话中仅有初始 AI 消息或少量消息
- **THEN** 消息从顶部开始显示，无过大空白
- **AND** 引导卡片（如适用）在视觉焦点区域
