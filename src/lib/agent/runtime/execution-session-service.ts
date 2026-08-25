import { getDataRepositories } from "@/lib/data-repositories";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";

export interface ExecutionConversationMessage {
  role: string;
  content: string;
  images?: string[];
  toolName?: string;
  toolResult?: unknown;
  timestamp?: string;
}

export function compactExecutionConversation(
  messages: ExecutionConversationMessage[],
  maxCharacters = 48_000,
): { messages: ExecutionConversationMessage[]; compacted: boolean; omittedCount: number } {
  const budget = Math.max(4_000, Math.floor(maxCharacters));
  const total = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (total <= budget) return { messages: messages.map(cloneMessage), compacted: false, omittedCount: 0 };

  const retained: ExecutionConversationMessage[] = [];
  let retainedCharacters = 0;
  const retainedBudget = Math.floor(budget * 0.72);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (retained.length > 0 && retainedCharacters + message.content.length > retainedBudget) break;
    retained.unshift(cloneMessage(message));
    retainedCharacters += message.content.length;
  }
  const omitted = messages.slice(0, messages.length - retained.length);
  const digestBudget = Math.max(500, budget - retainedCharacters - 200);
  const digest = omitted
    .map((message) => `[${message.role}${message.toolName ? `:${message.toolName}` : ""}] ${message.content.replace(/\s+/g, " ").slice(0, 240)}`)
    .join("\n")
    .slice(-digestBudget);
  const compactedMessage: ExecutionConversationMessage = {
    role: "system",
    content: `[CONTEXT_COMPACTION omitted=${omitted.length}]\n${digest}`,
    timestamp: new Date().toISOString(),
  };
  return { messages: [compactedMessage, ...retained], compacted: true, omittedCount: omitted.length };
}

function cloneMessage(message: ExecutionConversationMessage): ExecutionConversationMessage {
  return {
    ...message,
    images: message.images ? [...message.images] : undefined,
  };
}

export async function loadExecutionConversation(
  principal: ExecutionPrincipal,
  conversationId: number | null,
): Promise<ExecutionConversationMessage[]> {
  if (conversationId === null) return [];
  const row = await getDataRepositories().sessions.get(conversationId, principal.userId);
  if (!row) return [];
  const value = row.messages_json ?? row.messages;
  if (Array.isArray(value)) return value as ExecutionConversationMessage[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as ExecutionConversationMessage[] : [];
  } catch {
    return [];
  }
}

export async function saveExecutionConversation(
  principal: ExecutionPrincipal,
  conversationId: number | null,
  messages: ExecutionConversationMessage[],
): Promise<void> {
  if (conversationId === null) return;
  const updated = await getDataRepositories().sessions.update(
    conversationId,
    principal.userId,
    { messages },
  );
  if (!updated) throw new Error("Agent Conversation not found");
}
