## ADDED Requirements

### Requirement: JD list refreshes on config expand

The JD selector dropdown SHALL reload from IndexedDB each time the configuration area is expanded.

#### Scenario: User opens config after adding a JD on evaluate page

- **WHEN** user navigates to evaluate page, adds a new JD, then returns to interview page and expands the config area
- **THEN** the JD selector SHALL include the newly added JD without requiring a full page refresh

#### Scenario: Config area stays collapsed

- **WHEN** the config area is collapsed and questions have been generated
- **THEN** the JD list SHALL NOT be re-queried until user expands the config area

### Requirement: CV status refreshes on config expand

The CV readiness indicator SHALL re-check localStorage each time the configuration area is expanded.

#### Scenario: User updates CV on CV page then returns

- **WHEN** user navigates to CV page, edits their resume, returns to interview page and expands config
- **THEN** the CV indicator SHALL reflect the updated state (ready / empty)
- **AND** the cached cvText in state SHALL be refreshed

### Requirement: Generate questions always uses latest CV

The generate function SHALL call `getCVFullText()` at request time, not rely on cached state alone.

#### Scenario: CV changed between page load and question generation

- **WHEN** user loaded the interview page with an empty CV, then filled in CV on another tab, then returned and clicked "生成面试题目"
- **THEN** the API SHALL receive the latest CV content
