## ADDED Requirements

### Requirement: Agent executes ReAct loop (Think-Act-Observe-Reflect)
The agent loop SHALL execute as a ReAct cycle where each iteration consists of: Think (LLM reasons about next action), Act (execute tool if needed), Observe (consume tool result), Reflect (LLM evaluates if more tools needed or ready to respond). The cycle SHALL repeat until the LLM decides to respond or `maxIterations` is reached.

#### Scenario: Single tool call then respond
- **WHEN** user asks a query requiring one tool call (e.g., "查投递进度")
- **THEN** agent thinks → calls tool → observes result → reflects "数据足够" → responds with analysis

#### Scenario: Multi-tool ReAct loop
- **WHEN** user asks a query requiring multiple tools (e.g., "分析这个JD链接")
- **THEN** agent executes Think→Act→Observe→Reflect→Think→Act→Observe→Reflect→Respond cycle, with each tool result visible to the user

#### Scenario: Reflect decides more tools needed
- **WHEN** tool result is insufficient for a complete answer
- **THEN** agent's Reflect phase SHALL trigger another Think→Act cycle with a new tool call

#### Scenario: Max iterations reached
- **WHEN** agent exceeds `maxIterations` without reaching Respond phase
- **THEN** agent SHALL force Respond with best-effort answer based on available data

### Requirement: SSE events for each ReAct phase
The client-runner SHALL emit SSE events for each phase transition: `phase:thinking`, `phase:executing`, `phase:reflecting`, `phase:responding`. It SHALL also emit `thinking_content` events with the agent's reasoning text during Think and Reflect phases.

#### Scenario: Thinking phase with content
- **WHEN** agent enters Think phase
- **THEN** SSE yields `{type: "phase", phase: "thinking"}` followed by `{type: "thinking_content", content: "需要先..."}` 

#### Scenario: Reflecting phase after tool result
- **WHEN** tool execution completes and result is added to context
- **THEN** SSE yields `{type: "phase", phase: "reflecting"}` followed by LLM reflection as `thinking_content`

### Requirement: Backward compatible with existing Parse paths
The ReAct loop SHALL remain backward compatible with the existing `<<PLAN>>` and `<<TOOL>>` parsing. If LLM outputs `<<PLAN>>` with tasks, the PlanCard path still works alongside the ReAct loop.

#### Scenario: LLM outputs plan markers
- **WHEN** LLM response contains valid `<<PLAN>>` markers
- **THEN** `plan_created` event is emitted and PlanCard renders, while ReAct loop executes tasks sequentially

#### Scenario: Pure chat fallback
- **WHEN** LLM response contains neither `<<TOOL>>` nor `<<PLAN>>` markers
- **THEN** agent enters Respond phase directly and streams text to user
