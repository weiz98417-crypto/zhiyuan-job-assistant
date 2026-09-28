import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  reportUpsert: vi.fn(),
  jdInsert: vi.fn(),
  trackApplication: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({
    reports: { upsert: mocks.reportUpsert },
    jds: { insert: mocks.jdInsert },
  }),
}));
vi.mock("@/lib/application-workflow", () => ({ trackApplication: mocks.trackApplication }));

import { POST } from "@/app/api/report/save/route";

function request(score: number) {
  return new Request("http://localhost/api/report/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: "纸鸢科技",
      role: "产品经理",
      overallScore: score,
      archetype: "AI 产品经理",
      legitimacy: "真实",
      blocks: { a: { content: "职位概览", score: 4 } },
      jdText: "负责 AI 产品规划、用户研究和跨团队交付。".repeat(3),
      actions: { saveJD: true, addToTracker: true },
    }),
  });
}

describe("report save score boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ userId: "user-1" });
    mocks.reportUpsert.mockResolvedValue(undefined);
    mocks.jdInsert.mockResolvedValue({ id: 1 });
    mocks.trackApplication.mockResolvedValue({ success: true, data: { id: 1 } });
  });

  it("rejects 70/5 before any report, tracker or JD write", async () => {
    const response = await POST(request(70));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: "JD 评分必须在 0–5 分之间" });
    expect(mocks.reportUpsert).not.toHaveBeenCalled();
    expect(mocks.trackApplication).not.toHaveBeenCalled();
    expect(mocks.jdInsert).not.toHaveBeenCalled();
  });

  it("allows a valid five-point score through the existing save flow", async () => {
    const response = await POST(request(4.2));

    expect(response.status).toBe(200);
    expect(mocks.reportUpsert).toHaveBeenCalledWith(expect.objectContaining({ overall_score: 4.2 }), "user-1");
    expect(mocks.trackApplication).toHaveBeenCalledWith(expect.objectContaining({ score: 4.2 }), "user-1");
    expect(mocks.jdInsert).toHaveBeenCalledOnce();
  });
});
