## ADDED Requirements

### Requirement: Agent 评估知识注入

Agent Chat 的系统提示词 SHALL 注入 modes/zh/_shared.md 的评估知识摘要，使 Agent 理解 A-G 7 板块评估框架、6 个 archetype、中国市场规则和评分体系。

#### Scenario: Agent 知道评估能力

- **WHEN** 用户询问"你能怎么帮我评估职位"
- **THEN** Agent SHALL 回复中提到 A-G 7 板块评估
- **AND** SHALL 说明支持三种输入方式：粘贴 JD 文本、粘贴链接、上传截图

#### Scenario: Agent 解读评估结果

- **WHEN** Agent 调用了 evaluate_jd 工具并收到评估结果
- **THEN** Agent SHALL 提取关键发现用自然语言总结（最大亮点 + 最大风险 + 投递建议）
- **AND** SHALL 不逐字复述全量报告

### Requirement: 统一输入区（文本 + 截图）

Agent Chat 输入区 SHALL 提供文本输入框 + `+` 按钮，支持粘贴 JD 文本/URL 和上传截图（最多 5 张）。截图与文本共享同一个发送按钮。

#### Scenario: + 按钮上传截图

- **WHEN** 用户点击输入框旁的 `+` 按钮
- **THEN** 系统打开文件选择器，接受 png/jpeg/webp，最多 5 张
- **AND** 支持 Ctrl+V 直接粘贴截图
- **AND** 已选截图以缩略图形式在输入区上方预览（带编号 ①②③④⑤，可单张移除）

#### Scenario: 粘贴 JD 文本或 URL 自动识别

- **WHEN** 用户在输入框粘贴内容
- **THEN** 系统自动检测：URL（`https?://`）→ 提示"检测到链接"；纯文本 → 正常文本输入
- **AND** 截图优先于文本：同时有截图和文本时，提示将以截图 OCR 为准

#### Scenario: 发送后触发评估

- **WHEN** 用户点击发送（有 JD 文本、URL 或截图）
- **THEN** Agent SHALL 自动判断用户意图并调用 evaluate_jd 工具
- **AND** 工具自动传入对应的 `jdText`、`jdUrl` 或 `images` 参数

### Requirement: Agent 流式评估进度卡片

当 Agent 执行 evaluate_jd 工具时，对话中 SHALL 显示实时更新的评估进度卡片。卡片消费 SSE 流，在评估完成后展示摘要。

#### Scenario: 评估进行中展示进度

- **WHEN** Agent 开始执行 evaluate_jd 工具
- **THEN** 对话中 SHALL 显示评估进度卡片
- **AND** 卡片实时展示 Phase 0 进度（提取中/OCR 识别中）和 A-G 各 block 状态
- **AND** 当前 block 以旋转动画标记，已完成 block 打 ✓

#### Scenario: OCR 阶段进度

- **WHEN** 用户上传了截图且 Phase 0 为 OCR 模式
- **THEN** 卡片 SHALL 显示「正在识别第 N/M 张...」
- **AND** 逐张完成时更新进度

#### Scenario: 评估完成展示摘要与确认按钮

- **WHEN** 评估完成（receiving `done` 事件）
- **THEN** 卡片收缩为摘要行：公司名、岗位名、总分、Legitimacy
- **AND** Agent 生成自然语言总结回复
- **AND** 回复下方 SHALL 出现 HITL 确认按钮组：「保存到 JD 库」「加入投递追踪」「放弃」

### Requirement: Human-in-the-Loop 确认保存

评估完成后，Agent SHALL 展示确认按钮供用户授权保存。未经用户点击确认，评估结果 SHALL 不持久化到 JD 库或追踪表。

#### Scenario: 用户确认保存到 JD 库

- **WHEN** 用户点击「保存到 JD 库」按钮
- **THEN** 系统 SHALL 将 JD 文本、公司名、岗位名、关键词、来源类型存入 IndexedDB JD 库
- **AND** 按钮状态变为「已保存 ✓」
- **AND** Agent 追加确认消息「JD 已保存到库，可在 /evaluate/jds 查看」

#### Scenario: 用户确认加入投递追踪

- **WHEN** 用户点击「加入投递追踪」按钮
- **THEN** 系统 SHALL 将评估结果写入 applications.md 追踪表
- **AND** 按钮状态变为「已加入追踪 ✓」
- **AND** 如果分数 < 3.5，按钮旁 SHALL 有温和提示「该岗位匹配度偏低，建议谨慎考虑」

#### Scenario: 用户选择放弃

- **WHEN** 用户点击「放弃」按钮
- **THEN** 评估结果 SHALL 不持久化
- **AND** 对话中的评估卡片 SHALL 保留（会话内可回顾）
- **AND** 关闭会话后评估结果不保留
- **AND** Agent 追加确认消息「已放弃保存。评估结果仍可在本次对话中查看」

#### Scenario: 用户未操作时不做任何持久化

- **WHEN** 评估完成后用户未点击任何确认按钮（如直接关闭页面或开始新对话）
- **THEN** 系统 SHALL 不自动保存任何数据
- **AND** 评估结果仅存在于当前会话的临时上下文中

#### Scenario: 评估完成后可追问

- **WHEN** 用户对评估结果有疑问（如"这个薪资合理吗？""帮我对比另一个Offer"）
- **THEN** Agent SHALL 能基于已有的评估结果继续对话
- **AND** 可以调其他工具（web_search、generate_cv 等）响应追问

### Requirement: Agent Chat 会话隔离

每个评估会话 SHALL 保持独立的对话上下文，不同会话间的评估结果不互相污染。

#### Scenario: 新会话独立评估

- **WHEN** 用户创建新会话并评估一个新 JD
- **THEN** 评估结果仅保存在当前会话的上下文中
- **AND** Agent SHALL 只基于当前会话的评估结果回答问题

### Requirement: Suggestion Chips 交互

Agent Chat 的 Suggestion Chips SHALL 采用提示词填入模式。点击 chip 将预设文本填入输入框，用户可编辑后发送。「评估JD」chip 采用混合模式，填入文本的同时给予附件上传的视觉暗示。

#### Scenario: 普通 chip 点击

- **WHEN** 用户点击「查投递」「推荐岗位」「健康检查」「生成简历」「导出报告」中任一 chip
- **THEN** 对应预设提示词 SHALL 填入输入框
- **AND** 光标定位在文本末尾
- **AND** 用户可编辑文本后发送

#### Scenario: 「评估JD」chip 点击（混合模式）

- **WHEN** 用户点击「评估JD」chip
- **THEN** 输入框 SHALL 填入「帮我评估这个JD：」，光标定位在末尾
- **AND** 输入框 placeholder SHALL 临时切换为「粘贴 JD 文本或链接...」
- **AND** `+` 按钮 SHALL 显示微弱的脉冲/高亮动画（持续 2 秒），暗示可以上传截图
- **AND** 用户可粘贴文本/URL、点 `+` 上传截图、或继续打字补充后发送

### Requirement: Dingwei Skill 加载

探索 Tab 的 Agent Chat SHALL 在检测到定位意图时加载 dingwei Skill（`zhiyuan-dingwei.md`），替代当前的纯聊天 Skill（`zhiyuan-explore.md`）。

#### Scenario: 自我定位触发时加载 dingwei Skill

- **WHEN** 用户点击「自我定位」SuggestionChip 或发送"帮我做自我定位"
- **THEN** Agent Chat SHALL 传递 mode="dingwei" 参数
- **AND** 后端 SHALL 加载 `zhiyuan-dingwei.md` 作为系统提示词

#### Scenario: 普通聊天保持轻量

- **WHEN** 用户在探索 Tab 发送非定位意图的消息（闲聊、吐槽、随便聊聊）
- **THEN** Agent SHALL 保持轻量聊天风格，不触发 dingwei 结构化流程
- **AND** SHALL 使用 zhiyuan-agent.md 的统一模式

### Requirement: Suggestion Chips 更新

「自我定位」SuggestionChip SHALL 更新行为：点击后输入框填入"帮我做自我定位"，同时传递 mode="dingwei"。

#### Scenario: Chip 点击行为

- **WHEN** 用户点击「自我定位」Chip
- **THEN** 输入框 SHALL 填入"帮我做自我定位"
- **AND** 发送消息时 SHALL 携带 mode="dingwei"
- **AND** Agent 进入 dingwei 结构化对话流程
