import db from "@/lib/db";
import type { ChatSession, AgentMessage } from "@/types";

const MAX_MESSAGES_PER_SESSION = 200;

function makeTitle(messages: AgentMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "新对话";
  const text = firstUser.content.trim();
  if (text.length <= 6) return text;
  return text.slice(0, 6) + "...";
}

export async function createSession(
  messages: AgentMessage[] = [],
): Promise<number> {
  const now = new Date().toISOString();
  const session: ChatSession = {
    title: messages.length > 0 ? makeTitle(messages) : "新对话",
    messages,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };

  // Try server-side first
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: session.title, messages: session.messages }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data?.id) {
        // Cache to Dexie with server ID
        session.id = json.data.id;
        await db.chatSessions.put(session);
        return json.data.id;
      }
    }
  } catch { /* fallback to Dexie */ }

  const id = await db.chatSessions.add(session);
  return id as number;
}

export async function listSessions(): Promise<ChatSession[]> {
  return db.chatSessions
    .filter((s) => !s.deletedAt)
    .reverse()
    .sortBy("updatedAt");
}

export async function getSession(id: number): Promise<ChatSession | undefined> {
  return db.chatSessions.get(id);
}

export async function updateSession(
  id: number,
  updates: Partial<ChatSession>,
): Promise<void> {
  await db.chatSessions.update(id, { ...updates, updatedAt: new Date().toISOString() });
  // Sync to server
  fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: updates.title,
      messages: updates.messages,
      pinned: updates.pinned,
      memoryDigest: updates.memoryDigest,
    }),
  }).catch(() => {});
}

export async function softDeleteSession(id: number): Promise<void> {
  const now = new Date().toISOString();
  await db.chatSessions.update(id, { deletedAt: now, updatedAt: now });
  fetch(`/api/sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleted: true }) }).catch(() => {});

  setTimeout(async () => {
    const session = await db.chatSessions.get(id);
    if (session?.deletedAt) {
      await db.chatSessions.delete(id);
    }
  }, 5000);
}

export async function undoDeleteSession(id: number): Promise<void> {
  await db.chatSessions.update(id, {
    deletedAt: undefined,
    updatedAt: new Date().toISOString(),
  });
}

export async function pinSession(
  id: number,
  pinned: boolean,
): Promise<void> {
  await db.chatSessions.update(id, { pinned, updatedAt: new Date().toISOString() });
}

export async function searchSessions(query: string): Promise<ChatSession[]> {
  const lower = query.toLowerCase();
  return db.chatSessions
    .filter(
      (s) =>
        !s.deletedAt &&
        (s.title.toLowerCase().includes(lower) ||
          s.messages.some(
            (m) =>
              m.content.toLowerCase().includes(lower),
          )),
    )
    .reverse()
    .sortBy("updatedAt");
}

export async function ensureDefaultSession(): Promise<number> {
  const sessions = await listSessions();
  if (sessions.length === 0) {
    return createSession();
  }
  return sessions[0].id!;
}

export function generateMemoryDigest(messages: AgentMessage[]): string | null {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length < 5) return null;

  const assistantMessages = messages.filter((m) => m.role === "assistant" && m.content);
  const userText = userMessages.map((m) => m.content).join(" ");

  const parts: string[] = [];

  // Extract role/position mentions
  const roleMatch = userText.match(/(?:岗位|职位|角色|方向|找|应聘|投递)[：:]*\s*([^\s，。,\.]{2,20})/g);
  if (roleMatch) {
    const unique = [...new Set(roleMatch)].slice(0, 3);
    parts.push(`关注方向: ${unique.join("、")}`);
  }

  // Extract company mentions
  const companyMatch = userText.match(/(?:公司|企业|雇主)[：:]*\s*([^\s，。,\.]{2,20})/g);
  if (companyMatch) {
    const unique = [...new Set(companyMatch)].slice(0, 3);
    parts.push(`关注公司: ${unique.join("、")}`);
  }

  // Extract key assistant responses (last 2 substantial ones)
  const substantialReplies = assistantMessages
    .filter((m) => m.content.length > 50)
    .slice(-2);
  if (substantialReplies.length > 0) {
    const summaries = substantialReplies.map((m) => m.content.slice(0, 100).replace(/\n/g, " "));
    parts.push(`最近分析: ${summaries.join(" | ")}`);
  }

  if (parts.length === 0) return null;
  return parts.join("; ");
}
