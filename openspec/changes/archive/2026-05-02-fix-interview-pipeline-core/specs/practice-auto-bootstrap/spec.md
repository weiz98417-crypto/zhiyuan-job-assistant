## ADDED Requirements

### Requirement: Practice panel auto-bootstraps on first open

When the practice panel mounts with a question and no prior messages, the system SHALL automatically send a bootstrap message to trigger the AI coach's first response.

#### Scenario: First time opening practice for a question

- **WHEN** user clicks "练习此题" on a question card and the practice panel opens with an empty chat
- **THEN** the system SHALL automatically send a bootstrap message containing the question text and a request for the coach to analyze the question and guide the user
- **AND** the AI coach SHALL respond with question analysis and structured answer guidance via SSE streaming

#### Scenario: Returning to a previously practiced question

- **WHEN** user clicks "重新练习" on a previously practiced question
- **THEN** the system SHALL NOT auto-bootstrap, allowing user to see past messages or start fresh manually

#### Scenario: Bootstrap message is visible to user

- **WHEN** the auto-bootstrap triggers
- **THEN** the bootstrap message SHALL appear in the chat as a user message so the conversation context is transparent
