import db from "@/lib/db";
import type { AgentMessage, AgentSessionState, ChatSession, InterviewSessionState } from "@/types";

const MAX_MESSAGES_PER_SESSION = 200;
export const MEMORY_DIGEST_USER_MESSAGE_THRESHOLD = 5;

function makeTitle(messages: AgentMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "新对话";
  const text = firstUser.content.trim();
  if (text.length <= 6) return text;
  return text.slice(0, 6) + "...";
}

interface ServerSessionRow {
  id: number;
  title: string;
  messages_json?: string;
  memory_digest?: string | null;
  interview_state_json?: string | null;
  agent_state_json?: string | null;
  pinned?: number | boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

function parseServerSession(row: ServerSessionRow): ChatSession {
  let messages: AgentMessage[] = [];
  try {
    messages = JSON.parse(row.messages_json || "[]") as AgentMessage[];
  } catch {
    messages = [];
  }

  let interviewState: InterviewSessionState | undefined;
  try {
    const parsed = JSON.parse(row.interview_state_json || "{}") as InterviewSessionState;
    if (parsed?.planSnapshot) interviewState = parsed;
  } catch {
    interviewState = undefined;
  }

  let agentState: AgentSessionState | undefined;
  try {
    const parsed = JSON.parse(row.agent_state_json || "{}") as AgentSessionState;
    if (parsed && typeof parsed === "object") agentState = parsed;
  } catch {
    agentState = undefined;
  }

  return {
    id: Number(row.id),
    title: row.title || makeTitle(messages),
    messages,
    memoryDigest: row.memory_digest || undefined,
    interviewState,
    agentState,
    pinned: Boolean(row.pinned),
    deletedAt: row.deleted_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createSession(
  messages: AgentMessage[] = [],
  options: { title?: string; interviewState?: InterviewSessionState; agentState?: AgentSessionState } = {},
): Promise<number> {
  const now = new Date().toISOString();
  const session: ChatSession = {
    title: options.title || (messages.length > 0 ? makeTitle(messages) : "新对话"),
    messages,
    interviewState: options.interviewState,
    agentState: options.agentState,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };

  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: session.title,
      messages: session.messages,
      interviewState: session.interviewState,
      agentState: session.agentState,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.id) {
    throw new Error(typeof json.error === "string" ? json.error : "Failed to create chat session");
  }
  session.id = json.data.id;
  await db.chatSessions.put(session).catch(() => {});
  return json.data.id;
}

export async function listSessions(): Promise<ChatSession[]> {
  const res = await fetch("/api/sessions", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !Array.isArray(json.data)) {
    throw new Error(typeof json.error === "string" ? json.error : "Failed to load chat sessions");
  }
  const serverSessions = (json.data as ServerSessionRow[]).map(parseServerSession);
  if (serverSessions.length > 0) await db.chatSessions.bulkPut(serverSessions).catch(() => {});
  return serverSessions.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getSession(id: number): Promise<ChatSession | undefined> {
  const local = await db.chatSessions.get(id);
  if (local) return local;
  try {
    const res = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        const session = parseServerSession(json.data as ServerSessionRow);
        await db.chatSessions.put(session);
        return session;
      }
    }
  } catch {
    /* fallback */
  }
  return undefined;
}

export async function updateSession(id: number, updates: Partial<ChatSession>): Promise<void> {
  await db.chatSessions.update(id, { ...updates, updatedAt: new Date().toISOString() });
  const res = await fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: updates.title,
      messages: updates.messages,
      pinned: updates.pinned,
      memoryDigest: updates.memoryDigest,
      interviewState: updates.interviewState,
      agentState: updates.agentState,
    }),
  }).catch((error) => {
    console.warn("[sessions] server update failed", error);
    return undefined;
  });
  if (res && !res.ok) {
    console.warn("[sessions] server update rejected", res.status);
  }
}

export async function softDeleteSession(id: number): Promise<void> {
  const now = new Date().toISOString();
  await db.chatSessions.update(id, { deletedAt: now, updatedAt: now });
  fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deleted: true }),
  }).catch(() => {});

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

export async function pinSession(id: number, pinned: boolean): Promise<void> {
  await db.chatSessions.update(id, { pinned, updatedAt: new Date().toISOString() });
}

export async function searchSessions(query: string): Promise<ChatSession[]> {
  const lower = query.toLowerCase();
  return db.chatSessions
    .filter(
      (s) =>
        !s.deletedAt &&
        (s.title.toLowerCase().includes(lower) ||
          s.messages.some((m) => m.content.toLowerCase().includes(lower))),
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
  if (userMessages.length < MEMORY_DIGEST_USER_MESSAGE_THRESHOLD) return null;

  const assistantMessages = messages.filter((m) => m.role === "assistant" && m.content);
  const userText = userMessages.map((m) => m.content).join(" ");

  const parts: string[] = [];

  const roleMatch = userText.match(/(?:岗位|职位|角色|方向|投递申请)[，,]?\s*([^\s，。；]{2,20})/g);
  if (roleMatch) {
    const unique = [...new Set(roleMatch)].slice(0, 3);
    parts.push(`关注方向: ${unique.join(" / ")}`);
  }

  const companyMatch = userText.match(/(?:公司|企业|雇主)[，,]?\s*([^\s，。；]{2,20})/g);
  if (companyMatch) {
    const unique = [...new Set(companyMatch)].slice(0, 3);
    parts.push(`关注公司: ${unique.join(" / ")}`);
  }

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

export function resolveMemoryDigestUpdate(
  messages: AgentMessage[],
  fallbackDigest?: string,
): { digest?: string; shouldAnnounce: boolean } {
  const generated = generateMemoryDigest(messages) || undefined;
  const digest = generated || fallbackDigest;
  return {
    digest,
    shouldAnnounce: Boolean(generated && !fallbackDigest),
  };
}
