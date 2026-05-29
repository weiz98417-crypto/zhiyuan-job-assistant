## ADDED Requirements

### Requirement: Tool result cards distinguish success and failure
Tool result cards SHALL visually distinguish between successful and failed tool executions. Success cards SHALL have a green-tinted border and checkmark icon. Failure cards SHALL have a red-tinted border and alert icon, displaying the error reason prominently.

#### Scenario: Successful tool result
- **WHEN** tool execution returns `{success: true}`
- **THEN** card renders with green left border, ✓ icon, tool name header, and human-readable result summary

#### Scenario: Failed tool result
- **WHEN** tool execution returns `{success: false}`
- **THEN** card renders with red left border, ✗ icon, tool name header, error message in red text, and no raw JSON wrapping

### Requirement: Tool results show human-readable summary
Tool result cards SHALL display the formatted result string (from `formatResult`) as the primary content, not the raw JSON or wrapped object. Raw data SHALL be available via expandable detail section (collapsed by default).

#### Scenario: Formatted result displayed primarily
- **WHEN** tool `get_weather` returns formatted string "北京明天多云，15-25°C"
- **THEN** card shows "北京明天多云，15-25°C" as the main content, not `{"result": "...", "success": true}`

#### Scenario: Expandable raw data
- **WHEN** user clicks "查看详情" on a tool result card
- **THEN** raw data section expands to reveal the original tool output

### Requirement: Tool result cards are compact and scannable
Tool result cards SHALL have a maximum default height of 12 lines, with overflow scroll. The tool name header SHALL use a monospace font. Cards SHALL animate in with a subtle slide+fade.

#### Scenario: Long result is scrollable
- **WHEN** tool returns a result longer than 12 lines
- **THEN** card content area is scrollable with a max-height constraint
