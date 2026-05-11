## ADDED Requirements

### Requirement: 优化触发按钮

每个 section 卡片右下角 SHALL 显示 `✨ AI 优化` 按钮。

#### Scenario: 按钮显示

- **WHEN** 用户 hover 在某个 section 卡片上
- **THEN** 卡片右下角显示 `✨ AI 优化` 小按钮
- **AND** 按钮使用 WarmButton ghost 风格，不突兀

#### Scenario: 点击展开面板

- **WHEN** 用户点击某 section 的优化按钮
- **THEN** 该 section 卡片向下展开优化面板
- **AND** 如果其他面板已展开，自动收起
- **AND** 页面平滑滚动使面板可见

### Requirement: 优化意图输入

优化面板 SHALL 包含可选文本输入框，让用户描述优化方向。

#### Scenario: 输入优化意图

- **WHEN** 用户在意图输入框中输入「偏管理方向，强调团队协作」
- **THEN** 该文本在生成时作为 prompt 附加指令传给 AI
- **AND** 输入框 placeholder 显示「可选项，如：偏管理方向、强调数据成果...」

#### Scenario: 留空意图

- **WHEN** 用户不填写优化意图
- **THEN** AI 自行判断最佳改写方向
- **AND** 正常生成 2-3 个方案

### Requirement: 双滑块控制

优化面板 SHALL 包含改写激进程度和关键词密度两个滑块。

#### Scenario: 滑块渲染

- **WHEN** 优化面板展开
- **THEN** 显示「改写激进程度」滑块（1-10）和「关键词密度」滑块（1-10）
- **AND** 每个滑块下方显示当前值对应的文字说明（如「偏保守」「适度植入」）

#### Scenario: 滑块默认值

- **WHEN** 优化面板首次展开
- **THEN** 激进度默认为 3，关键词密度默认为 5
- **AND** 用户调整后在同一面板生命周期内保持

### Requirement: 多方案展示与选择

优化面板 SHALL 以卡片列表形式展示 AI 生成的改写方案。

#### Scenario: 方案加载状态

- **WHEN** 用户点击「生成方案」
- **THEN** 显示 3 秒加载动画
- **AND** 加载期间「生成方案」按钮显示 spinner 并禁用

#### Scenario: 方案展示

- **WHEN** AI 返回改写方案
- **THEN** 每个方案以独立卡片展示
- **AND** 方案 A 标记为「激进」（大幅重构）、方案 B 标记为「保守」（精修措辞）、方案 C 标记为「定向」（JD 匹配）
- **AND** 每个方案下方有「选用此方案」按钮

#### Scenario: 选用方案

- **WHEN** 用户点击某方案的「选用此方案」
- **THEN** 当前 section 的 content 替换为该方案内容
- **AND** 优化面板收起
- **AND** section 卡片显示短暂绿闪动画（~800ms）
- **AND** 保存按钮激活（内容已变更）

#### Scenario: 放弃优化

- **WHEN** 用户点击「放弃，保留原文」
- **THEN** 优化面板收起
- **AND** section 内容不变

#### Scenario: 调整意图重新生成

- **WHEN** 用户修改意图或滑块值后再次点击「生成方案」
- **THEN** 旧的方案卡片清空，显示新的加载状态
- **AND** 生成全新的 2-3 个方案

### Requirement: 方案选择后存储标记

选用方案后保存时 SHALL 将版本 source 标记为 "optimized"。

#### Scenario: 优化后保存

- **WHEN** 用户选用 AI 方案后点击「保存」
- **THEN** 当前版本的 source 字段设为 "optimized"
- **AND** 版本下拉菜单中该版本显示「已优化」标识或图标
