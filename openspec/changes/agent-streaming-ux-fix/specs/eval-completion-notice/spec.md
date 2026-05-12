## ADDED Requirements

### Requirement: EvalCompletionNotice replaces EvalConfirmCard

After the LLM summary streaming completes and the `persist_done` event has been yielded, the UI SHALL render an `EvalCompletionNotice` component (compact inline notification) instead of the previous `EvalConfirmCard` (tool result card with save buttons). The `evaluate_jd_full` tool result SHALL NOT be rendered as a visible card in the chat.

#### Scenario: Completion notice after summary
- **WHEN** `persist_done` event is yielded with `{ reportNum: 42, company: "字节跳动", role: "AI PM", score: 4.2 }`
- **THEN** the chat SHALL show "评估完成 · 字节跳动 — AI PM · 4.2/5 · 报告已自动保存 #042 · [查看完整报告]"

#### Scenario: No EvalConfirmCard for evaluate_jd_full
- **WHEN** a tool_result event arrives for toolName "evaluate_jd_full"
- **THEN** the MessageBubble SHALL NOT render EvalConfirmCard (the tool message is stored as JSON but invisible in chat)

### Requirement: evaluate_jd_full removed from showAsCard

The `showAsCard` array in page.tsx SHALL no longer include `"evaluate_jd_full"`. Tool results for this tool go through the stream delegation path.

#### Scenario: Tool result not shown as card
- **WHEN** tool_result event fires for evaluate_jd_full after stream delegation completes
- **THEN** the result data SHALL be stored in the tool message JSON but no card SHALL be rendered
