import {
  projectToolResultForUser,
  sanitizeSafeReasoningSummary,
} from "@/lib/agent/surface-projection";

export function projectDurableUiEvent(
  event: Record<string, unknown> & { type: string },
): Record<string, unknown> & { type: string } {
  const type = String(event.type || "unknown");
  if (type === "phase") return { type, phase: safeIdentifier(event.phase) };
  if (type === "tool_call") return { type, name: safeIdentifier(event.name) };
  if (type === "tool_result") {
    const verifiedAction = record(event.verifiedAction);
    const verifier = record(verifiedAction.verifier);
    const success = event.success === true;
    const safeView = projectToolResultForUser({
      toolName: safeIdentifier(event.name),
      success,
      uiPayload: recordOrUndefined(event.uiPayload),
    });
    return {
      type,
      name: safeIdentifier(event.name),
      success,
      summary: safeView.summary || (success ? "工具执行成功" : "工具执行未成功"),
      safeView,
      uiPayload: safeView.uiPayload,
      verified: verifiedAction.success === true && verifier.ok === true,
    };
  }
  if (type === "tool_error") {
    return {
      type,
      name: safeIdentifier(event.name),
      recoverable: event.recoverable !== false,
    };
  }
  if (type === "run_directive") {
    return { type, directive: safeIdentifier(event.directive) };
  }
  if (type === "result_quality") return { type, quality: safeIdentifier(event.quality) };
  if (type === "intent") {
    return {
      type,
      agentId: safeIdentifier(event.agentId),
      modelTier: safeIdentifier(event.modelTier),
    };
  }
  if (type === "agent_switch") return { type, agentId: safeIdentifier(event.agentId) };
  if (type === "text") {
    const content = typeof event.content === "string" ? event.content : "";
    return { type, charCount: content.length };
  }
  if (type === "thinking_content") {
    return {
      type,
      summary: sanitizeSafeReasoningSummary(event.content),
      charCount: typeof event.content === "string" ? event.content.length : 0,
    };
  }
  if (type === "persist_done") {
    return { type, readBackVerified: event.readBackVerified === true };
  }
  return { type };
}

function safeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
