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
      ...(typeof event.audit === "string" ? { audit: event.audit.slice(0, 240) } : {}),
      ...(typeof event.clarify === "boolean" ? { clarify: event.clarify } : {}),
    };
  }
  if (type === "agent_switch") {
    return {
      type,
      agentId: safeIdentifier(event.agentId),
      ...(typeof event.agentName === "string" ? { agentName: event.agentName.slice(0, 120) } : {}),
    };
  }
  if (type === "step.started" || type === "step.finished") {
    return {
      type,
      step: safeIdentifier(event.step),
      criteriaDone: safeCount(event.criteriaDone),
      criteriaTotal: safeCount(event.criteriaTotal),
    };
  }
  if (type === "subagent.started") {
    return {
      type,
      delegationId: safeIdentifier(event.delegationId),
      agentId: safeIdentifier(event.agentId),
      goal: safeText(event.goal, 500),
    };
  }
  if (type === "subagent.finished") {
    return {
      type,
      delegationId: safeIdentifier(event.delegationId),
      agentId: safeIdentifier(event.agentId),
      findings: safeText(event.findings, 1200),
      keyPoints: Array.isArray(event.keyPoints)
        ? event.keyPoints.filter((item): item is string => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 240))
        : [],
    };
  }
  if (type === "subagent.error") {
    return {
      type,
      delegationId: safeIdentifier(event.delegationId),
      agentId: safeIdentifier(event.agentId),
      reason: safeText(event.reason, 500),
    };
  }
  if (type === "messages.snapshot") {
    return { type, items: Array.isArray(event.items) ? event.items : [] };
  }
  if (type === "text") {
    const content = typeof event.content === "string" ? event.content : "";
    return { type, content: safeAssistantText(content), charCount: content.length };
  }
  if (type === "thinking_content") {
    return {
      type,
      summary: sanitizeSafeReasoningSummary(event.content),
      charCount: typeof event.content === "string" ? event.content.length : 0,
    };
  }
  if (type === "persist_done") {
    // M1 gap closure: keep the report card fields (user-visible, non-sensitive)
    // so the browser observer can render the JD persistence completion card.
    return {
      type,
      readBackVerified: event.readBackVerified === true,
      ...(event.readBackError ? { readBackError: safeIdentifier(event.readBackError) || "read-back failed" } : {}),
      reportNum: Number.isFinite(Number(event.reportNum)) ? Number(event.reportNum) : 0,
      company: typeof event.company === "string" ? event.company.slice(0, 120) : "",
      role: typeof event.role === "string" ? event.role.slice(0, 120) : "",
      score: Number.isFinite(Number(event.score)) ? Number(event.score) : 0,
    };
  }
  if (type === "search_start" || type === "search_result") {
    return {
      type,
      block: safeIdentifier(event.block),
      ...(Number.isFinite(Number(event.progress)) ? { progress: Number(event.progress) } : {}),
    };
  }
  return { type };
}


function safeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80) : "";
}

function safeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function safeAssistantText(content: string): string {
  if (/(?:bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9_-]{12,}|postgres(?:ql)?:\/\/[^\s]+|-----begin [^-]+ key-----)/i.test(content)) {
    return "已隐藏内部内容";
  }
  return content.slice(0, 20_000);
}

function safeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
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
