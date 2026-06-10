# Spec Delta: Agent Quality Runtime

## ADDED Requirements

### Requirement: Durable agent run ledger

Agent work that can call tools or mutate user state SHALL be persisted as an agent run with step-level progress.

#### Scenario: Run created before execution

- **WHEN** the user starts a tool-capable agent task
- **THEN** the system SHALL create an `agent_run` record with user id, session id, task type, agent id, status, and task contract
- **AND** each tool or verification phase SHALL append an `agent_run_step`

#### Scenario: Page refresh during active run

- **WHEN** the user refreshes or returns to the agent chat while a run is active
- **THEN** the UI SHALL load the latest run state from the ledger
- **AND** show whether the run is running, waiting for approval, verifying, repairing, failed, or succeeded

### Requirement: Task contract before high-risk execution

High-risk agent tasks SHALL have explicit success criteria before writes execute.

#### Scenario: Resume edit contract

- **WHEN** an agent prepares to edit a resume section
- **THEN** the contract SHALL include target section, base version or base hash, approval requirement, validators, and read-back criteria
- **AND** the agent SHALL NOT claim success until those criteria are satisfied

#### Scenario: Contract unmet after tool execution

- **WHEN** a tool returns but read-back or validation does not satisfy the task contract
- **THEN** the run SHALL be marked failed or repairing
- **AND** the final assistant message SHALL NOT say the write succeeded

### Requirement: Runtime verifier evidence

High-risk actions SHALL expose machine-checkable verifier evidence.

#### Scenario: Verified write succeeds

- **WHEN** a high-risk action completes
- **THEN** the run step SHALL include evidence such as read-back hash, target id, validator result, and persisted version id
- **AND** the user-facing UI MAY summarize this evidence without leaking private raw text

#### Scenario: LLM-only self-review

- **WHEN** the system performs semantic self-review with an LLM
- **THEN** that review SHALL be secondary evidence only
- **AND** deterministic read-back or schema verification SHALL still be required for database writes

### Requirement: Bounded self-healing policy

Agent failures SHALL be handled by explicit repair policies, not unbounded retries.

#### Scenario: Transient failure

- **WHEN** a tool fails with a transient error
- **THEN** the runtime MAY retry with backoff up to the configured limit
- **AND** every retry SHALL be recorded in the run ledger

#### Scenario: Validation failure

- **WHEN** content validation fails before a write
- **THEN** the runtime SHALL NOT write the content
- **AND** it SHALL return a safe failure explaining what was blocked

#### Scenario: Read-back mismatch

- **WHEN** a write appears to succeed but read-back does not match expected state
- **THEN** the runtime SHALL mark the run as failed or rolled back
- **AND** SHALL NOT allow the agent to claim success

### Requirement: Runtime adapter boundary

The agent runtime implementation SHALL be swappable behind a stable adapter.

#### Scenario: Current orchestrator adapter

- **WHEN** the app runs the existing orchestrator
- **THEN** it SHALL implement the shared runtime adapter interface
- **AND** preserve existing streaming events through the adapter

#### Scenario: External framework spike

- **WHEN** evaluating AutoGen, Microsoft Agent Framework, LangGraph-style runtimes, or another framework
- **THEN** the spike SHALL use the same adapter contract and the same resume draft/apply benchmark
- **AND** no production workflow SHALL depend on the external framework until the benchmark passes release gates
