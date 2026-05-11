/**
 * Semantic Memory — cross-session structured fact extraction.
 * Uses localStorage for persistence (IndexedDB table not yet added to Dexie schema).
 */

export interface SemanticFacts {
  skills: string[];
  salary: { min?: number; max?: number; currency?: string };
  industries: string[];
  roles: string[];
  dealbreakers: string[];
  preferences: Record<string, string>;
}

const SEMANTIC_KEY = "zhiyuan_semantic_facts";

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

/** Save semantic facts to localStorage */
export async function saveSemanticFacts(facts: SemanticFacts): Promise<void> {
  try { localStorage.setItem(SEMANTIC_KEY, JSON.stringify(facts)); } catch { /* best-effort */ }
}

/** Load semantic facts from localStorage */
export async function loadSemanticContext(): Promise<string> {
  try {
    const raw = localStorage.getItem(SEMANTIC_KEY);
    if (!raw) return "";
    const f: SemanticFacts = JSON.parse(raw);
    const parts: string[] = [];
    if (f.roles?.length) parts.push(`岗位偏好: ${f.roles.join("、")}`);
    if (f.industries?.length) parts.push(`行业偏好: ${f.industries.join("、")}`);
    if (f.salary?.min || f.salary?.max) parts.push(`薪资期望: ${f.salary.min || "?"}K-${f.salary.max || "?"}K`);
    if (f.dealbreakers?.length) parts.push(`底线条件: ${f.dealbreakers.join("、")}`);
    if (f.skills?.length) parts.push(`技能: ${f.skills.join("、")}`);
    return parts.length ? `\n[已知用户偏好] ${parts.join(" | ")}` : "";
  } catch { return ""; }
}
