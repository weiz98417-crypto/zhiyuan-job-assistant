import { describe, expect, it } from "vitest";
import { planAgentRepair, serializeRepairPlanForLedger } from "@/lib/agent/repair-planner";

describe("agent repair planner", () => {
  it("reruns image intake when the original image is still usable", () => {
    const plan = planAgentRepair({
      failureType: "image_intake_not_called",
      taskType: "jd_evaluation",
      hasOriginalImage: true,
      imageQuality: "clear",
    });

    expect(plan).toMatchObject({
      action: "rerun_image_intake",
      status: "repairing",
      requiresUserInput: false,
      createEvalCandidate: true,
    });
  });

  it("asks the user when only a thumbnail or unreadable image remains", () => {
    const plan = planAgentRepair({
      failureType: "image_intake_failure",
      taskType: "jd_evaluation",
      hasOriginalImage: true,
      imageQuality: "thumbnail",
    });

    expect(plan.action).toBe("ask_clarification");
    expect(plan.status).toBe("waiting_user");
    expect(plan.userMessage).toContain("原始清晰截图");
  });

  it("repairs guided task drift by resuming the active task", () => {
    const plan = planAgentRepair({
      failureType: "guided_task_drift",
      taskType: "career_positioning_guidance",
      activeTaskType: "career_positioning_guidance",
      activeAgentId: "profile",
    });

    expect(plan).toMatchObject({
      action: "resume_guided_task",
      status: "repairing",
      maxAttempts: 1,
    });
  });

  it("does not claim success when read-back is missing after a save claim", () => {
    const plan = planAgentRepair({
      failureType: "missing_readback",
      taskType: "resume_edit",
      assistantClaimedSuccess: true,
    });

    expect(plan).toMatchObject({
      action: "correct_success_claim",
      status: "failed",
      requiresReadBack: true,
    });
  });

  it("marks repeated attempts as needs engineering", () => {
    const plan = planAgentRepair({
      failureType: "missing_run",
      taskType: "jd_evaluation",
      attempts: 2,
    });

    expect(plan.action).toBe("needs_engineering");
    expect(serializeRepairPlanForLedger(plan)).toMatchObject({
      status: "needs_engineering",
      createEvalCandidate: true,
    });
  });
});
