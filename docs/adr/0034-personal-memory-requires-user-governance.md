# 0034 - Personal memory requires user governance

Date: 2026-09-24

## Status

Accepted

## Context

ADR-0028 defines a layered memory system, but an automatic conversational write pipeline and broad admin editing would turn incidental speech into active personal facts and give the wrong people access to them. ADR-0033 separates correction from erasure. The user also needs a way to inspect what the system remembers without being interrupted by a confirmation dialog after every conversation.

## Decision

1. User-confirmed current job-seeking preferences and read-back-verified task results may become active facts through their existing governed paths. Incidental conversation produces personal memory candidates only; candidates cannot influence retrieval, recommendations, or Task Program decisions until the user confirms them. A direct “remember this” request opens an immediate confirmation of the exact fact. Candidate extraction is optional per user and defaults on with a first-use explanation.
2. The memory-management page shows the user's private facts, their source and status, and separate actions to correct or erase them. Correction invalidates the old fact and activates a sourced replacement; erasure follows ADR-0033. A conversational erasure request opens the same scoped confirmation flow. Ordinary candidates appear in a quiet review list with a light notification, never a blocking prompt. Unconfirmed personal conversation candidates expire and are erased after 30 days; this rule does not apply to team-shared material review queues. Turning automatic candidate discovery off immediately clears its outstanding unconfirmed conversation candidates, while active facts remain available for separate correction or erasure.
3. Private facts and observations are visible and editable by their owner. Admins normally see only team-shared review material and de-identified governance metrics. Individual support access requires a user-granted, scoped, time-limited authorization and audit. Passwords, API keys, and identity numbers never enter long-term memory. Salary floors, work authorization, health limitations, and similar job-relevant sensitive facts enter a private partition only after the user explicitly confirms their use for job seeking; incidental speech and source documents cannot supply that confirmation.
4. A single dismissal or click may affect only a low-weight, short-lived ranking signal. Repeated consistent behavior can suggest a pending preference for the user to confirm, but cannot create a company blacklist or override a stated current preference. Stable experience facts have no blanket expiry. Volatile active preferences such as city and salary receive a review prompt every 90 days; once review is due, they stop driving automatic filters until reaffirmed.
5. Migration to the new ledger is evidence graded: directly confirmed user facts and verified task facts with reliable provenance may remain active; traceable inferred facts become 30-day pending candidates; untraceable and sensitive legacy items do not migrate into live memory automatically. Migration does not convert a model inference into user confirmation.

## Consequences

The conversational write pipeline can flush candidate proposals in the background, but ADD/UPDATE/DELETE decisions cannot bypass user confirmation for incidental personal facts. User governance, team moderation, task records, and targeted erasure remain distinct. Existing admin editing and behavior-derived preference specifications must be narrowed to this ownership and evidence model before the new memory runtime becomes authoritative.
