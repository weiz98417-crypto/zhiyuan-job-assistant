# Delta Spec: JD Evaluation UI

## ADDED Requirements

### Requirement: 保存到 JD 库

评估报告页面 SHALL 在操作区提供"保存到 JD 库"按钮，允许用户将当前评估的 JD 保存到 JD 库。

#### Scenario: 显示保存按钮

- **WHEN** 用户查看评估报告
- **THEN** 在操作按钮区域显示"保存到 JD 库"按钮
- **AND** 图标使用 `Library` 或 `Bookmark` 风格

#### Scenario: 保存 JD 到库

- **WHEN** 用户点击"保存到 JD 库"
- **AND** 该 JD 尚未在库中
- **THEN** 创建新 JD 记录，字段为：`company`（从报告提取）、`role`（从报告提取）、`body`（从评估请求的 `jdText` 提取）、`sourceType`（根据输入模式设为 paste/ocr/url）、`sourceUrl`（如有 URL）、`keywords`（从报告提取）、`reportId`（关联当前报告）
- **AND** 按钮变为"已保存"状态

#### Scenario: 重复保存检测

- **WHEN** 用户点击"保存到 JD 库"
- **AND** 该 JD 正文前200字与库中已有记录匹配
- **THEN** 更新已有记录的 `reportId` 和 `keywords`
- **AND** 提示"已更新已有 JD 记录"
