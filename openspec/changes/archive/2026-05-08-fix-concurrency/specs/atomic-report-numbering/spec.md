## ADDED Requirements

### Requirement: Report numbers allocated atomically
The system SHALL allocate report numbers using filesystem atomic operations (`mkdirSync`) to prevent duplicate assignments from concurrent agents.

#### Scenario: Single agent allocates a number
- **WHEN** `scripts/next-report-num.mjs` runs
- **AND** the highest existing report number is 041
- **THEN** it outputs `042` and creates `reports/.locks/042/`
- **AND** exits with code 0

#### Scenario: Two concurrent agents get different numbers
- **WHEN** two processes run `next-report-num.mjs` simultaneously
- **AND** the highest existing number is 041
- **THEN** one gets `042`, the other gets `043`
- **AND** no number is assigned twice

#### Scenario: Lock directory already exists for a number
- **WHEN** `next-report-num.mjs` tries to lock number 042
- **AND** `reports/.locks/042/` already exists
- **THEN** it increments to 043 and retries
- **AND** returns the first available number

### Requirement: Stale locks are cleaned up
The system SHALL clean up lock directories older than 1 hour before allocating new numbers.

#### Scenario: Stale lock from crashed agent
- **WHEN** `reports/.locks/042/` was created more than 1 hour ago
- **AND** `next-report-num.mjs` runs
- **THEN** it removes the stale lock directory
- **AND** number 042 becomes available again

#### Scenario: Fresh lock is respected
- **WHEN** `reports/.locks/042/` was created 30 seconds ago (another agent is still running)
- **AND** `next-report-num.mjs` runs
- **THEN** it skips 042 and tries 043

### Requirement: Agent calls next-report-num.mjs before report generation
`modes/pipeline.md` SHALL instruct Agent to call `node scripts/next-report-num.mjs` before extracting JD content.

#### Scenario: Pipeline mode uses atomic numbering
- **WHEN** Agent processes a URL in pipeline mode
- **THEN** step 1 is `node scripts/next-report-num.mjs` to get the report number
- **AND** the report file is created as `reports/{num}-{slug}-{date}.md` using that number
