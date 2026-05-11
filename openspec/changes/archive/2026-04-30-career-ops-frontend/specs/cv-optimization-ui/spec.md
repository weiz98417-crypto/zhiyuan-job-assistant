# Spec: CV Optimization UI

## ADDED Requirements

### Requirement: 简历基础信息

用户可以编辑和管理个人简历的基础内容。

#### Scenario: 编辑简历内容

- **WHEN** 用户打开简历优化页面
- **THEN** 显示当前简历的编辑界面（Summary、工作经历、项目、教育、技能）
- **AND** 支持 Markdown 编辑
- **AND** 自动从 cv.md 加载初始内容

#### Scenario: 多版本简历管理

- **WHEN** 用户保存针对不同岗位的简历版本
- **THEN** 每个版本关联到目标岗位和 JD
- **AND** 可以查看版本差异

### Requirement: JD 配对优化

系统基于 JD 关键词自动建议简历修改。

#### Scenario: 关键词匹配分析

- **WHEN** 用户选择一个 JD 进行配对
- **THEN** 系统高亮 JD 中的关键词和技能要求
- **AND** 在简历中标注已覆盖和缺失的关键词
- **AND** 显示匹配度百分比

#### Scenario: AI 优化建议

- **WHEN** 用户点击"优化建议"
- **THEN** 系统逐条展示简历修改建议
- **AND** 每条建议说明原因（如"JD要求'大模型应用落地经验'，但你的简历中未体现"）
- **AND** 用户可逐条接受或拒绝

#### Scenario: 自动关键词注入

- **WHEN** 用户接受关键词注入建议
- **THEN** 系统自然地将关键词融入简历中
- **AND** 注入后的文字保持可读性，不做 keyword stuffing
- **AND** 所有修改可预览和撤销

### Requirement: PDF 生成与预览

用户可以预览和下载定制后的简历 PDF。

#### Scenario: 实时预览

- **WHEN** 用户编辑简历内容
- **THEN** 右侧实时显示 A4 纸的预览效果
- **AND** 预览使用中文字体（Noto Sans SC / PingFang SC）

#### Scenario: 下载 PDF

- **WHEN** 用户点击"下载 PDF"
- **THEN** 生成 ATS 友好的 PDF 文件
- **AND** 文件名格式：`cv-{姓名}-{公司}-{日期}.pdf`
- **AND** PDF 中的文字可选、可搜索

#### Scenario: 简历模板选择

- **WHEN** 用户点击"更换模板"
- **THEN** 显示 2-3 套中英文简历模板预览
- **AND** 切换模板后内容保留，仅改变排版样式
