## ADDED Requirements

### Requirement: Chinese canonical state aliases

The system SHALL add Simplified Chinese aliases to each canonical state in `templates/states.yml` so that the dashboard and tracker can display Chinese status names when operating in Chinese mode.

#### Scenario: Chinese status display in tracker

- **WHEN** viewing the application tracker in Chinese mode
- **THEN** status values SHALL support Chinese aliases: 已评估 (Evaluated), 已投递 (Applied), 已回复 (Responded), 面试中 (Interview), 已获Offer (Offer), 已拒绝 (Rejected), 已放弃 (Discarded), 跳过 (SKIP)
- **AND** the Chinese aliases SHALL be case-insensitive and strip markdown formatting

#### Scenario: Status normalization in Chinese

- **WHEN** a tracker entry uses a Chinese status alias
- **THEN** `normalize-statuses.mjs` SHALL recognize and normalize Chinese aliases to canonical state IDs
- **AND** `verify-pipeline.mjs` SHALL accept Chinese aliases as valid states

### Requirement: Chinese profile configuration template

The system SHALL provide a Chinese-specific profile example at `config/profile.example.zh.yml` with RMB-based compensation ranges, Chinese location conventions, and target roles adapted for the Chinese AI job market.

#### Scenario: User creates profile from Chinese template

- **WHEN** a new user copies `config/profile.example.zh.yml` to `config/profile.yml`
- **THEN** the template SHALL include: Chinese currency (RMB), Chinese location fields (省市), 五险一金 expectations, and target archetypes matching the six Chinese AI non-technical roles
- **AND** salary ranges SHALL be in CNY/month (月薪) with 税前标注

### Requirement: CLAUDE.md Chinese mode detection guidance

The system SHALL update `CLAUDE.md` to include guidance on when to use Chinese modes, following the same pattern as existing language mode detection for German, French, and Japanese.

#### Scenario: AI detects a Chinese JD

- **WHEN** a JD is primarily in Simplified Chinese or from a Chinese platform (.cn domain)
- **THEN** the AI SHALL follow CLAUDE.md guidance to suggest or auto-switch to `modes/zh/`
- **AND** the guidance SHALL be: "If the user is targeting Chinese-language job postings, lives in China, or asks for Chinese output, use modes in `modes/zh/`"

#### Scenario: User sets language preference in profile

- **WHEN** `config/profile.yml` has `language.modes_dir: modes/zh`
- **THEN** the system SHALL always use Chinese modes for all evaluations
- **AND** Chinese becomes the default output language for reports and CVs
