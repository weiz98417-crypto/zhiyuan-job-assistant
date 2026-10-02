# 0041 - Resume artifacts pass a graded factuality gate before entering drafts

Date: 2026-10-03

## Status

Accepted

## Context

The 2026-10 capability review found that resume optimization and generation products pass only a format guard (placeholder and conversation-residue blocking in resume-save-guard) before reaching the user. The faithfulness scorer and fabricated-array veto already exist in the agent-eval module but have zero production call sites — the code comments themselves say they run only on eval fixtures. Meanwhile fabricated numbers are the top reason users distrust AI resume editing, and the product's own integrity-evidence pipeline proves deterministic checking is in reach: ingestion already computes 100%-required number coverage.

## Decision

The verify position of the resume optimization flow runs a graded factuality gate:

1. **Number provenance (deterministic, hard)**: every number in a produced section must trace to the source resume, the referenced JD, or a user-confirmed record. Untraceable content may not enter a resume draft artifact. One automatic retry re-runs generation with the specific violation as feedback; if it still fails, the section stays original and the proposal states the reason.
2. **Faithfulness (LLM judge, soft)**: the existing scorer is wired from agent-eval into this production verify position; a low score demotes the proposal to advisory-only rather than blocking.

The format guard is unchanged and runs first.

## Consequences

Fabrication is blocked structurally rather than by prompt instruction — this is why optimize can retry itself once. Users can no longer receive a draft whose numbers have no source. The untrusted-input side (JD text, uploaded resumes) is covered separately by a promptfoo red-team suite: a ~30-case core set (injection/PII) in per-PR CI, the full 200+ set pre-release. ATS checking splits along the same seam: contact format, section completeness and format risk become deterministic rules; quantification and keyword matching stay LLM-judged; a render→parse→round-trip check against generate-cv-pdf enters CI as the resume rendering regression.
