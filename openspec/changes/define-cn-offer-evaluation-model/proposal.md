# Change: define-cn-offer-evaluation-model

## Summary

Define a China-specific single-offer evaluation model before expanding offer comparison.

The app should treat a single offer as something worth evaluating on its own. The model must reflect Chinese employment reality: tax, social insurance, housing fund, probation, labor dispatch/outsourcing, overtime, bonus uncertainty, equity vesting, city cost, contract risk, and negotiation gaps.

## Problem

The current Offer area is centered on comparison. That makes the product feel incomplete because many users first need to decide whether one offer is acceptable before comparing it with others.

Existing offer fields also skew toward simple package comparison and do not fully cover China-specific decision risks:

- tax-before salary can diverge greatly from true take-home income;
- social insurance and housing fund bases are often unclear or below actual salary;
- probation period, employment entity, outsourcing/labor dispatch, and contract terms change the risk profile;
- overtime, rest days, bonus certainty, and equity liquidity are often more important than headline pay;
- missing information should become HR questions rather than be hidden inside the score.

## Goals

- Create a structured single-offer evaluation model.
- Separate hard facts, calculated estimates, risk flags, missing information, and subjective priorities.
- Support saved evaluation reports that the Offer page can display without rerunning the Agent.
- Make the model suitable for later comparison across evaluated offers.
- Keep legal/financial outputs as practical estimates with clear assumptions, not formal advice.

## Non-Goals

- Do not build a full legal compliance engine.
- Do not guarantee exact tax or social insurance calculations for every city.
- Do not make the Offer page itself perform open-ended negotiation reasoning.
- Do not require every field to be present before a useful preliminary evaluation can be saved.

## Proposed Model

Each single-offer report should contain:

1. Basic completeness
   - company, role, city, office location, employment entity, contract type, start date, probation, reporting line.
2. Cash compensation and take-home estimate
   - base salary, salary months, guaranteed/variable bonus, allowances, probation discount, estimated monthly and annual take-home.
3. Social insurance and housing fund reality
   - contribution city, base, percentage, whether full-salary or minimum-base, supplementary insurance.
4. Tax assumptions
   - estimate method, assumed deductions, monthly vs annualized rough result, confidence level.
5. Contract and employment risk
   - direct hire vs dispatch/outsourcing/intern/contractor, probation legality, non-compete, confidentiality, IP, service period, penalty clauses.
6. Workload and leave
   - working schedule, overtime compensation, weekends, annual leave, remote work, travel, rest-day risk.
7. Bonus, commission, equity and RSU certainty
   - payout history, guarantee wording, performance distribution, vesting, exercise, liquidity, forfeiture on exit.
8. City and life-cost fit
   - rent/commute/relocation/household registration or local subsidy factors.
9. Growth and career capital
   - team centrality, project quality, manager quality, title truthfulness, promotion path, skill compounding.
10. Company and team stability
    - business outlook, team churn, HC certainty, layoff/PIP signs, funding or budget risk.
11. Red flags and missing information
    - structured list of risks and unresolved questions.
12. Verdict
    - accept, accept after negotiation, proceed cautiously, or decline, with score components.

## Data Model Direction

Introduce or formalize:

- `OfferSnapshot`
  - immutable normalized offer facts at evaluation time.
- `OfferEvaluationReport`
  - score components, verdict, assumptions, red flags, missing information, HR question seeds, negotiation levers.
- `OfferEvaluationModule`
  - module id, label, facts used, score, confidence, evidence, risks.

The saved report must preserve the snapshot so later edits to the offer do not silently rewrite old conclusions.

