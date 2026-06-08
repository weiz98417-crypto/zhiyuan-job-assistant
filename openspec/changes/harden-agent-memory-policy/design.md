# Design: harden-agent-memory-policy

## Context

The project already has task-aware memory assembly. The risk now is drift: future agent edits can accidentally include raw excellent-resume snippets in JD evaluation, stale interview notes in offer evaluation, or candidate profile guesses as confirmed facts. The policy must be enforced in code before prompts are assembled.

## Policy Registry

Define a central registry keyed by task type and agent id.

Example task types:

- `resume_optimization`
- `jd_evaluation`
- `offer_evaluation`
- `interview_coaching`
- `profile_growth`
- `reference_resume_save`
- `general_chat`

Each policy defines:

- allowed source types
- denied source types
- allowed memory statuses
- allowed visibility scopes
- whether candidate memory is allowed
- whether raw reference snippets are allowed
- maximum snippets and token budget
- required source labels
- clarification behavior when user intent conflicts with uploaded content

## Enforcement Point

The enforcement should happen before model prompt assembly:

1. Agent declares task type.
2. Context assembler requests structured facts and semantic memory.
3. Policy filters candidate sources by user scope, visibility, status, source type, and task type.
4. Denied sources are logged for debugging but not passed to the model.
5. Prompt receives only labeled, policy-approved memory.

Do not rely only on natural language instructions in the system prompt.

## Default Policy Direction

### Resume Optimization

Allowed:

- current user's resume facts
- target JD facts
- approved excellent-resume snippets
- excellent-resume pattern memory
- user writing preferences

Denied:

- unrelated offer details unless explicitly requested
- other users' private memory

### JD Evaluation

Allowed:

- JD text and extracted facts
- current user's confirmed profile and resume facts
- previous JD reports for the same user
- abstract preferences relevant to job targeting

Denied:

- raw excellent-resume snippets
- other users' private memory

### Offer Evaluation

Allowed:

- offer facts
- compensation preferences
- location and work-style preferences
- previous offer reports for the same user

Denied:

- raw excellent-resume snippets
- unrelated JD reports unless explicitly tied to the offer

### Interview Coaching

Allowed:

- bound JD snapshot
- bound resume snapshot
- interview session state and prior answers
- relevant confirmed profile facts
- answer/story pattern memory only when polishing is requested

Denied:

- raw excellent-resume snippets by default
- unbound stale JD or resume context

### General Chat

Allowed:

- minimal recent session context
- explicit user-provided current turn content

Denied:

- broad semantic memory dumps
- raw private documents unless the user asks for a task that needs them

## Denial Logging

Policy enforcement should record:

- task type
- agent id
- denied source id and source type
- denial reason
- user id scope
- timestamp

Logs are for debugging and governance, not for model context.

## Risks / Trade-offs

- Strict policy can make agents ask more clarification questions. That is acceptable when the alternative is using the wrong memory.
- Too many policy branches can become hard to maintain. Keep policies declarative and table-driven.
- Some tasks are mixed, such as "use this JD to optimize my resume." The router must pick the primary task and can permit secondary sources explicitly.
