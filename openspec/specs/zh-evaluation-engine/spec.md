## MODIFIED Requirements

### Requirement: Chinese scoring engine

The system SHALL provide a Chinese-language scoring engine at `modes/zh/_shared.md` that adapts the A-F + G evaluation framework for the Chinese job market. The engine MUST follow the same 1-5 global score architecture as the English version but use China-specific evaluation criteria in each block. The scoring engine SHALL be consumable by both the CLI Agent and the frontend streaming evaluation API — modes files are the single source of truth for all evaluation logic.

#### Scenario: User pastes a Chinese JD for evaluation

- **WHEN** user pastes a job description in Simplified Chinese (URL or text), regardless of whether via CLI or frontend
- **THEN** the system evaluates using Chinese-adapted scoring with RMB compensation framework, Chinese archetype detection, and China-specific red flags
- **AND** the system outputs a report entirely in Simplified Chinese
- **AND** if evaluated via frontend, the evaluation process SHALL be streamed block-by-block via SSE

#### Scenario: Compensation evaluation uses Chinese sources

- **WHEN** Block D (compensation) is evaluated, regardless of whether via CLI or frontend
- **THEN** the system SHALL reference real-time search results when available
- **AND** the system SHALL report salary in RMB with 税前/税后 distinction and note 五险一金基数 when available
- **AND** if no search results are found, the system SHALL label the analysis as based on industry averages

#### Scenario: Chinese red flag detection

- **WHEN** the system evaluates a Chinese JD
- **THEN** it SHALL detect and flag: 996/大小周 work schedules, 五险一金 at minimum base, excessive 竞业限制 scope, 试用期 longer than 6 months, vague 年终奖 terms, and unclear 劳动合同 type (外包/本部/劳务派遣)
- **AND** each flag SHALL include a severity level and explanation

## ADDED Requirements

### Requirement: Modes 文件作为共享知识源

`modes/zh/_shared.md` 和 `modes/zh/jianzhi.md` SHALL 作为 CLI Agent 和前端流式评估 API 的共享知识源。任何评估逻辑的修改 SHALL 仅在这些文件中进行，不需要同步修改前端 API 代码。

#### Scenario: CLI 和前端评估一致性

- **WHEN** 同一 JD 分别在 CLI 和前端被评估
- **THEN** 两者的评分框架、archetype 分类、block 结构 SHALL 保持一致
- **AND** 差异仅在于数据获取方式（CLI 用 Playwright，前端用 cheerio）
