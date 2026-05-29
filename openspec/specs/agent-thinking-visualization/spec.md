## ADDED Requirements

### Requirement: Thinking content displayed to user
The frontend SHALL display the agent's reasoning text during Think and Reflect phases. Thinking content SHALL be rendered in a distinct visual style (italicized, muted background) to differentiate from the final response.

#### Scenario: Think phase shows reasoning
- **WHEN** agent emits `thinking_content` during Think phase
- **THEN** frontend shows a ThinkingBubble with the reasoning text, styled differently from the final assistant message

#### Scenario: Reflect phase shows evaluation
- **WHEN** agent emits `thinking_content` during Reflect phase after tool result
- **THEN** frontend shows a ReflectingIndicator with text like "分析工具结果中..." followed by the reflection reasoning

### Requirement: Phase-aware streaming indicators
The frontend SHALL show phase-specific loading indicators: "思考中..." with animated dots during Think, "正在执行 <tool>" with spinner during Act, "分析结果中..." during Reflect, and streaming text cursor during Respond.

#### Scenario: Phase transitions in UI
- **WHEN** agent transitions from Think → Act → Observe → Reflect → Respond
- **THEN** frontend indicators update in real-time to reflect current phase

### Requirement: PlanCard as optional overlay during ReAct
When `<<PLAN>>` is parsed, PlanCard SHALL render with task progress tracking. Task statuses SHALL update in real-time as the ReAct loop executes each planned step. If no `<<PLAN>>` is present, PlanCard SHALL NOT render.

#### Scenario: PlanCard with ReAct progress
- **WHEN** LLM outputs both `<<PLAN>>` and tool calls
- **THEN** PlanCard shows task list with animated progress, and thinking/reflecting bubbles appear alongside task execution
