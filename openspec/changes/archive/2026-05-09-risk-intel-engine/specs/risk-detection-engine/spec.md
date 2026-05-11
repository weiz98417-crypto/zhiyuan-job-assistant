## ADDED Requirements

### Requirement: Two-layer detection architecture
The system SHALL detect risk signals using a deterministic regex layer followed by an LLM semantic layer.

#### Scenario: Literal match catches a known pattern
- **WHEN** `scripts/scan-risks.mjs` scans JD text containing "leader亲自带，快速成长"
- **AND** `risk-intel-triggers.yml` has a regex matching "亲自带"
- **THEN** the script outputs `[{signal: "亲自带"="长期无偿加班", excerpt: "leader亲自带，快速成长", severity: "high"}]`

#### Scenario: LLM catches a semantic variant
- **WHEN** the literal matcher returns `[]` (no literal hits)
- **AND** the JD says "我们是一个大家庭，工作生活不分家"
- **THEN** the LLM SHALL identify this as a semantic match for "模糊工作边界"
- **AND** SHALL NOT re-flag signals already caught by the literal matcher

#### Scenario: Literal matcher output is passed to LLM
- **WHEN** evaluation mode calls `scan-risks.mjs` before LLM matching
- **THEN** the JSON output SHALL be passed as "已知命中信号" in the LLM prompt
- **AND** the LLM SHALL only output additional semantic findings

### Requirement: Company risk exact matching
Company risk detection SHALL use exact slug matching, not LLM.

#### Scenario: Known risky company detected
- **WHEN** the JD company name normalizes to a slug present in `company_risks`
- **THEN** the company risk signals are appended to the risk table directly
- **AND** the matching is done before LLM evaluation (no semantic inference)

### Requirement: Error handling for missing trigger file
The system SHALL gracefully handle missing trigger files.

#### Scenario: triggers.yml is absent
- **WHEN** `scan-risks.mjs` cannot find `risk-intel-triggers.yml`
- **THEN** it outputs `[]` (empty array, exit 0)
- **AND** evaluation proceeds with LLM-only semantic matching

#### Scenario: risk-intel.md is unparseable
- **WHEN** `risk-intel.md` has broken YAML
- **THEN** the evaluation mode skips semantic matching
- **AND** reports "风险情报库不可用——仅显示字面匹配结果" (if literal results exist)
