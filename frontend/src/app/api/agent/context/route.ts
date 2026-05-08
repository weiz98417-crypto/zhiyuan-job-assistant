import { NextResponse } from "next/server";
import { assembleContext } from "@/lib/agent/context";
import type { AgentScenario, KnowledgeContext } from "@/lib/agent/knowledge";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scenario, knowledgeCtx, maxApplications } = body as {
      scenario: AgentScenario;
      knowledgeCtx?: KnowledgeContext;
      maxApplications?: number;
    };

    if (!scenario || !["explore", "evaluate", "dashboard", "interview_prep", "dingwei"].includes(scenario)) {
      return NextResponse.json(
        { success: false, error: "scenario 必须是 explore / evaluate / dashboard / interview_prep / dingwei" },
        { status: 400 },
      );
    }

    const context = await assembleContext({
      scenario,
      knowledgeCtx,
      maxApplications: maxApplications ?? 5,
    });

    return NextResponse.json({
      success: true,
      data: {
        systemPrompt: context.systemPrompt,
        assembledAt: context.assembledAt,
        dynamicData: {
          pipelineSummary: context.dynamicData.pipelineSummary,
          applications: context.dynamicData.applications,
          pendingDecisions: context.dynamicData.pendingDecisions,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Agent context error:", message);
    return NextResponse.json(
      { success: false, error: `上下文组装失败: ${message}` },
      { status: 500 },
    );
  }
}
