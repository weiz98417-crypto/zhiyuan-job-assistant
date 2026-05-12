## ADDED Requirements

### Requirement: Risk scan injected into Block G evaluation

During Block G (职位合法性) evaluation in `/api/evaluate/stream`, the endpoint SHALL first call `/api/agent/scan-risks` to detect risk signals in the JD text. The scan results SHALL be formatted and appended to Block G's system prompt before the LLM call.

#### Scenario: Risk signals injected into Block G
- **WHEN** the A-G evaluation loop reaches block "g"
- **THEN** the endpoint SHALL emit `{ type: "search_start", query: "风险信号扫描", source: "risk-scan" }`
- **AND** call `/api/agent/scan-risks` with the JD text
- **AND** append formatted risk signals to the Block G system prompt

#### Scenario: Risk scan fails gracefully
- **WHEN** the scan-risks API call fails (non-2xx, network error, timeout)
- **THEN** the Block G evaluation SHALL proceed without risk signals
- **AND** no error SHALL be surfaced to the caller (non-blocking)

#### Scenario: No risk signals found
- **WHEN** scan-risks returns an empty array
- **THEN** Block G system prompt SHALL not be modified
