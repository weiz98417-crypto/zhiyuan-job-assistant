# Spec: JD Library UI

## ADDED Requirements

### Requirement: 快速评估入口

JD 库页面 SHALL 提供快速评估入口，用户可直接从 JD 库发起 AI 评估。

#### Scenario: 快速评估按钮

- **WHEN** 用户在 JD 库中查看某条 JD 记录
- **THEN** 显示"快速评估"按钮
- **AND** 点击后跳转到评估页面并自动填入该 JD 内容

#### Scenario: 粘贴即评

- **WHEN** 用户在 JD 库页面顶部粘贴框粘贴 JD 文本或 URL
- **THEN** 自动跳转到评估页面并开始评估
- **AND** 评估完成后 JD 自动保存到 JD 库
