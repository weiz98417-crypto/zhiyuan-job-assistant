## ADDED Requirements

### Requirement: 逐段优化 API

系统 SHALL 提供 `POST /api/cv/optimize-section` 端点，基于原文 + 用户意图 + 双滑块参数生成 2-3 个改写方案。

#### Scenario: 生成 3 个方案（有 JD 配对）

- **WHEN** 前端发送优化请求，包含 section 原文、意图、滑块值、targetJD
- **THEN** API 返回 3 个 variant：方案 A（激进）、方案 B（保守）、方案 C（定向）
- **AND** 每个 variant 包含 `label`、`content`、`approach` 字段
- **AND** 3 个方案的 content 有明显差异性

#### Scenario: 生成 2 个方案（无 JD 配对）

- **WHEN** 前端发送优化请求，未传 targetJD
- **THEN** API 返回 2 个 variant：方案 A（激进）、方案 B（保守）
- **AND** 不返回方案 C

#### Scenario: 优化参数不足

- **WHEN** sectionContent 为空或不足 20 字符
- **THEN** API 返回 `{ success: false, error: "段落内容太少，无法优化" }`
- **AND** HTTP 状态码为 400

#### Scenario: AI 服务异常

- **WHEN** DeepSeek API 返回错误或超时
- **THEN** API 返回 `{ success: false, error: "AI 优化请求失败" }`
- **AND** HTTP 状态码为 502

### Requirement: 双滑块参数映射

API SHALL 将滑块数值映射为 prompt 中的具体改写指令。

#### Scenario: 激进程度映射

- **WHEN** aggressiveness 为 1-3
- **THEN** prompt 指示「仅润色措辞、修正语法、保留原文结构」
- **WHEN** aggressiveness 为 4-7
- **THEN** prompt 指示「适度调整句式、补充量化描述、优化动词」
- **WHEN** aggressiveness 为 8-10
- **THEN** prompt 指示「大幅重构段落、可改变信息组织方式、STAR 格式化」

#### Scenario: 关键词密度映射

- **WHEN** keywordDensity 为 1-3
- **THEN** prompt 指示「保持自然语言，无需刻意植入关键词」
- **WHEN** keywordDensity 为 4-7
- **THEN** prompt 指示「适度融入行业术语和 JD 关键词」
- **WHEN** keywordDensity 为 8-10
- **THEN** prompt 指示「最大化关键词覆盖，确保 ATS 匹配率」

### Requirement: 全局上下文注入

API SHALL 将 UserProfile 和全量 CV 内容注入 prompt 以保持语气一致性。

#### Scenario: 注入 UserProfile

- **WHEN** 请求中包含 userProfile
- **THEN** prompt 中包含用户的 headline、superpowers、targetRoles
- **AND** 指示 AI 以该用户职业身份的语气进行改写

#### Scenario: 注入全量 CV 上下文

- **WHEN** 请求中包含 fullCV（所有 section）
- **THEN** prompt 中包含其他 section 的摘要
- **AND** 指示 AI 保持与其他 section 的风格和叙事线一致
