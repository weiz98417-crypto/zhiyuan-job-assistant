## ADDED Requirements

### Requirement: Weighted risk scoring formula
The system SHALL compute a risk score from hit signal weights and apply tier-specific score degradation.

#### Scenario: Critical signal triggers maximum degradation
- **WHEN** risk detection hits a `critical` severity signal (weight=10, e.g., 诈骗/传销)
- **THEN** the match score is forced to 1.0/5
- **AND** the report displays "⚠️ 建议放弃此岗位"

#### Scenario: High risk without critical triggers partial degradation
- **WHEN** total risk weight ≥ 6 WITHOUT any critical signal (e.g., 1 high=4 + 1 medium=2 = 6)
- **THEN** the match score is capped at min(原分, 2.5)/5
- **AND** the report displays a warning

#### Scenario: Medium risk preserves score with banner
- **WHEN** total risk weight 2-5 (e.g., 1 high=4, or 1-2 medium=2-4)
- **THEN** the match score is unchanged
- **AND** the report header shows "⚠️ 风险提示" banner

#### Scenario: Low risk is normal evaluation
- **WHEN** total risk weight ≤ 1
- **THEN** the evaluation proceeds normally with no risk degradation

### Requirement: Disclosed employment types are informational only
The system SHALL treat explicitly disclosed employment types as informational, not high risk.

#### Scenario: JD discloses outsourcing
- **WHEN** JD text contains "此为外包岗位" or "第三方派遣"
- **THEN** the employment type signal is 🟡 medium (informational)
- **AND** does NOT trigger 🔴 high risk degradation

#### Scenario: External evidence suggests hidden outsourcing
- **WHEN** company risk data suggests外包/派遣 status but JD does not disclose it
- **THEN** the signal is classified as 🔴 high risk

### Requirement: Structured risk output table
The evaluation report SHALL include a standardized risk table.

#### Scenario: Risk table in report
- **WHEN** any risk signals are detected
- **THEN** the report includes a table:
```
## 🛡️ 风险提示

| 信号 | JD原文 | 权重 | 信号等级 | 说明 |
|------|--------|------|----------|------|

**风险总分：X → 综合风险等级：🔴/🟡/🟢**
**建议：** ...
```
