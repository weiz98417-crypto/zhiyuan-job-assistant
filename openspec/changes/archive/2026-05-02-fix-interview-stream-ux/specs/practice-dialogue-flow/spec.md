## ADDED Requirements

### Requirement: User-first practice initiation

The practice panel SHALL NOT automatically send messages to the AI coach. The user MUST initiate the first message.

#### Scenario: Fresh practice session opens

- **WHEN** the user clicks "练习此题" on a question that has not been practiced before
- **THEN** the practice panel SHALL open with the question context displayed
- **AND** the input placeholder SHALL read "输入你对于这道题的回答..."
- **AND** no message SHALL be sent to the AI coach automatically

#### Scenario: Re-practice session opens

- **WHEN** the user clicks "重新练习" on a previously practiced question
- **THEN** the practice panel SHALL open with the question context displayed
- **AND** the previous chat history SHALL be preserved (if available)
- **AND** no message SHALL be sent to the AI coach automatically

#### Scenario: User submits their answer

- **WHEN** the user types their answer in the input field and presses Enter or clicks Send
- **THEN** the system SHALL send a POST `/api/interview/coach/stream` with the user's answer
- **AND** the `questionContext` SHALL include the question text, context, storyHint, jdSummary, and cvSummary
- **AND** the AI coach SHALL return structured feedback on the user's answer

### Requirement: Correct save behavior

The "保存到题库" button SHALL save the user's answer, not the AI coach's feedback.

#### Scenario: User saves after practicing

- **WHEN** the user clicks "保存到题库" after receiving AI feedback
- **THEN** the saved `answer` field SHALL contain the user's own messages concatenated
- **AND** the saved record SHALL include the question, questionCategory, and createdAt
- **AND** the AI coach's feedback messages SHALL NOT be included in the answer field

#### Scenario: User saves without any message

- **WHEN** the user clicks "保存到题库" without having sent any message
- **THEN** the button SHALL be disabled or not visible
