export interface RunGateStatusMaterial {
  gateId?: string;
  toolName: string;
  status: string;
  scopeHash: string;
  request?: Record<string, unknown>;
  resolvedAt?: string | null;
}

export function reconcileRunGateMessages<T extends { role: string; toolResult?: unknown }>(
  messages: T[],
  gates: RunGateStatusMaterial[],
): T[] {
  const byId = new Map(gates.filter((gate) => gate.gateId).map((gate) => [gate.gateId!, gate]));
  const byScope = new Map(gates.filter((gate) => gate.scopeHash).map((gate) => [gate.scopeHash, gate]));

  return messages.map((message) => {
    if (message.role !== "tool" || !message.toolResult || typeof message.toolResult !== "object" || Array.isArray(message.toolResult)) {
      return { ...message };
    }
    const result = message.toolResult as Record<string, unknown>;
    const payload = result.uiPayload && typeof result.uiPayload === "object" && !Array.isArray(result.uiPayload)
      ? result.uiPayload as Record<string, unknown>
      : null;
    if (payload?.type !== "run_gate") return { ...message };

    const gate = byId.get(String(payload.gateId || "")) || byScope.get(String(payload.scopeHash || ""));
    if (!gate || gate.status === "pending") return { ...message };

    return {
      ...message,
      toolResult: {
        ...result,
        uiPayload: {
          ...payload,
          status: gate.status,
          resolvedAt: gate.resolvedAt || undefined,
        },
      },
    };
  });
}
