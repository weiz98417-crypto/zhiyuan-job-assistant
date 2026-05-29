/**
 * Episodic Memory — LLM-generated session summaries when conversation exceeds 15 user messages.
 * Summary injected into system prompt, replacing truncated early messages.
 */

import { countUserMessages } from "./working";

const SUMMARIZE_THRESHOLD = 15;

export interface EpisodeSummary {
  content: string;
  createdAt: string;
}

/** Check if the conversation has grown enough to trigger a summary */
export function shouldSummarize(
  messages: { role: string; content: string }[],
): boolean {
  return countUserMessages(messages) > SUMMARIZE_THRESHOLD;
}

/** Generate a summary of the earliest messages that are about to fall out of working memory */
export async function generateSummary(
  earlyMessages: { role: string; content: string }[],
): Promise<string> {
  const conversation = earlyMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n")
    .slice(0, 3000); // Keep input manageable

  try {
    const res = await fetch("/api/agent/think", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemPrompt: "你是一个摘要助手。请用不超过200字总结以下对话的关键信息：用户讨论了什么话题、关注什么要点、做了什么决定。只输出摘要文本，不要加任何前缀。",
        messages: [{ role: "user", content: `请总结：\n${conversation}` }],
      }),
    });

    if (!res.ok) return "";
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const p = JSON.parse(line.slice(6));
          if (p.type === "text") text += p.content;
        } catch { /* skip */ }
      }
    }
    return text.trim().slice(0, 200);
  } catch {
    return "";
  }
}

const SUMMARY_PREFIX = "zhiyuan_summary_";

/** Save summary to localStorage for session persistence */
export async function saveSummary(
  sessionId: number,
  summary: string,
): Promise<void> {
  if (!summary) return;
  try { localStorage.setItem(`${SUMMARY_PREFIX}${sessionId}`, `[摘要] ${summary}`); } catch { /* best-effort */ }
}

/** Load summary for a session */
export async function loadSummary(sessionId: number): Promise<string> {
  try { return localStorage.getItem(`${SUMMARY_PREFIX}${sessionId}`) || ""; } catch { return ""; }
}
