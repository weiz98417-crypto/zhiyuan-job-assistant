import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzePipelineHealth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/pipeline-health-service", () => ({ analyzePipelineHealth }));

import { checkHealth } from "@/lib/agent/tools/action/check-health";

describe("server Agent health tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("relative HTTP must not be used"));
  });

  it("uses the shared health service and forwards cancellation", async () => {
    const controller = new AbortController();
    const pipeline = {
      applications: [{
        company: "甲公司",
        role: "AI 产品经理",
        status: "Evaluated",
        daysSinceApplied: 3,
        daysSinceLastActivity: 1,
      }],
    };
    analyzePipelineHealth.mockResolvedValue({
      status: "green",
      score: 88,
      issues: [],
      suggestions: ["继续保持跟进"],
    });

    const result = await checkHealth.handler(
      { pipeline },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["check_health"],
        signal: controller.signal,
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: { status: "green", score: 88 },
      errorCategory: "ok",
    });
    expect(analyzePipelineHealth).toHaveBeenCalledWith(pipeline, undefined, controller.signal);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
