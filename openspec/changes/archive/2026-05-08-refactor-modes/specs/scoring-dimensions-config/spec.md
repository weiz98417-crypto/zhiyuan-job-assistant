## ADDED Requirements

### Requirement: scoring-dimensions.yml is the single source of truth for evaluation dimensions
The system SHALL define all evaluation dimensions (A-G) in `modes/scoring-dimensions.yml`. Mode files SHALL read this file instead of inlining dimension definitions.

#### Scenario: English mode reads dimensions from config
- **WHEN** Agent processes an English JD evaluation
- **THEN** `modes/_shared.md` instructs Agent to `Read modes/scoring-dimensions.yml`
- **AND** Agent uses `label_en` for display text
- **AND** Agent evaluates all 7 dimensions (A-G)

#### Scenario: Chinese mode reads dimensions from config
- **WHEN** Agent processes a Chinese JD evaluation
- **THEN** `modes/zh/_shared.md` instructs Agent to `Read modes/scoring-dimensions.yml`
- **AND** Agent uses `label_zh` for display text
- **AND** Agent evaluates all 7 dimensions (A-G)

### Requirement: All language modes use the same dimension count
The system SHALL evaluate 7 dimensions (A-G) in all languages. The G dimension (legitimacy) is no longer Chinese-only.

#### Scenario: English evaluation includes legitimacy
- **WHEN** Agent evaluates an English JD
- **THEN** the report includes a "Posting Legitimacy & Risk" section
- **AND** the weight is 10% of the total score

### Requirement: oferta.md references scoring-dimensions.yml
`modes/oferta.md` SHALL remove its inline declaration of A-G blocks and instead instruct Agent to read `scoring-dimensions.yml`.

#### Scenario: oferta mode reads shared config
- **WHEN** Agent processes an offer evaluation via oferta.md
- **THEN** the mode instructs Agent to read `scoring-dimensions.yml` for the dimension list
- **AND** does NOT contain its own hardcoded dimension definitions

### Requirement: scoring-dimensions.yml is well-formed YAML
The config file SHALL pass YAML validation and contain exactly 7 dimensions with required fields: `id`, `key`, `label_zh`, `label_en`, `weight`.

#### Scenario: YAML validation
- **WHEN** `scoring-dimensions.yml` is parsed by a YAML parser
- **THEN** it returns an array of 7 dimension objects
- **AND** each object has `id` (single uppercase letter), `key` (snake_case), `label_zh`, `label_en`, `weight` (number 1-100)
- **AND** the sum of all weights equals 100
