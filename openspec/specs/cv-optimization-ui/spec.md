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

#### Scenario: 桌面大屏编辑布局

- **WHEN** 用户在 ≥1280px 屏幕访问简历管理页
- **THEN** 页面使用 `grid-cols-[1fr_360px]` 布局：左侧编辑区占剩余空间，右侧 JD 配对面板固定 360px
- **AND** 编辑区 textarea 宽度自适应，不再受窄列限制
- **AND** 右侧 JD 配对面板始终可见，方便对照优化

### Requirement: JD 配对优化

系统基于 JD 关键词自动建议简历修改。

#### Scenario: 关键词匹配分析

- **WHEN** 用户选择一个 JD 进行配对
- **THEN** 系统高亮 JD 中的关键词和技能要求
- **AND** 在简历中标注已覆盖和缺失的关键词
- **AND** 显示匹配度百分比
- **AND** JD 信息卡片在右侧面板顶部常驻显示

#### Scenario: AI 优化建议

- **WHEN** 用户点击"优化建议"
- **THEN** 系统逐条展示简历修改建议
- **AND** 每条建议说明原因（如"JD要求'大模型应用落地经验'，但你的简历中未体现"）
- **AND** 用户可逐条接受或拒绝
- **AND** 接受/拒绝操作被记录到偏好历史

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

### Requirement: AI 定向优化面板

简历页面 SHALL 提供 AI 定向优化面板，用户选择目标 JD 后 AI 自动优化简历。

#### Scenario: 选择 JD 触发优化

- **WHEN** 用户选择已保存的 JD 并点击"定向优化"
- **THEN** AI 分析 JD 关键要求并重写简历各段落
- **AND** 以 diff 对比视图展示修改（原版 vs 优化版左右对照）
- **AND** AI 不编造经历，仅在表述层面优化

#### Scenario: 优化范围可选

- **WHEN** 用户触发定向优化
- **THEN** 可选择优化范围：全文 / 仅工作经历 / 仅项目经历 / 仅技能列表

#### Scenario: 一键保存版本

- **WHEN** 优化完成
- **THEN** 显示"复制"、"保存为新版本"、"替换当前版本"三个操作按钮

### Requirement: 量化经历提取

系统 SHALL 从非结构化经历描述中提取或建议量化成果表述。

#### Scenario: 输入经历生成量化版本

- **WHEN** 用户输入"我负责了用户增长"
- **THEN** AI 返回量化建议，标注 [推断] 部分供用户编辑确认

#### Scenario: 批量扫描简历

- **WHEN** 用户点击"扫描量化机会"
- **THEN** AI 扫描简历全文，标注所有可补充数据的描述点

### Requirement: ATS 兼容检查

系统 SHALL 评估简历通过 ATS（Applicant Tracking System）筛选的概率。

#### Scenario: ATS 评分与分级

- **WHEN** 用户点击"ATS 检查"
- **THEN** 返回关键词密度、格式兼容性、段落结构三项评分
- **AND** 总分 > 80 绿色 / 50-80 黄色 / < 50 红色
- **AND** 每项附带改进建议

### Requirement: JD 上下文持久化展示

CV 页面右侧面板 SHALL 始终展示当前选中 JD 的摘要信息卡片，而非仅在匹配度面板出现时才可见。

#### Scenario: JD 信息卡片常驻

- **WHEN** 用户选中了一个 JD 进行配对
- **THEN** 右侧面板顶部 SHALL 持久显示 JD 信息卡片
- **AND** 卡片包含：公司名（带图标）、职位名、核心关键词（前 6 个，以 pill 形式展示）、当前匹配度百分比
- **AND** 提供"更换 JD"按钮重新选择

#### Scenario: 未选择 JD 时的引导

- **WHEN** 用户尚未选择任何 JD
- **THEN** JD 信息卡片 SHALL 显示引导提示："选择一个已评估的 JD 开始针对性优化"
- **AND** 下方显示 JD 选择下拉框

#### Scenario: JD 上下文在编辑区的联动

- **WHEN** 用户鼠标悬停在某 section 的"AI 优化"按钮上
- **THEN** tooltip SHALL 显示"针对 {公司名} — {职位名} 优化"

### Requirement: OptimizePanel JD 上下文展示

OptimizePanel 打开时 SHALL 在面板顶部展示当前 JD 摘要，slider 旁标注优化目标。

#### Scenario: 面板顶部 JD 摘要

- **WHEN** 用户打开某 section 的 OptimizePanel
- **THEN** 面板顶部 SHALL 显示一行摘要："优化目标：{公司} — {职位}"
- **AND** 如果没有选中 JD，显示"未选择目标 JD，将进行通用优化"

#### Scenario: Slider 参数标注

- **WHEN** 用户调整激进程度或关键词密度 slider
- **THEN** 每个 slider 下方 SHALL 显示提示文案
- **AND** 激进程度下方：如"针对 JD 要求进行措辞调整"
- **AND** 关键词密度下方：如"参考 JD 关键词：用户增长, A/B测试, LLM"

### Requirement: 参考简历辅助优化选择

OptimizePanel SHALL 展示可勾选的参考简历列表，用户可选择 0-N 份作为风格参考。

#### Scenario: 参考简历勾选区域

- **WHEN** OptimizePanel 打开且用户已导入参考简历
- **THEN** 在 slider 区域下方 SHALL 显示"参考风格（可选）"区域
- **AND** 列出所有参考简历名称（带 checkbox）
- **AND** 默认勾选 FTS5 自动匹配的前 3 份
- **AND** 如无参考简历，显示"[+ 导入参考简历]"引导链接

#### Scenario: 参考简历影响优化结果

- **WHEN** 用户勾选了参考简历并进行优化
- **THEN** 选中的参考简历对应 section 内容 SHALL 作为"风格参考"传入优化 API
- **AND** AI 在 prompt 中收到："参考以下优秀简历中同 section 的写法风格：[参考简历内容]"

### Requirement: 优化偏好记录

系统 SHALL 记录用户在 OptimizePanel 中对 variant 的 accept/reject 操作，供后续优化参考。

#### Scenario: Accept 操作记录

- **WHEN** 用户点击某个 variant 的"接受"按钮
- **THEN** 系统 SHALL 将 accept 事件写入 `optimization_preferences` 表
- **AND** 记录字段：section_id、variant_type（激进/保守/定向）、action="accept"、original_text、optimized_text

#### Scenario: Reject 操作记录

- **WHEN** 用户点击"关闭"或切换到其他 variant（隐式拒绝）
- **THEN** 已展示但未被接受的 variant SHALL 记录为 action="reject"
- **AND** 仅记录最近一次展示的 variant

#### Scenario: 偏好历史应用于后续优化

- **WHEN** 用户再次触发优化
- **THEN** 优化 prompt SHALL 附带最近 10 条偏好历史
- **AND** 格式为："用户之前✓接受了'{variant_type}'风格的优化 / ✗拒绝了'{variant_type}'风格的优化"
- **AND** LLM 可据此调整输出风格倾向

### Requirement: 简历综合评分

系统 SHALL 对每份简历给出综合评分（0-100）。

#### Scenario: 评分展示

- **WHEN** 用户查看简历
- **THEN** 显示综合评分和四个子维度：内容完整度、结构清晰度、关键词覆盖、量化程度
- **AND** 每项附带具体改进建议
