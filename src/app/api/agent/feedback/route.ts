import { NextResponse } from "next/server";
import {
  logInteraction,
  logDecision,
  updateDecisionResponse,
  findDecisionsByEntity,
  updateRolePreference,
  updateCompanyPreference,
} from "@/lib/agent/memory";
import type { AgentDecision } from "@/types";

type FeedbackAction = "accepted" | "dismissed" | "clicked" | "ignored" | "modified";

interface FeedbackRequest {
  action: FeedbackAction;
  entityType: "jd" | "application" | "pipeline" | "profile";
  entityId: number;
  company: string;
  role: string;
  detail?: string;
}

export async function POST(request: Request) {
  try {
    const body: FeedbackRequest = await request.json();
    const { action, entityType, entityId, company, role, detail } = body;

    if (!action || !entityType || !entityId || !company || !role) {
      return NextResponse.json(
        { success: false, error: "action, entityType, entityId, company, role 为必填字段" },
        { status: 400 },
      );
    }

    const validActions: FeedbackAction[] = ["accepted", "dismissed", "clicked", "ignored", "modified"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `action 必须为 ${validActions.join("/")}` },
        { status: 400 },
      );
    }

    // 1. Log interaction
    const interactionId = await logInteraction({
      timestamp: new Date(),
      trigger: "feedback",
      contextSnapshot: {
        profileVersion: new Date().toISOString(),
        pipelineSummary: `反馈: ${action} ${company} ${role}`,
        recentActivityCount: 1,
      },
      reasoning: {
        thought: `用户对推荐 ${company} - ${role} 做出了 ${action} 反馈`,
        toolsConsidered: [],
        toolsUsed: [],
      },
      output: {
        type: "recommendation",
        summary: `${company} - ${role}: 用户${action}`,
      },
      feedback: {
        action,
        timestamp: new Date(),
        detail: detail || "",
      },
    });

    // 2. Update or create decision
    const existingDecisions = await findDecisionsByEntity(entityType, entityId);
    const relevantDecision = existingDecisions.find((d) =>
      d.type === "recommend_apply" || d.type === "recommend_skip",
    );

    if (relevantDecision?.id) {
      const userResponse: AgentDecision["userResponse"] =
        action === "accepted" ? "accepted"
        : action === "dismissed" ? "rejected"
        : action === "clicked" ? "accepted"
        : "pending";

      await updateDecisionResponse(relevantDecision.id, userResponse);
    } else if (action === "dismissed" || action === "accepted") {
      await logDecision({
        timestamp: new Date(),
        type: action === "dismissed" ? "recommend_skip" : "recommend_apply",
        target: { entityType, entityId, summary: `${company} - ${role}` },
        content: `Agent 推荐: ${company} - ${role}`,
        confidence: 0.7,
        userResponse: action === "dismissed" ? "rejected" : "accepted",
      });
    }

    // 3. Update preference model
    if (action === "dismissed") {
      await updateRolePreference(role, -0.1, "learned");
      await updateCompanyPreference(company, "dislike");
    } else if (action === "accepted") {
      await updateRolePreference(role, 0.05, "learned");
    } else if (action === "clicked") {
      await updateRolePreference(role, 0.03, "learned");
    }

    return NextResponse.json({
      success: true,
      data: { interactionId },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("Agent feedback error:", message);
    return NextResponse.json(
      { success: false, error: `反馈处理失败: ${message}` },
      { status: 500 },
    );
  }
}
