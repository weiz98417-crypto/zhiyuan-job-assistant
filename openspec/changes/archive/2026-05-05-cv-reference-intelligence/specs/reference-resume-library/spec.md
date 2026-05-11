## ADDED Requirements

### Requirement: 参考简历导入

系统 SHALL 支持用户通过 PDF 上传、图片上传（OCR 解析）或文本粘贴导入优秀简历作为参考。

#### Scenario: PDF 上传导入

- **WHEN** 用户上传 PDF 格式的参考简历
- **THEN** 后端调用 AI 解析 PDF 内容，提取为结构化 sections（Summary/Experience/Projects/Skills/Education）
- **AND** 返回解析结果供用户确认和编辑
- **AND** 确认后写入 `reference_resumes` 表

#### Scenario: 图片 OCR 导入

- **WHEN** 用户上传简历截图（PNG/JPG）
- **THEN** 后端调用 AI 视觉模型识别文字内容并结构化提取
- **AND** 返回解析结果供用户确认和编辑

#### Scenario: 文本粘贴导入

- **WHEN** 用户粘贴简历全文文本
- **THEN** 系统自动识别分段（按"工作经历""项目经历"等标题切分）
- **AND** 自动填充 sections 结构

#### Scenario: 导入后手动修正

- **WHEN** AI 解析结果存在错漏
- **THEN** 用户可手动编辑每个 section 的内容
- **AND** 编辑后重新生成 FTS5 索引文本

### Requirement: 参考简历存储（SQLite FTS5）

系统 SHALL 在 SQLite 中新增 `reference_resumes` 表及对应的 FTS5 全文索引，存储用户导入的参考简历。

#### Scenario: 数据表结构

- **WHEN** 系统首次启动或执行 schema migration
- **THEN** `reference_resumes` 表 SHALL 包含字段：id（自增主键）、name（用户命名）、source（"upload"/"paste"）、sections_json（CVSection[] JSON）、raw_text（全文拼接）、tags（JSON 标签数组）、notes（备注）、created_at
- **AND** 创建 FTS5 虚拟表 `reference_resumes_fts`，对 raw_text 建立全文索引

#### Scenario: 同名简历去重

- **WHEN** 用户尝试导入与已存在参考简历同名的简历
- **THEN** 系统 SHALL 提示"已存在同名参考简历"，提供"覆盖"或"重命名"选项

#### Scenario: 参考简历查询

- **WHEN** 系统查询参考简历列表
- **THEN** 返回按 created_at 降序排列的所有参考简历
- **AND** 每条包含 id、name、source、tags、notes、created_at（不含完整 sections_json）

### Requirement: 参考简历 FTS5 关键词检索

优化 API SHALL 使用 FTS5 检索与当前优化上下文最相关的参考简历段落。

#### Scenario: 基于 section 内容和 JD 关键词检索

- **WHEN** 用户点击某 section 的"AI 优化"
- **THEN** 系统用当前 section 内容 + JD keywords 构造 FTS5 查询
- **AND** 返回匹配度最高的 5 份参考简历的对应 section 原文
- **AND** 结果拼入 LLM optimization prompt 的"参考范例"区域

#### Scenario: 无匹配结果

- **WHEN** FTS5 检索返回 0 条结果
- **THEN** 优化仍正常进行，仅基于 JD keywords
- **AND** 不在 prompt 中添加"参考范例"区域

### Requirement: 参考简历浏览与删除

用户 SHALL 可以在 CV 页面浏览和管理已导入的参考简历。

#### Scenario: 参考简历列表展示

- **WHEN** 用户打开简历管理页
- **THEN** 右侧面板"参考简历"区域 SHALL 显示所有已导入参考简历的名称、标签、来源图标
- **AND** 每份参考简历可展开查看 sections 预览

#### Scenario: 删除参考简历

- **WHEN** 用户点击参考简历的删除按钮
- **THEN** 系统 SHALL 从 `reference_resumes` 表和 FTS5 索引中移除该记录
- **AND** 弹出确认对话框"确定删除参考简历『{name}』？"
