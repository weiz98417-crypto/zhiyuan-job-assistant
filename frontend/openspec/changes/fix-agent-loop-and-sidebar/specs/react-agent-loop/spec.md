## ADDED Requirements

### Requirement: Pure ReAct loop without plan
The agent loop SHALL use pure Think → Act → Observe → Reflect cycles. Each iteration, the LLM observes the result of the previous tool execution and dynamically decides the next action — call another tool or respond to the user. No multi-step plan is generated in advance.

#### Scenario: Multi-step task via dynamic ReAct
- **WHEN** user asks "评估这个JD" which requires fetching profile then evaluating JD
- **THEN** iteration 1: LLM outputs `<<TOOL>>get_profile` → executes → observes result
- **AND** iteration 2: LLM observes profile data, decides to evaluate → outputs `<<TOOL>>evaluate_jd` → executes → observes result
- **AND** iteration 3: LLM observes evaluation result, decides data is sufficient → responds with analysis
- **AND** each iteration follows the phase sequence: thinking → executing → observing → reflecting

### Requirement: System prompt has no plan instruction
The system prompt SHALL NOT contain `<<PLAN>>` format instructions, plan examples, or rules requiring plan output for multi-step tasks. It SHALL only contain `<<TOOL>>` format and ReAct reflection protocol.

#### Scenario: Prompt does not mention plan
- **WHEN** the system prompt is built for agent invocation
- **THEN** it contains no reference to `<<PLAN>>`, plan creation, or task planning
- **AND** it instructs the LLM to output `<<TOOL>>` calls followed by observation and reflection

### Requirement: Client runner has no plan parsing
The client runner SHALL NOT contain plan parsing functions, task state tracking, or plan/task lifecycle events.

#### Scenario: Client runner yields no plan events
- **WHEN** agentLoopClient runs through its ReAct cycle
- **THEN** it never yields `plan_created`, `task_started`, or `task_done` events
- **AND** it yields only `phase`, `thinking_content`, `tool_call`, `tool_result`, `text`, and `done` events

### Requirement: UI has no plan card rendering
The Agent UI SHALL NOT render PlanCard component or track plan/task state. The interface shows only phase indicators, tool results, and message text.

#### Scenario: AgentChat receives no plan props
- **WHEN** AgentChat is rendered
- **THEN** it has no `planState`, `thinkingContent` props
- **AND** it does not import or render PlanCard
