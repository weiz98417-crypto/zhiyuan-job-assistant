# Spec Delta: Offer Report Storage

## ADDED Requirements

### Requirement: Saved offer reports preserve evaluation snapshots

Offer reports SHALL store the evaluated offer facts and evaluation model version so later offer edits do not silently mutate past conclusions.

#### Scenario: Offer is edited after evaluation

- **WHEN** the user edits an offer after an evaluation report has been saved
- **THEN** the old report SHALL continue showing the original evaluated snapshot
- **AND** the UI MAY indicate that the source offer has changed since the report was created

### Requirement: Offer report output is layered

Offer evaluation tools SHALL return layered output suitable for AgentChat, UI display, and durable storage.

#### Scenario: Agent evaluates an offer

- **WHEN** the `evaluate_offer` tool completes
- **THEN** it SHALL return a short `llmSummary` for the chat
- **AND** it SHALL return a `uiPayload` for cards, buttons, and report links
- **AND** it SHALL store full `rawData` in the report record
- **AND** AgentChat SHALL NOT render the full raw report inline by default

