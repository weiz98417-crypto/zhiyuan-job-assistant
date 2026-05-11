## ADDED Requirements

### Requirement: Agent SHALL output tool calls for data/action requests

When a user requests information or actions that map to an available tool, the agent SHALL output a `<<TOOL>>` marker with JSON parameters at the beginning of its response, before any natural language explanation.

#### Scenario: User requests application status
- **WHEN** user sends "查投递" or "我的投递进度"
- **THEN** the agent's response SHALL start with `<<TOOL>>search_applications` followed by JSON params, and SHALL NOT produce natural language analysis before the tool result is available

#### Scenario: User requests JD evaluation
- **WHEN** user sends a JD text or URL for evaluation
- **THEN** the agent SHALL output `<<TOOL>>evaluate_jd` with the extracted JD content, or a multi-step `<<PLAN>>` if the JD needs fetching first

#### Scenario: User chats without needing tools
- **WHEN** user sends casual conversation ("你好", "今天怎么样", "我有点迷茫")
- **THEN** the agent SHALL respond with natural language directly, without `<<TOOL>>` or `<<PLAN>>` markers

### Requirement: Agent SHALL decompose complex tasks with plan

When a user request requires multiple tool calls or steps, the agent SHALL output a `<<PLAN>>` marker containing a JSON array of tasks before executing any individual tool.

#### Scenario: Multi-step JD evaluation
- **WHEN** user says "帮我分析这个链接的JD" and the URL needs fetching
- **THEN** the agent SHALL output `<<PLAN>>` with tasks like `[{"id":"1","title":"获取JD内容","tool":"fetch_jd_content"},{"id":"2","title":"评估JD匹配度","tool":"evaluate_jd"},{"id":"3","title":"生成综合建议"}]`

#### Scenario: Simple single-tool request
- **WHEN** user says "查投递" (single straightforward action)
- **THEN** the agent MAY output `<<TOOL>>search_applications` directly without `<<PLAN>>`

### Requirement: System prompt SHALL include few-shot examples

The system prompt SHALL include at least 3 complete conversation examples demonstrating `<<TOOL>>` usage, `<<PLAN>>` usage, and chat-only responses.

#### Scenario: Few-shot examples present in prompt
- **WHEN** `buildAgentSystemPrompt()` is called
- **THEN** the returned prompt SHALL contain at least 3 example conversations formatted as user/assistant pairs showing the expected marker format

### Requirement: Parser SHALL tolerate LLM format variations

The `parsePlan` and `parseToolCall` functions SHALL extract valid data from LLM output even when mild formatting variations are present, including markdown code fences, extra whitespace, and missing newlines after markers.

#### Scenario: LLM wraps tool call in code fence
- **WHEN** LLM outputs ```` ```\n<<TOOL>>search_applications\n{}\n<</TOOL>>\n``` ````
- **THEN** `parseToolCall` SHALL return `{ name: "search_applications", params: {} }`

#### Scenario: LLM wraps plan JSON in markdown code fence
- **WHEN** LLM outputs `<<PLAN>>\n` ```json\n[{...}]\n``` `\n<</PLAN>>`
- **THEN** `parsePlan` SHALL strip the code fence and parse the inner JSON array

#### Scenario: No newline after marker
- **WHEN** LLM outputs `<<TOOL>>search_applications\n{}\n<</TOOL>>` with no newline before tool name
- **THEN** `parseToolCall` SHALL still extract the tool name and params

### Requirement: Intent boundary SHALL be job-search maximalist

The agent SHALL interpret user intent broadly: any message with a plausible connection to job searching SHALL trigger tool evaluation. Only messages clearly unrelated to job searching (entertainment, general knowledge, pure small talk) SHALL remain chat-only.

The default stance SHALL be "try tools first" — the agent SHALL attempt to find relevant tools for ambiguous requests before falling back to chat.

#### Scenario: Ambiguous request with plausible job connection
- **WHEN** user asks "明天什么天气" (checking tomorrow's weather)
- **THEN** the agent SHALL consider the job-search angle (maybe user has an interview tomorrow) and attempt to find relevant tools, such as checking the user's interview schedule first. Only if no tools are available SHALL it explain the limitation and pivot to chat

#### Scenario: Clearly unrelated topic
- **WHEN** user asks "给我讲个笑话" or "推荐一部电影"
- **THEN** the agent SHALL respond with natural language chat only, without `<<TOOL>>` or `<<PLAN>>`

#### Scenario: Job-adjacent topic
- **WHEN** user asks about transportation, weather, clothing, or local services
- **THEN** the agent SHALL consider the job-search context (interview commute, business attire, relocation) and attempt relevant tool calls or at minimum acknowledge the job connection in its response

### Requirement: Chat-only responses SHALL NOT display PlanCard

When the agent determines no tools are needed and responds with natural language, the frontend SHALL NOT render a PlanCard component.

#### Scenario: Casual conversation
- **WHEN** user says "你好" and agent responds with greeting text
- **THEN** no PlanCard SHALL appear in the chat UI

#### Scenario: Tool-based response
- **WHEN** agent outputs `<<TOOL>>` or `<<PLAN>>` and tools execute
- **THEN** PlanCard SHALL render showing task progress
