import { NextResponse } from "next/server";
import { loadAgentMD } from "@/lib/agent/load-agent-md";
import { getAgentById } from "@/lib/agent/registry";
import { getCareerDNASummary } from "@/lib/agent/shared-memory";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent") || "";

  if (!agentId) {
    return NextResponse.json({ success: false, error: "agent param required" }, { status: 400 });
  }

  const agent = getAgentById(agentId);
  if (!agent) {
    return NextResponse.json({ success: false, error: `Agent not found: ${agentId}. Available: ${all.map(a => a.id).join(", ")}` }, { status: 404 });
  }

  // Load agent.md
  let body: string;
  try {
    const soul = loadAgentMD(agentId);
    body = soul.body;
  } catch {
    console.warn(`[soul-api] agent.md load failed for "${agentId}", using fallback`);
    body = `你是纸鸢的 ${agent.name} 助手。根据用户需求提供帮助。`;
  }

  // Inject context (lightweight — evaluate_jd_full does its own analysis)
  try {
    const careerDNA = await getCareerDNASummary();
    if (careerDNA) body += `\n\n## 用户画像 (Career DNA)\n${careerDNA}`;
  } catch {
    // Context injection is best-effort
  }

  const model = agent.model || "deepseek-v4-flash";

  return NextResponse.json({
    success: true,
    data: { body, model },
  });
}
