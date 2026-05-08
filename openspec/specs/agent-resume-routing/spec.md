## ADDED Requirements

### Requirement: Agent Chat 简历文件识别

Agent Chat 中上传的简历文件 SHALL 被自动识别并路由到 Resume Agent 处理。

#### Scenario: 简历文件检测

- **WHEN** 用户在 Agent Chat 中上传图片文件
- **THEN** 系统 SHALL 调用 OCR 提取文字
- **AND** 检测文字内容是否包含简历特征（"工作经历"、"教育背景"、"技能"、"个人概述"等关键词）
- **AND** 若是简历，路由到 Resume Agent 处理

#### Scenario: Resume Agent 处理

- **WHEN** 简历文件被识别并路由到 Resume Agent
- **THEN** Resume Agent SHALL 调用 `/api/cv/import` 解析文件
- **AND** 在聊天中展示解析结果摘要
- **AND** 询问用户是否将解析结果写入简历

#### Scenario: 非简历文件正常处理

- **WHEN** 用户上传的图片不包含简历特征
- **THEN** 系统 SHALL 按原有逻辑处理（JD OCR 评估或其他 Agent 路由）
