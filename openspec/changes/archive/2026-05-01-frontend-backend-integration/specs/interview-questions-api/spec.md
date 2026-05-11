## ADDED Requirements

### Requirement: Generate role-specific interview questions
The system SHALL accept company name, role title, and optional archetype, then return AI-generated interview questions tailored to the specific role.

#### Scenario: Generate behavioral questions
- **WHEN** user requests `category: "behavioral"` for role "AI产品经理" at "字节跳动"
- **THEN** system returns 5 behavioral questions with context hints explaining why each question is relevant to this role

#### Scenario: Generate all categories
- **WHEN** user requests `category: "all"` (default)
- **THEN** system returns questions across 4 categories: behavioral, technical, case-study, culture — 3-5 questions each

#### Scenario: Missing required fields
- **WHEN** `company` or `role` is empty
- **THEN** system returns `{ success: false, error: "请提供公司和岗位名称" }` with HTTP 400

### Requirement: Story hints for STAR preparation
The system SHALL provide story hints suggesting what kind of STAR+R story to prepare for each question.

#### Scenario: Story hint for leadership question
- **WHEN** question asks "描述一次你主导的成功项目"
- **THEN** storyHint field SHALL contain guidance like "准备一个你主导、有可量化成果的项目案例"

### Requirement: Fallback to hardcoded questions
The system SHALL fall back to built-in general questions when AI is unavailable.

#### Scenario: DeepSeek API down
- **WHEN** DeepSeek API returns non-200 status
- **THEN** system returns `{ success: false, error: "AI 生成暂时不可用，请使用预设问题" }` with HTTP 502
- **AND** frontend displays the hardcoded QUESTION_CATEGORIES as fallback
