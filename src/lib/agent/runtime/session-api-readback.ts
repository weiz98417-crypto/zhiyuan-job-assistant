import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { getSessionMemoryAdapter, type SessionMemoryMessage } from "@/lib/memory/postgres-memory";
import { safeAssistantText } from "@/lib/agent/runtime/run-event-projection";

function toSessionTranscriptMessage(message: SessionMemoryMessage, fallbackTimestamp: string, includeImages: boolean) {
  const execution = message.metadata?.execution;
  const metadata = execution && typeof execution === "object" && !Array.isArray(execution)
    ? execution as Record<string, unknown>
    : {};
  return {
    role: typeof metadata.role === "string" ? metadata.role : message.role,
    content: message.role === "assistant" ? safeAssistantText(message.content) : message.content,
    timestamp: message.createdAt || fallbackTimestamp,
    ...(includeImages && Array.isArray(metadata.images) ? { images: metadata.images } : {}),
    ...(typeof metadata.toolName === "string" ? { toolName: metadata.toolName } : {}),
    ...(metadata.toolResult !== undefined ? { toolResult: metadata.toolResult } : {}),
  };
}

export async function readSessionRowsWithDurableMessages<T extends Record<string, unknown>>(
  rows: T[],
  userId: string,
  options: { includeImages?: boolean } = {},
): Promise<T[]> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return rows;
  const adapter = getSessionMemoryAdapter();
  const result: T[] = [];
  for (let index = 0; index < rows.length; index += 5) {
    const batch = await Promise.all(rows.slice(index, index + 5).map(async (row) => {
      const conversationId = Number(row.id);
      if (!Number.isInteger(conversationId) || conversationId <= 0) return row;
      const messages = await adapter.load({ userId, conversationId });
      if (!messages.length) return row;
      const fallbackTimestamp = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
      return {
        ...row,
        messages_json: JSON.stringify(messages.map((message) => toSessionTranscriptMessage(message, fallbackTimestamp, options.includeImages === true))),
      };
    }));
    result.push(...batch);
  }
  return result;
}
