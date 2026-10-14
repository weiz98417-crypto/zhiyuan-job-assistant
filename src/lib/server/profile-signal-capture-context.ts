import { getDataRepositories } from "@/lib/data-repositories";
import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";
import { readSessionRowsWithDurableMessages } from "@/lib/agent/runtime/session-api-readback";

export interface ProfileSignalCaptureContext {
  content: string;
  priorUserContent: string[];
}

export async function loadProfileSignalCaptureContext(userId: string, conversationId: number, runId: string, requestId: string): Promise<ProfileSignalCaptureContext | null> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return null;
  const session = await getDataRepositories().sessions.get(conversationId, userId);
  if (!session || session.deleted_at) return null;
  const inputs = await withPostgresClient(async (client) => {
    const result = await client.query<{ run_id: string; request_id: string; content_json: unknown }>(`
      SELECT input.run_id, input.request_id, input.content_json
      FROM agent_run_inputs input
      JOIN agent_runs run ON run.id = input.run_id AND run.user_id = input.user_id
      WHERE input.user_id = $1 AND run.session_id = $2 AND input.status IN ('pending', 'consumed')
      ORDER BY input.id
    `, [userId, conversationId]);
    return result.rows;
  });
  const target = inputs.find((input) => input.run_id === runId && input.request_id === requestId);
  if (!target) return null;
  const readContent = (raw: unknown): string => {
    const parsed = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : raw as Record<string, unknown> | null;
    return typeof parsed?.content === "string" ? parsed.content : "";
  };
  const content = readContent(target.content_json);
  if (!content.trim()) return null;
  const [durableSession] = await readSessionRowsWithDurableMessages([session], userId);
  const rawMessages = durableSession.messages_json;
  const messages = typeof rawMessages === "string" ? JSON.parse(rawMessages) as unknown : rawMessages;
  if (!Array.isArray(messages)) throw new Error("Profile capture requires a valid session transcript");
  const transcriptUserContent = messages.flatMap((message: unknown) => {
    if (!message || typeof message !== "object") return [];
    const record = message as Record<string, unknown>;
    return record.role === "user" && typeof record.content === "string" ? [record.content] : [];
  });
  return { content, priorUserContent: [...inputs.map((input) => readContent(input.content_json)), ...transcriptUserContent] };
}
