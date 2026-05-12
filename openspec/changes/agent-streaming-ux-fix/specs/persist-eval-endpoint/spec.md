## ADDED Requirements

### Requirement: Dedicated evaluation persistence endpoint

A new `/api/agent/persist-eval` POST endpoint SHALL handle saving evaluation results to the database. It SHALL accept evaluation data (company, role, overallScore, archetype, blocks, keywords, legitimacy, date) and call both `upsertApp` and `upsertReport` from `server-db`.

#### Scenario: Successful persist
- **WHEN** POST to `/api/agent/persist-eval` with valid evaluation data
- **THEN** the endpoint SHALL call `upsertApp` with company/role/score/status/archetype
- **AND** call `upsertReport` with full blocks JSON and keywords JSON
- **AND** return `{ success: true, reportNum: <generated number> }`

#### Scenario: Persist with missing fields
- **WHEN** POST body is missing required fields (company or role)
- **THEN** the endpoint SHALL return `{ success: false, error: "缺少公司或岗位信息" }` with status 400

### Requirement: Persistence triggered after stream completion

The client-runner SHALL call `/api/agent/persist-eval` immediately after the evaluation stream completes and finalData is extracted. The call SHALL be non-blocking to the UI — errors SHALL be caught and logged but not surfaced to the user.

#### Scenario: Auto-persist after evaluation
- **WHEN** the stream delegation loop extracts finalData with company and role
- **THEN** client-runner SHALL POST to `/api/agent/persist-eval` with finalData
- **AND** yield `persist_done` with the returned reportNum on success

#### Scenario: Persist fails silently
- **WHEN** the persist API call fails (network error, DB error)
- **THEN** client-runner SHALL catch the error and NOT yield `persist_done`
- **AND** the evaluation result SHALL still be available in the conversation
