## ADDED Requirements

### Requirement: Chinese auto-pipeline mode

The system SHALL provide a Chinese auto-pipeline mode at `modes/zh/auto-pipeline.md` that automatically triggers the full evaluation pipeline (JD extraction → A-G evaluation → report → PDF → tracker) when a user pastes a Chinese job description URL or text.

#### Scenario: User pastes a Boss直聘 job URL

- **WHEN** user provides a URL from a Chinese job platform (Boss直聘, 拉勾, 猎聘, 脉脉, 智联招聘, 51job) or raw Chinese JD text
- **THEN** the system SHALL auto-detect Chinese language content
- **AND** route to `modes/zh/jianzhi.md` for evaluation
- **AND** produce a report in `reports/` with Chinese naming convention

#### Scenario: Language auto-detection triggers Chinese mode

- **WHEN** a JD contains primarily Simplified Chinese characters (CJK Unified Ideographs)
- **THEN** the system SHALL use `modes/zh/` for all evaluation steps
- **AND** the report header SHALL list "模式: 中文 (zh)" in metadata

### Requirement: Chinese pipeline batch processing mode

The system SHALL provide a Chinese pipeline mode at `modes/zh/pipeline.md` for processing a list of pending Chinese job URLs from `data/pipeline.md`. The mode MUST handle Chinese platform URLs and produce Chinese-language reports.

#### Scenario: Batch processing Chinese pipeline URLs

- **WHEN** user runs the pipeline command with Chinese JDs in `data/pipeline.md`
- **THEN** each URL SHALL be processed through the Chinese evaluation engine
- **AND** results SHALL be written to Chinese-language reports
- **AND** tracker entries SHALL use Chinese canonical status names

### Requirement: Chinese PDF CV generation mode

The system SHALL provide a Chinese PDF generation mode at `modes/zh/pdf.md` that adapts the existing CV generation for Chinese resume conventions. At minimum, it MUST declare Chinese CV format considerations and instruct the AI to handle Chinese resume-specific elements.

#### Scenario: Generating a Chinese resume PDF

- **WHEN** user requests a PDF CV in Chinese
- **THEN** the system SHALL use the existing `templates/cv-template.html` with Chinese font support (Noto Sans SC or equivalent)
- **AND** produce a document that handles Chinese name format, education chronology, and work experience in Chinese convention
- **AND** output SHALL be A4 format (standard in China) as the default

#### Scenario: Chinese resume content adaptation

- **WHEN** generating Chinese resume content from `cv.md`
- **THEN** it SHALL respect Chinese resume norms: whether to include photo (user choice), basic personal info fields, and education details
- **AND** the summary section SHALL be written in natural Chinese professional language
