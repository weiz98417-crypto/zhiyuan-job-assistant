# Tasks

## 1. Domain Model

- [x] Define shared TypeScript types for `OfferSnapshot`, `OfferEvaluationReport`, `OfferEvaluationModule`, `OfferRiskFlag`, `OfferMissingInfo`, and `OfferVerdict`.
- [x] Map existing `offers` and `offer_reports` data into the new model without losing existing records.
- [x] Add versioning to offer reports so future model upgrades do not break old reports.
- [x] Preserve the evaluated offer snapshot inside each saved report.

## 2. China-Specific Evaluation Modules

- [x] Implement basic completeness checks.
- [x] Implement cash compensation and annual package normalization.
- [x] Implement approximate tax/take-home calculation with visible assumptions.
- [x] Implement social insurance and housing fund risk classification.
- [x] Implement contract and employment-form risk classification.
- [x] Implement overtime/rest-day/leave risk classification.
- [x] Implement bonus/commission/equity certainty classification.
- [x] Implement city/life-cost fit fields and scoring hooks.
- [x] Implement growth, company stability, and team-risk scoring hooks.
- [x] Produce red flags and missing information as structured data.

## 3. Report Output Contract

- [x] Ensure evaluation output includes `llmSummary`, `uiPayload`, and `rawData`.
- [x] Keep full report content in saved report data, not in AgentChat messages.
- [x] Include HR question seeds and negotiation levers in the report for later Agent tools.
- [x] Add confidence levels for estimated or inferred fields.

## 4. Verification

- [x] Test: incomplete offer still saves a preliminary evaluation with missing-info items.
- [x] Test: full-salary vs minimum-base social insurance changes risk output.
- [x] Test: direct hire vs outsourcing/labor dispatch changes employment-risk output.
- [x] Test: variable-only bonus is treated as uncertain unless guarantee wording exists.
- [x] Test: saved report keeps its original snapshot after the offer is edited.
- [x] Run `npm run build`.
