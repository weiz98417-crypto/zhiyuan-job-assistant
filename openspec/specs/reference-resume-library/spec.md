# Spec: Reference Resume Library

## Purpose

Import, store, browse, and leverage excellent reference resumes to enhance AI-driven CV optimization through style reference and FTS5 keyword retrieval.

## ADDED Requirements

### Requirement: 参考简历导入

系统 SHALL 支持用户通过 PDF 上传、Word 文档上传、图片上传（OCR 解析）或文本粘贴导入优秀简历作为参考。

#### Scenario: PDF 上传导入

- **WHEN** 用户上传 PDF 格式的参考简历
- **THEN** 后端先尝试 pdf-parse 提取文本，失败时回退到智谱多模态 OCR 识别
- **AND** AI 解析文本内容，提取为结构化 sections（Summary/Experience/Projects/Skills/Education）
- **AND** 返回解析结果供用户确认和编辑
- **AND** 确认后写入 `reference_resumes` 表

#### Scenario: Word 文档导入

- **WHEN** 用户上传 .docx 格式的参考简历
- **THEN** 后端使用 mammoth 提取文本内容
- **AND** AI 解析为结构化 sections
- **AND** 返回解析结果供用户确认和编辑

#### Scenario: 图片 OCR 导入

- **WHEN** 用户上传简历截图（PNG/JPG/WebP）
- **THEN** 后端调用智谱多模态模型识别文字内容并结构化提取
- **AND** 返回解析结果供用户确认和编辑

#### Scenario: 文本粘贴导入

- **WHEN** 用户粘贴简历全文文本
- **THEN** 系统通过 AI 自动识别分段并解析为结构化 sections
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
- **THEN** 系统 SHALL 自动追加时间戳后缀以避免冲突

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

### Requirement: 参考简历浏览与维护

用户 SHALL 可以在 CV 页面浏览、编辑和管理已导入的参考简历。

#### Scenario: 参考简历列表展示

- **WHEN** 用户打开简历管理页
- **THEN** 右侧面板"参考简历"区域 SHALL 显示所有已导入参考简历的名称、来源图标、日期
- **AND** hover 时显示"查看"按钮，点击进入全屏 modal 浏览器

#### Scenario: Modal 浏览器查看与编辑

- **WHEN** 用户点击参考简历的"查看"按钮
- **THEN** 系统 SHALL 打开全屏 modal，展示简历的完整 sections 内容
- **AND** 支持重命名简历（点击标题编辑）
- **AND** 支持编辑每个 section 内容（点击"编辑"按钮进入 textarea）
- **AND** 支持编辑备注
- **AND** 底部展示"同类标签的简历"交叉引用卡片（基于 tag 交集排序）

#### Scenario: 删除参考简历

- **WHEN** 用户点击参考简历的删除按钮
- **THEN** 系统 SHALL 从 `reference_resumes` 表和 FTS5 索引中移除该记录
- **AND** 弹出确认对话框"确定删除参考简历『{name}』？"
