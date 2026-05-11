## ADDED Requirements

### Requirement: Generate PDF from CV data
The system SHALL accept CV sections, template selection, and optional profile data, then return a formatted A4 PDF document.

#### Scenario: Successful PDF generation
- **WHEN** user submits complete CV sections (summary, experience, projects, education, skills) with template "clean"
- **THEN** system returns `application/pdf` binary with `Content-Disposition: attachment; filename="cv-{date}.pdf"`

#### Scenario: Missing required sections
- **WHEN** all sections are empty or whitespace-only
- **THEN** system returns `{ success: false, error: "简历内容不能为空" }` with HTTP 400

### Requirement: HTML template rendering
The system SHALL load `templates/cv-template.html` from the project root, replace placeholders with submitted data, and render via headless Chromium.

#### Scenario: Placeholder replacement
- **WHEN** profile includes `fullName: "张三"`, `email: "zhang@example.com"`
- **THEN** rendered HTML contains "张三" in place of `{{NAME}}` and "zhang@example.com" in place of `{{EMAIL}}`

#### Scenario: Template not found
- **WHEN** `templates/cv-template.html` does not exist at the expected path
- **THEN** system returns `{ success: false, error: "CV 模板文件未找到" }` with HTTP 500

### Requirement: ATS-compatible output
The system SHALL generate PDF with proper font embedding, no mojibake characters, and proper text encoding.

#### Scenario: Chinese character rendering
- **WHEN** CV content contains Chinese characters
- **THEN** PDF renders Chinese text correctly without tofu boxes or garbled characters

#### Scenario: ATS text normalization
- **WHEN** CV content contains em-dashes, smart quotes, or non-breaking spaces
- **THEN** these are normalized to ASCII equivalents before PDF rendering
