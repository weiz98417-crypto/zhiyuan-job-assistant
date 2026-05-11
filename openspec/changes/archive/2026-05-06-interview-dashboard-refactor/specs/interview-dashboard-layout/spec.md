## MODIFIED Requirements

### Requirement: 面试准备仪表盘布局

面试准备页 SHALL 从教练工具重构为仪表盘视图，移除手动教练 UI，保留数据展示和导航功能。

#### Scenario: 页面头部

- **WHEN** 用户访问 `/interview`
- **THEN** 页面显示标题"面试准备"和副标题（练习次数、故事数量、即将面试场次）
- **AND** 右上角显示 [去练习 →] 按钮，跳转到 `/agent?coach=true`

#### Scenario: 练习概览卡片

- **WHEN** 用户有练习记录
- **THEN** 页面顶部显示练习概览：总练习次数、平均分、最近趋势（最近 5 次分数变化）
- **WHEN** 用户无练习记录
- **THEN** 显示引导卡片："还没有练习记录，去 [模拟面试] 开始第一次练习"

#### Scenario: 弱项提示卡片

- **WHEN** 用户有 ≥5 次练习记录且存在均分低于 3.0 的题目类别
- **THEN** 显示弱项提示："你的 {弱项类别} 类题目均分最低（{均分}/5），建议重点练习"
- **AND** 附带 [针对性练习 →] 按钮，跳转到 `/agent?coach=true&questionType={弱项类别}`

#### Scenario: 跳转 Agent 入口

- **WHEN** 用户在任何模块点击"去练习"或"开始练习"按钮
- **THEN** 跳转到 `/agent` 并携带上下文参数（jdId、mode、questionType）
- **AND** Agent 端检测到 `coach=true` 参数后自动加载教练模式

### Requirement: 出题配置简化为预配置

出题配置区 SHALL 保留 JD 选择器和公司预设，但移除"生成题目"按钮，改为"去练习 →"跳转。

#### Scenario: 预配置保留

- **WHEN** 用户查看配置区
- **THEN** 保留：JD 选择器、CV 状态指示、公司预设选择器
- **AND** 移除：教练模式选择器（由 Agent 侧处理）、"生成面试题目"按钮
- **AND** 新增："去练习 →"按钮，将选中配置通过 URL params 传递到 `/agent`

#### Scenario: 配置传递

- **WHEN** 用户选好 JD 和预设后点击"去练习"
- **THEN** 跳转到 `/agent?coach=true&jdId={JD_ID}&preset={PRESET_KEY}`
- **AND** Agent 端读取 `jdId` 和 `preset` 作为初始上下文

### Requirement: 移除手动教练 UI

以下 UI 组件 SHALL 从 `/interview` 页面移除。

#### Scenario: 移除的组件

- **WHEN** 用户访问 `/interview`
- **THEN** 页面不再渲染以下组件：`PracticePanel`（练习对话面板）、独立评分工具
- **AND** `QuestionList` 组件保留文件但不在此页面渲染（Phase 3 可能被 Agent 使用）
- **AND** 教练模式选择器（六种模式按钮组）移除

#### Scenario: 组件文件保留策略

- **WHEN** 重构完成后
- **THEN** `PracticePanel.tsx`、`QuestionList.tsx` 文件保留在项目中
- **AND** `PracticeRecords.tsx` 继续在页面中使用
- **AND** 如果组件被标记为 "pending removal" 且在 Phase 3 中未被 Agent 使用，届时统一清理
