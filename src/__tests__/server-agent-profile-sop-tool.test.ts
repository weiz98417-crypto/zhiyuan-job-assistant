import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({ runProfileSop: vi.fn() }));

vi.mock("@/lib/server/profile-sop-service", () => ({ runProfileSop: boundaries.runProfileSop }));

import { mineProfile } from "@/lib/agent/tools/action/mine-profile";

const context = {
  principal: { userId: "user-1" },
  runId: "run-1",
  conversationId: 12,
  allowlist: ["mine_profile"],
};

describe("server profile SOP tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => { throw new Error("browser state must not be used"); }),
      setItem: vi.fn(() => { throw new Error("browser state must not be used"); }),
      removeItem: vi.fn(() => { throw new Error("browser state must not be used"); }),
    });
  });

  it("advances the user-scoped persistent SOP", async () => {
    boundaries.runProfileSop.mockResolvedValue({
      stage: 2,
      branch: "B",
      prompt: "下一题",
      collected: { stage_0: "B", stage_1: "产品" },
      readBackVerified: true,
    });
    const result = await mineProfile.handler({ action: "answer", answer: "产品" }, context);
    expect(result).toMatchObject({ success: true, data: { stage: 2, readBackVerified: true } });
    expect(boundaries.runProfileSop).toHaveBeenCalledWith(
      context.principal,
      { action: "answer", answer: "产品", conversationId: 12 },
    );
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });

  it("rejects browser-only confirmation without a Worker execution context", async () => {
    const result = await mineProfile.handler({ action: "complete" });
    expect(result).toMatchObject({ success: false, errorCategory: "policy_denied", recoverable: false });
    expect(boundaries.runProfileSop).not.toHaveBeenCalled();
  });

  it("does not retry a source or confirmation failure as a transient error", async () => {
    boundaries.runProfileSop.mockRejectedValue(new Error("请明确确认已展示的定位结果后再保存"));
    expect(await mineProfile.handler({ action: "complete" }, context)).toMatchObject({ success: false, errorCategory: "need_user_input", recoverable: false });
  });
});
