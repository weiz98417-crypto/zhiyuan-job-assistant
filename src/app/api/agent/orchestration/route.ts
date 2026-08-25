import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  classifyIntentHardRule,
  classifyIntentLLM,
  detectModelTier,
  isValidAgent,
} from "@/lib/agent/classify-intent-llm";
import { resolveImageIntakeAgentId, type ImageDocumentType, type ImageIntakeResult } from "@/lib/agent/image-intake";
import { loadAgentMD } from "@/lib/agent/load-agent-md";
import { classifyIntent, getAgentById, getAllAgents } from "@/lib/agent/registry";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import registry from "@/lib/agent/tools";

interface OrchestrationRequest {
  content?: string;
  messages?: Array<{ role: string; content: string }>;
  forcedAgentId?: string;
  imageIntake?: ImageIntakeResult | null;
  preferredDocumentType?: ImageDocumentType;
}

export async function POST(request: Request) {
  try {
    const currentUser = await currentUserOrNull();
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json() as OrchestrationRequest;
    const content = typeof body.content === "string" ? body.content : "";
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const agents = getAllAgents();
    const imageAgentId = resolveImageIntakeAgentId(
      content,
      body.imageIntake,
      body.preferredDocumentType,
    );
    const classification = await resolveClassification({
      content,
      messages,
      forcedAgentId: body.forcedAgentId,
      imageAgentId,
      agents,
    });
    const agent = getAgentById(classification.agentId) || getAgentById("general");
    if (!agent) {
      return NextResponse.json({ success: false, error: "General agent is not registered" }, { status: 500 });
    }

    let systemPrompt: string;
    try {
      systemPrompt = loadAgentMD(agent.id).body;
    } catch {
      systemPrompt = `你是纸鸢的 ${agent.name} 助手。根据用户需求提供帮助。`;
    }
    try {
      const careerDNA = await getAgentReadService().getProfileDnaSummary({ userId: currentUser.userId });
      if (careerDNA) systemPrompt += `\n\n## 用户画像 (Career DNA)\n${careerDNA}`;
    } catch {
      // Context enrichment is best-effort and must not block a run.
    }

    const tools = agent.toolNames.length > 0
      ? registry.toOpenAITools(agent.toolNames)
      : registry.toOpenAITools();
    const toolWhitelist = tools.map((tool) => tool.function.name);
    const effectiveModel = classification.modelTier === "pro" && agent.modelPro
      ? agent.modelPro
      : agent.model;

    return NextResponse.json({
      success: true,
      data: {
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          toolNames: toolWhitelist,
          priority: agent.priority,
          suggestions: agent.suggestions,
          model: effectiveModel,
          modelPro: agent.modelPro,
        },
        systemPrompt,
        toolWhitelist,
        tools,
        annotatedMessages: messages,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Agent orchestration failed",
    }, { status: 500 });
  }
}

async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

async function resolveClassification(input: {
  content: string;
  messages: Array<{ role: string; content: string }>;
  forcedAgentId?: string;
  imageAgentId?: string;
  agents: ReturnType<typeof getAllAgents>;
}): Promise<{ agentId: string; modelTier: "default" | "pro" }> {
  const modelTier = detectModelTier(input.content);
  if (input.forcedAgentId) return { agentId: input.forcedAgentId, modelTier };
  if (input.imageAgentId) return { agentId: input.imageAgentId, modelTier };

  const hardRule = classifyIntentHardRule(input.content);
  if (hardRule && isValidAgent(hardRule.agentId, input.agents)) {
    return {
      agentId: hardRule.agentId,
      modelTier: hardRule.modelTier || modelTier,
    };
  }

  const candidates = input.agents.filter((agent) => agent.id !== "orchestrator" && agent.id !== "general");
  try {
    const contextSummary = input.messages
      .filter((message) => message.role === "user")
      .slice(-3)
      .map((message) => message.content.slice(0, 100))
      .join("\n");
    const llmResult = await classifyIntentLLM(input.content, candidates, contextSummary);
    if (llmResult && isValidAgent(llmResult.agentId, input.agents)) {
      return {
        agentId: llmResult.agentId,
        modelTier: llmResult.modelTier || modelTier,
      };
    }
  } catch {
    // Regex classification keeps orchestration available when the model is unavailable.
  }

  return { agentId: classifyIntent(input.content).id, modelTier };
}
