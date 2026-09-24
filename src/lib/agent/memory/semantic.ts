/**
 * Semantic extraction compatibility helpers.
 * Durable memory is owned by the server governed ledger; these client helpers
 * only preserve the extraction API used by legacy screens.
 */

export interface SemanticFacts {
  skills: string[];
  salary: { min?: number; max?: number; currency?: string };
  industries: string[];
  roles: string[];
  dealbreakers: string[];
  preferences: Record<string, string>;
}

/** Extract structured facts from conversation via LLM */
export async function extractFacts(
  messages: { role: string; content: string }[],
): Promise<SemanticFacts | null> {
  const conversation = messages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n").slice(0, 4000);

  try {
    const res = await fetch("/api/agent/think", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemPrompt: `你是信息提取助手。从对话中提取求职相关信息，只输出JSON。格式：{"skills":[],"salary":{},"industries":[],"roles":[],"dealbreakers":[],"preferences":{}}`,
        messages: [{ role: "user", content: conversation }],
      }),
    });
    if (!res.ok) return null;
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "", buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { const p = JSON.parse(line.slice(6)); if (p.type === "text") text += p.content; } catch { /* skip */ }
      }
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as SemanticFacts;
  } catch { return null; }
}

/** Legacy compatibility hook. Governed memory candidates are server-owned. */
export async function saveSemanticFacts(facts: SemanticFacts): Promise<void> {
  void facts;
}

/** Legacy compatibility hook. Client memory is not an authority for Agent context. */
export async function loadSemanticContext(): Promise<string> {
  return "";
}
