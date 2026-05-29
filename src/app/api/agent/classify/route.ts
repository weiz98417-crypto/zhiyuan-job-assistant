import { NextResponse } from "next/server";
import { classifyIntentLLM, isValidAgent, buildClassifierPrompt, detectModelTier } from "@/lib/agent/classify-intent-llm";
import { classifyIntent, getAllAgents } from "@/lib/agent/registry";

/** Build context summary from recent messages */
function buildContextSummary(messages: { role: string; content: string }[]): string {
  const userMessages = messages.filter((m) => m.role === "user");
  const recent = userMessages.slice(-3);
  return recent
    .map((m, i) => {
      const label = userMessages.length - recent.length + i + 1;
      const truncated = m.content.length > 100
        ? m.content.slice(0, 100) + "..."
        : m.content;
      return `[消息${label}] ${truncated}`;
    })
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json() as {
      messages?: { role: string; content: string }[];
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "messages required" }, { status: 400 });
    }

    const lastMsg = messages[messages.length - 1]?.content || "";
    const contextSummary = buildContextSummary(messages);
    const agents = getAllAgents().filter((a) => a.id !== "orchestrator" && a.id !== "general");
    const modelTier = detectModelTier(lastMsg);

    // Try LLM classification with history context
    try {
      const llmResult = await classifyIntentLLM(lastMsg, agents, contextSummary);
      if (llmResult && isValidAgent(llmResult.agentId, getAllAgents())) {
        return NextResponse.json({
          success: true,
          data: {
            agentId: llmResult.agentId,
            reason: llmResult.reason,
            modelTier: llmResult.modelTier || modelTier,
          },
        });
      }
    } catch {
      console.warn("[classify-api] LLM classification failed, fallback to regex");
    }

    // Fallback to regex
    const fallback = classifyIntent(lastMsg);
    return NextResponse.json({
      success: true,
      data: {
        agentId: fallback.id,
        reason: "regex fallback",
        modelTier,
      },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: `分类失败: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  }
}
