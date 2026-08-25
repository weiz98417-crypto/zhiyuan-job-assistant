import type { ImageDocumentType, ImageIntakeResult } from "@/lib/agent/image-intake";

export interface ClientAgentDefinition {
  id: string;
  name: string;
  description: string;
  toolNames: string[];
  priority: number;
  suggestions: Array<{ label: string; prompt: string; icon?: string }>;
  model?: string;
  modelPro?: string;
}

export interface ClientOrchestratorContext {
  sessionId: number | null;
  messages: Array<{ role: string; content: string }>;
  memoryDigest?: string;
  forcedAgentId?: string;
  agentState?: Record<string, unknown>;
  imageIntake?: ImageIntakeResult | null;
  preferredDocumentType?: ImageDocumentType;
}

export interface ClientOrchestratorResult {
  agent: ClientAgentDefinition;
  systemPrompt: string;
  toolWhitelist: string[];
  tools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, { type: string; description: string }>;
        required: string[];
      };
    };
  }>;
  annotatedMessages: Array<{ role: string; content: string }>;
}

export async function orchestrate(
  content: string,
  context: ClientOrchestratorContext,
): Promise<ClientOrchestratorResult> {
  const response = await fetch("/api/agent/orchestration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      messages: context.messages,
      memoryDigest: context.memoryDigest,
      forcedAgentId: context.forcedAgentId,
      agentState: context.agentState,
      imageIntake: context.imageIntake,
      preferredDocumentType: context.preferredDocumentType,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true || !payload.data) {
    throw new Error(payload.error || `Agent orchestration failed: HTTP ${response.status}`);
  }
  return payload.data as ClientOrchestratorResult;
}
