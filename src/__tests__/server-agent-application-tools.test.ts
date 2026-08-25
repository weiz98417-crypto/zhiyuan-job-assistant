import { beforeEach, describe, expect, it, vi } from "vitest";

const { getApplicationContext, trackApplication, updateApplicationStatus } = vi.hoisted(() => ({
  getApplicationContext: vi.fn(),
  trackApplication: vi.fn(),
  updateApplicationStatus: vi.fn(),
}));

vi.mock("@/lib/application-workflow", () => ({
  getApplicationContext,
  trackApplication,
  updateApplicationStatus,
}));

import { trackApplicationTool } from "@/lib/agent/tools/action/track-application";
import { updateApplicationStatusTool } from "@/lib/agent/tools/action/update-application-status";
import { getApplicationContextTool } from "@/lib/agent/tools/query/get-application-context";

describe("server Agent application tools", () => {
  beforeEach(() => {
    getApplicationContext.mockReset();
    trackApplication.mockReset();
    updateApplicationStatus.mockReset();
    vi.unstubAllGlobals();
  });

  it("reads application context through the execution principal", async () => {
    getApplicationContext.mockResolvedValue({
      application: { id: 7, company: "甲公司", role: "AI 产品经理", status: "interview" },
      events: [{ id: 11 }],
      nextActions: [{ id: "retro", label: "面试复盘", intent: "复盘" }],
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await getApplicationContextTool.handler(
      { id: 7 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["get_application_context"],
      },
    );

    expect(result).toMatchObject({ success: true, errorCategory: "ok" });
    expect(result.llmSummary).toContain("甲公司");
    expect(getApplicationContext).toHaveBeenCalledWith({ id: 7 }, "user-1");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tracks an application through the execution principal with read-back evidence", async () => {
    trackApplication.mockResolvedValue({
      success: true,
      created: true,
      updated: false,
      data: { id: 7, company: "甲公司", role: "AI 产品经理", status: "applied" },
      event: { id: 12 },
      nextActions: [],
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await trackApplicationTool.handler(
      { company: "甲公司", role: "AI 产品经理", status: "applied" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["track_application"],
      },
    );

    expect(result).toMatchObject({
      success: true,
      errorCategory: "ok",
      uiPayload: { readBackVerified: true },
    });
    expect(trackApplication).toHaveBeenCalledWith(
      expect.objectContaining({ company: "甲公司", source: "agent_chat" }),
      "user-1",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("updates application status through the execution principal with read-back evidence", async () => {
    updateApplicationStatus.mockResolvedValue({
      success: true,
      data: { id: 7, company: "甲公司", role: "AI 产品经理", status: "interview" },
      event: { id: 13 },
      nextActions: [],
    });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call relative HTTP");
    }));

    const result = await updateApplicationStatusTool.handler(
      { id: 7, status: "interview" },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["update_application_status"],
      },
    );

    expect(result).toMatchObject({
      success: true,
      errorCategory: "ok",
      uiPayload: { readBackVerified: true },
    });
    expect(updateApplicationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, status: "interview", source: "agent_chat" }),
      "user-1",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
