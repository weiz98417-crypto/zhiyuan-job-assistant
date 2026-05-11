## ADDED Requirements

### Requirement: Chinese scoring engine

The system SHALL provide a Chinese-language scoring engine at `modes/zh/_shared.md` that adapts the A-F + G evaluation framework for the Chinese job market. The engine MUST follow the same 1-5 global score architecture as the English version but use China-specific evaluation criteria in each block.

#### Scenario: User pastes a Chinese JD for evaluation

- **WHEN** user pastes a job description in Simplified Chinese (URL or text)
- **THEN** the system evaluates using Chinese-adapted scoring with RMB compensation framework, Chinese archetype detection, and China-specific red flags
- **AND** the system outputs a report entirely in Simplified Chinese

#### Scenario: Compensation evaluation uses Chinese sources

- **WHEN** Block D (compensation) is evaluated
- **THEN** the system SHALL reference 脉脉, 看准网, Boss直聘薪资查询, and OfferShow as salary data sources
- **AND** the system SHALL report salary in RMB with 税前/税后 distinction and note 五险一金基数 when available

#### Scenario: Chinese red flag detection

- **WHEN** the system evaluates a Chinese JD
- **THEN** it SHALL detect and flag: 996/大小周 work schedules, 五险一金 at minimum base, excessive 竞业限制 scope, 试用期 longer than 6 months, vague 年终奖 terms, and unclear 劳动合同 type (外包/本部/劳务派遣)
- **AND** each flag SHALL include a severity level and explanation

### Requirement: Chinese AI non-technical archetype detection

The system SHALL classify every evaluated position into one (or a hybrid of two) of six Chinese AI non-technical archetypes. The classification MUST drive which proof points are emphasized, how the CV summary is written, and which STAR stories are prepared.

#### Scenario: Classifying an AI Product Manager JD

- **WHEN** a JD contains keywords like 产品规划, PRD, 需求分析, 产品路线图, AI/大模型
- **THEN** the system SHALL classify it as "AI产品经理"
- **AND** emphasize product discovery skills, AI capability scoping, and data-driven decision making

#### Scenario: Classifying an AI Operations JD

- **WHEN** a JD contains keywords like 用户增长, 内容运营, 社区, 活动策划, AI工具
- **THEN** the system SHALL classify it as "AI运营"
- **AND** emphasize growth metrics, AI tool proficiency (prompt engineering, content automation), and A/B testing experience

#### Scenario: Classifying an AI Solutions JD

- **WHEN** a JD contains keywords like 售前, 解决方案, POC, 招投标, 客户需求
- **THEN** the system SHALL classify it as "AI解决方案"
- **AND** emphasize technical breadth, client communication, and AI product demonstration ability

#### Scenario: Classifying an AI Project Manager JD

- **WHEN** a JD contains keywords like 项目管理, 敏捷, 交付, 跨部门, AI/模型
- **THEN** the system SHALL classify it as "AI项目经理"
- **AND** emphasize delivery track record, agile methodology, and understanding of model iteration uncertainty

#### Scenario: Classifying an AI Consultant JD

- **WHEN** a JD contains keywords like 数字化转型, 战略, 行业研究, 业务咨询, AI
- **THEN** the system SHALL classify it as "AI咨询顾问"
- **AND** emphasize industry knowledge, methodology, and AI-driven business process redesign

#### Scenario: Classifying an AI Growth/Marketing JD

- **WHEN** a JD contains keywords like 增长, SEO, 投放, 品牌, 内容营销, AI
- **THEN** the system SHALL classify it as "AI增长/市场"
- **AND** emphasize quantified growth results, AI content tool proficiency, and channel expertise

### Requirement: Chinese user profile template

The system SHALL provide a user-customizable profile template at `modes/zh/_profile.md` that maps to the six Chinese AI non-technical archetypes. The template MUST include adaptive framing tables, exit narrative guidance, compensation targets in RMB, and Chinese-market negotiation scripts.

#### Scenario: User customizes their archetype mapping

- **WHEN** a user edits `modes/zh/_profile.md`
- **THEN** they can specify their target archetypes, map their experience to each archetype, and define proof point sources
- **AND** subsequent evaluations SHALL use these customizations to tailor Block B (CV match) and Block E (customization plan)

#### Scenario: Chinese-language negotiation scripts

- **WHEN** the user needs negotiation guidance during an offer stage
- **THEN** the system SHALL provide Chinese-language salary negotiation scripts adapted to market conventions (年终奖 negotiation, 五险一金 base negotiation, 期权/股权 discussion)
- **AND** scripts SHALL be natural, conversational Chinese (not translated from English)

### Requirement: Chinese evaluation workflow

The system SHALL provide a complete A-G 7-block evaluation workflow at `modes/zh/jianzhi.md` that produces reports entirely in Simplified Chinese. Each block MUST mirror the structure of `modes/oferta.md` but with China-adapted content.

#### Scenario: Full A-G evaluation report in Chinese

- **WHEN** a JD is evaluated through `modes/zh/jianzhi.md`
- **THEN** the report SHALL contain all 7 blocks labeled as: A-职位概览, B-简历匹配, C-职级策略, D-薪资市场, E-定制计划, F-面试准备, G-职位真实性
- **AND** each block's content SHALL be in natural Simplified Chinese

#### Scenario: Block G legitimacy assessment for Chinese platforms

- **WHEN** Block G evaluates posting legitimacy on Chinese platforms
- **THEN** the system SHALL check: JD specificity (concrete tech stack vs generic "AI相关"), company-JD consistency (small company hiring top AI talent at low budget), salary range credibility (15k-40k without detail is suspicious), company activity signals on the platform, reposting frequency, and 天眼查/企查查 company records
- **AND** report a three-tier legitimacy confidence: 高可信度, 谨慎推进, 疑似虚假
