# Spec 40 W07 sensitive salary admission slice — 2026-10-14

This isolated slice implements the salary-sensitive admission and private-storage behavior of ISS-028 (`PG-MEM-003`). It does not close W07, ISS-059's unavailable/empty UI distinction, the 67-issue remediation, or the 392-case external acceptance gate. It changes no production configuration or records.

## Approved boundary and behavior

The service seam is `admitMemory` / `resolveMemoryCandidate` with a real PostgreSQL ledger and an independent read-back connection. The existing classifier seam supplies supporting, deterministic evidence. The database fixture is schema-only `spec40_memory`, restricted to `127.0.0.1:55440`; each test owns a random synthetic user and explicitly grants its permitted core/private ACLs. Business reads never provision authorization.

- Natural statements such as `我期望30K`, `工资3万`, `税前月薪30000元`, `salary30K`, `月薪三万`, and `不接受低于三万` are job-sensitive. A current preference requires explicit job-seeking use confirmation and goes only to private memory.
- The complete known source sentence `我不接受低于3万的岗位` and a range such as `我期望30K到40K` receive the same protection. A range ending in `用户` or a lower bound about `浏览量` remains nonfinancial.
- Sensitive source quotes influence both admission and partition resolution, even when the proposed canonical text/object hides the amount.
- `conversation_message` and `user_explicit_memory` remain the recognized user sources for current-preference admission. Unknown, agent, reference, document, and `profile_signal` sources cannot activate preferences by claiming `directCurrentIntent` or consent.
- Denial, quotation, examples, historical statements, and other people's salary statements cannot activate a current preference. The rejection holds even when the caller overclaims both intent and consent. A financial lower bound expressed as `不接受低于3万` is preserved as a genuine constraint after confirmation.
- Nonfinancial amounts such as 30K users, 30,000 lines of code, 30 years of age, and a minimum 30,000 page views do not acquire sensitive salary classification merely because they contain numbers.
- Explicit remember requests remain pending and private, have no ledger influence before confirmation, and still require separate purpose confirmation. Rejection is terminal for that candidate; later confirmation replay cannot activate it.
- A pending legacy salary candidate labeled core/none is reclassified to private/job-sensitive on exact confirmation. The candidate update, episode, fact, decision, entity, and chunk write share a transaction. This behavior does not migrate or alter already-active historical salary facts.
- Sensitive candidate confirmation persists the explicit `job_seeking` purpose, owner, candidate ID, original source type/ID, exact private fact and confirmation time in both candidate evidence and its source episode, preserving the original quote and metadata. Consent claimed in the unconfirmed candidate does not replace a new confirmation action. Failed writes roll back both purpose evidence and ledger records.
- Direct active admission also writes its source episode and ledger within one transaction. Missing private write authorization leaves no salary-bearing episode or partial ledger write.

## Preserved failures and verification

All logs are ignored artifacts under `.private/spec40/` and remain separate from successful retries.

| Evidence | Result | Meaning |
| --- | --- | --- |
| `memory-salary-first-red.log` | 1 failed, 10 passed | Natural expectation was active without purpose confirmation. |
| `memory-salary-forms-red.log` | 9 failed, 16 passed | Natural Chinese/English salary variants escaped classification. |
| `memory-salary-provenance-red.log` | 19 failed, 27 passed | Nonpersonal/denied sources and overclaimed source types could activate preferences. |
| `memory-salary-evidence-red.log` | 5 failed, 45 passed | Additional denial/history and sensitive quote-only partition gaps. |
| `memory-salary-pg-first-red.log` | 1 fixture setup failure | Initial synthetic user lacked required display name; corrected before product failure capture. |
| `memory-salary-pg-contract-red.log` | 1 failed | Existing pending salary candidate could confirm as core/none. |
| `memory-salary-english-red.log` | 1 failed, 50 passed | Bare `salary30K` was not accepted as a purpose-confirmable direct statement. |
| `memory-salary-admission-atomic-red.log` | 1 failed, 18 not selected | Denied private ACL left a salary-bearing source episode. |
| `memory-salary-admission-atomic-green.log` | 70 passed: 51 classifier, 19 PostgreSQL | Transaction fix checkpoint. |
| `memory-salary-legacy-current-red.log` | 1 failed, 19 not selected | User's newly confirmed current salary received NOOP against the same old core text; the later targeted green run verifies the ledger's cross-partition replacement repair. |
| `memory-salary-money-suffix-red.log` | 3 failed, 51 passed | `/月` and `左右` variants escaped amount classification. |
| `memory-salary-money-suffix-green.log` | 54 passed | Latest classifier regression including currency-period suffixes. |
| `memory-salary-final-green.log` | 74 passed: 54 classifier, 20 PostgreSQL | Final targeted slice after ledger cross-partition repair. |
| `memory-salary-full-source-red.log` | 4 failed, 76 passed | Independent review found complete known lower-bound and range expressions still escaped classification; both classifier and PostgreSQL reproduce them. |
| `memory-salary-full-source-green.log` | 80 passed: 58 classifier, 22 PostgreSQL | Full source sentences and nonfinancial range counterexamples. |
| `memory-salary-purpose-evidence-red.log` | 1 failed, 21 not selected | Purpose consent was enforced but absent from durable candidate/source evidence. |
| `memory-salary-review-final-green.log` | 81 passed: 58 classifier, 23 PostgreSQL | Current final targeted slice including purpose evidence and rollback. |
| `memory-salary-adjacent.log` | 26 passed, 2 files | Existing fact-ledger and memory-eval-harness support regressions. |

Typechecking and focused ESLint pass after the review repairs; the final 81-test targeted run also passes after the ledger owner's cross-partition repair. Independent batch review and the final batch build/test results are recorded by the parent implementation work; these isolated tests are not a substitute for API/browser/Worker acceptance.

## Remaining evidence

The ledger follow-up now reuses the exact active decision for sequential and concurrent same-source admission, rejects changed objects/partitions/predicates and stale sources, and adds no duplicate NOOP. Root's correction follow-up preserves salary sensitivity and recall when a sourced salary is corrected to a bare amount; private storage, exact consent, model-context projection and replay are verified. End-to-end browser evidence is recorded separately from this service slice. Actual model extraction, sensitive historical inventory and authorized migration, targeted erasure across all stores, volatile-preference review, and the full fault/retrieval matrix remain open. This slice supplies conservative deterministic admission guards; it does not claim exhaustive natural-language intent understanding.
