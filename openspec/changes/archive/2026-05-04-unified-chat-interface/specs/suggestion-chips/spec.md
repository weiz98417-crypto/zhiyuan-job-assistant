## ADDED Requirements

### Requirement: 快捷操作卡片

前端 SHALL 在输入框上方显示可点击的快捷操作卡片。

#### Scenario: 卡片渲染

- **WHEN** 页面加载完成
- **THEN** 输入框上方显示 6 个建议卡片（查投递、评估JD、推荐岗位、健康检查、生成简历、导出报告）
- **AND** 每个卡片包含图标和文字

#### Scenario: 卡片点击

- **WHEN** 用户点击 "查投递" 卡片
- **THEN** 输入框自动填入 "帮我查一下最近的投递记录"
- **AND** 不自动发送，用户可以编辑后再发送

#### Scenario: 卡片不干扰输入

- **WHEN** 用户正在手动输入
- **THEN** 点击卡片替换输入框内容
- **AND** 如果 streaming 中，卡片不可点击

#### Scenario: 可配置

- **WHEN** 需要添加或修改快捷卡片
- **THEN** 修改 SUGGESTIONS 数组即可，不需要改组件代码
