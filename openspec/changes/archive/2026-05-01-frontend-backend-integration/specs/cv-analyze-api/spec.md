## ADDED Requirements

### Requirement: AI-powered CV-JD matching
The system SHALL accept CV section content and JD context (text or keywords), then return structured match analysis including coverage scores and actionable rewrite suggestions.

#### Scenario: Match with keywords
- **WHEN** user provides CV sections and JD keywords like ["产品规划", "数据分析", "用户调研"]
- **THEN** system returns `matchPercent` (0-100), `keywordMatches` array with each keyword marked matched/unmatched, and `suggestions` array with Chinese-language rewrite advice

#### Scenario: Match with full JD text
- **WHEN** user provides CV sections and `jdText` containing a complete job description
- **THEN** system extracts key terms from JD text before matching, and returns per-section `sectionFeedback` with strength scores (1-5) and notes

#### Scenario: Empty CV
- **WHEN** all CV sections are empty
- **THEN** system returns `{ success: false, error: "简历内容为空，请先填写简历" }` with HTTP 400

### Requirement: Missing term suggestions
The system SHALL identify JD keywords not found in CV content and suggest where to incorporate them naturally.

#### Scenario: Gap in skills section
- **WHEN** JD requires "A/B测试" but CV does not mention it
- **THEN** one suggestion SHALL include wording like "建议在项目经验中补充 A/B 测试相关经历"

### Requirement: Language-aware analysis
The system SHALL detect the JD language and generate suggestions in matching language (Chinese or English).

#### Scenario: Chinese JD
- **WHEN** JD text is predominantly Chinese
- **THEN** all suggestions and feedback are returned in Chinese

#### Scenario: English JD
- **WHEN** JD text is predominantly English
- **THEN** all suggestions and feedback are returned in English
