import { createHash } from "node:crypto";
import { getDataRepositories } from "@/lib/data-repositories";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { rebuildInterviewStateFromMessages } from "@/lib/agent/interview-session-state";
import type { AgentMessage, InterviewSessionState } from "@/types";
import type { DurableRunContextMaterial } from "@/lib/agent/runtime/run-context";
import { reconcileRunGateMessages } from "@/lib/agent/run-gate-message-status";
import { getSessionMemoryAdapter, type SessionMemoryMessage } from "@/lib/memory/postgres-memory";

export interface ExecutionConversationMessage {
  id?: string;
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

export function reconcileExecutionRunGates(
  messages: ExecutionConversationMessage[],
  gates: DurableRunContextMaterial["gates"],
): ExecutionConversationMessage[] {
  return reconcileRunGateMessages(messages, gates);
}

export async function loadExecutionConversation(
  principal: ExecutionPrincipal,
  conversationId: number | null,
): Promise<ExecutionConversationMessage[]> {
  if (conversationId === null) return [];
  const row = await getDataRepositories().sessions.get(conversationId, principal.userId);
  if (!row) return [];
  const adapter = getSessionMemoryAdapter();
  const stored = await adapter.load({ userId: principal.userId, conversationId });
  if (stored.length) return stored.map(fromSessionMemoryMessage);

  const legacy = parseConversationMessages(row.messages_json ?? row.messages);
  if (!legacy.length) return [];
  await adapter.append(
    { userId: principal.userId, conversationId },
    legacy.map((message, index) => toSessionMemoryMessage(message, index)),
    `legacy-session:${conversationId}`,
  );
  return (await adapter.load({ userId: principal.userId, conversationId })).map(fromSessionMemoryMessage);
}

function parseConversationMessages(value: unknown): ExecutionConversationMessage[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value as ExecutionConversationMessage[] : [];
}

export async function saveExecutionConversation(
  principal: ExecutionPrincipal,
  conversationId: number | null,
  messages: ExecutionConversationMessage[],
): Promise<void> {
  if (conversationId === null) return;
  const sessions = getDataRepositories().sessions;
  const row = await sessions.get(conversationId, principal.userId);
  if (!row) throw new Error("Agent Conversation not found");
  await getSessionMemoryAdapter().append(
    { userId: principal.userId, conversationId },
    messages.map((message, index) => toSessionMemoryMessage(message, index)),
  );
  const currentInterviewState = parseInterviewState(row.interview_state_json ?? row.interviewState);
  const interviewState = rebuildInterviewStateFromMessages(
    currentInterviewState,
    messages.flatMap(toAgentMessage),
  );
  const updated = interviewState
    ? await sessions.update(conversationId, principal.userId, { interviewState })
    : true;
  if (!updated) throw new Error("Agent Conversation not found");
}

function toSessionMemoryMessage(message: ExecutionConversationMessage, index: number): SessionMemoryMessage {
  const metadata: Record<string, unknown> = {};
  metadata.role = message.role;
  if (message.images) metadata.images = [...message.images];
  if (message.toolName) metadata.toolName = message.toolName;
  if (message.toolResult !== undefined) metadata.toolResult = message.toolResult;
  return {
    id: message.id || createHash("sha256")
      .update(`${message.role}\u0000${message.timestamp || ""}\u0000${index}`)
      .digest("hex"),
    role: message.role,
    content: message.content,
    createdAt: message.timestamp,
    ...(Object.keys(metadata).length ? { metadata: { execution: metadata } } : {}),
  };
}

function fromSessionMemoryMessage(message: SessionMemoryMessage): ExecutionConversationMessage {
  const execution = message.metadata?.execution;
  const metadata = execution && typeof execution === "object" && !Array.isArray(execution)
    ? execution as Record<string, unknown>
    : {};
  return {
    id: message.id,
    role: typeof metadata.role === "string" ? metadata.role : message.role,
    content: message.content,
    images: Array.isArray(metadata.images) ? metadata.images.filter((value): value is string => typeof value === "string") : undefined,
    toolName: typeof metadata.toolName === "string" ? metadata.toolName : undefined,
    toolResult: metadata.toolResult,
    timestamp: message.createdAt,
  };
}

export function parseInterviewState(value: unknown): InterviewSessionState | undefined {
  if (!value) return undefined;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && (parsed as InterviewSessionState).planSnapshot
      ? parsed as InterviewSessionState
      : undefined;
  } catch {
    return undefined;
  }
}

function toAgentMessage(message: ExecutionConversationMessage): AgentMessage[] {
  if (message.role !== "user" && message.role !== "assistant" && message.role !== "tool") return [];
  return [{
    role: message.role,
    content: message.content,
    images: message.images,
    toolName: message.toolName,
    toolResult: message.toolResult,
    timestamp: message.timestamp || new Date().toISOString(),
  }];
}
