# 0042 - Interview scoring is rubric-anchored and enters memory only as multi-session trends

Date: 2026-10-03

## Status

Accepted (extends ADR-0034 governance to interview observations)

## Context

Interview answer scoring currently writes four-dimension weights into prompt text only; the model scores freely with no anchor calibration, and the score is written straight into long-term memory as an interview observation — low scores even get higher importance. Hallucinated scores therefore pollute the user profile, and single-session scores are noisy anyway (question difficulty, off-day performance). The project already has a veto mechanism (fabricated-array non-empty → fail regardless of total) in its eval stack, unused here.

## Decision

1. **Anchored rubric**: scoring uses a 0-4 banded rubric (adapted into the project dialect from LuJie CareerKit's evaluation rubric, Apache-2.0, credited in NOTICE): every band judgment must cite evidence quoted from the answer; a score without a citation is voided and re-evaluated, following the same veto-code discipline as the fabricated-array mechanism — a new `missing_evidence_citation` code, with `HARD_VETO_PATTERNS` extended to match (free-text vetoes are silently dropped by that filter). Scoring distinguishes three states — does not know, did not articulate, not presented on the resume — and never turns "not presented" into "cannot". Delivery style, accent or nervousness never become ability verdicts. Bands do not convert to a percentage scale.
2. **Trend-gated memory write**: per-session scores report to the user but do not enter the memory ledger. A weakness fact enters the ledger only after persisting across ≥3 sessions, as an inference-class candidate under ADR-0034/ADR-0028 clause 4 — user confirmation activates it; until then it never affects retrieval or recommendations. It lives in the private memory partition (user-visible, correctable, erasable). Both existing direct-write paths (`persistInterviewObservation` and the score_answer tool's inline candidate write) are deleted.

## Consequences

Profile pollution is blocked structurally; the same rubric discipline that makes scores trustworthy also makes them testable — anchored calibration fixtures (same answer re-scored, tolerance ±1 band) become regression tests. Trend facts feed the outcome feedback loop (train k) with clean data. Anchors and calibration fixtures are seeded by LLM draft plus manual review, which doubles as the first human acceptance of the rubric itself.
