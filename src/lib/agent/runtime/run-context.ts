import type {
  AgentRunFactReference,
  ExecutionPrincipal,
} from "@/lib/agent/runtime/durable-agent-run";

export interface RunContextMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
}

export interface DurableRunContextMaterial {
  completedToolFacts: Array<{ toolName: string; summary: string }>;
  recoveryObservations: Array<{ toolName: string; summary: string }>;
  evidence: Array<{ type: string; content: string }>;
  gates: Array<{
    gateId?: string;
    toolName: string;
    status: string;
    scopeHash: string;
    request?: Record<string, unknown>;
    resolvedAt?: string | null;
  }>;
  factRefs: AgentRunFactReference[];
}

export interface DurableRunContextSource {
  load(principal: ExecutionPrincipal, runId: string): Promise<DurableRunContextMaterial>;
}

export interface BuildRunContextInput {
  contract: unknown;
  checkpoint?: {
    messages?: RunContextMessage[];
    plan?: Record<string, unknown>;
    factRefs?: AgentRunFactReference[];
  } | null;
  conversationMessages?: RunContextMessage[];
  pendingInputs: RunContextMessage[];
  completedToolFacts: Array<{ toolName: string; summary: string }>;
  recoveryObservations?: Array<{ toolName: string; summary: string }>;
  evidence: Array<{ type: string; content: string }>;
  gates: DurableRunContextMaterial["gates"];
  factRefs?: AgentRunFactReference[];
}

export interface RebuiltRunContext {
  messages: RunContextMessage[];
  contract: unknown;
  plan: Record<string, unknown>;
  factRefs: AgentRunFactReference[];
  compacted: boolean;
}

export function buildRunContext(input: BuildRunContextInput): RebuiltRunContext {
  const checkpointMessages = input.checkpoint?.messages || [];
  const baseMessages = checkpointMessages.length > 0
    ? checkpointMessages
    : input.conversationMessages || [];
  const messages: RunContextMessage[] = [
    {
      role: "system",
      content: `Durable Run Contract:\n${JSON.stringify(input.contract)}`,
    },
    ...baseMessages.map(cloneMessage),
  ];

  for (const fact of input.completedToolFacts) {
    messages.push({
      role: "tool",
      content: `[VERIFIED_TOOL_FACT tool=${fact.toolName}] ${fact.summary}`,
    });
  }
  for (const observation of input.recoveryObservations || []) {
    messages.push({
      role: "system",
      content: `[RECOVERY_TOOL_OBSERVATION tool=${observation.toolName}] ${observation.summary}`,
    });
  }
  for (const item of input.evidence) {
    if (item.type !== "model.output_complete") continue;
    messages.push({ role: "assistant", content: item.content });
  }
  for (const gate of input.gates) {
    messages.push({
      role: "system",
      content: `[RUN_GATE tool=${gate.toolName} status=${gate.status} scope=${gate.scopeHash}]`,
    });
  }
  messages.push(...input.pendingInputs.map(cloneMessage));

  return {
    messages,
    contract: input.contract,
    plan: { ...(input.checkpoint?.plan || {}) },
    factRefs: deduplicateFactRefs([
      ...(input.checkpoint?.factRefs || []),
      ...(input.factRefs || []),
    ]),
    compacted: false,
  };
}

function cloneMessage(message: RunContextMessage): RunContextMessage {
  return {
    ...message,
    images: message.images ? [...message.images] : undefined,
  };
}

function deduplicateFactRefs(references: AgentRunFactReference[]): AgentRunFactReference[] {
  const byKey = new Map<string, AgentRunFactReference>();
  for (const reference of references) {
    byKey.set(`${reference.type}:${reference.id}:${reference.version}`, { ...reference });
  }
  return Array.from(byKey.values());
}
