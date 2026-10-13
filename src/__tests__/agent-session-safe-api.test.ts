import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: boundaries.getCurrentUser }));
vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({
    sessions: {
      list: boundaries.list,
      get: boundaries.get,
      create: boundaries.create,
      update: boundaries.update,
    },
  }),
}));

const legacyRow = {
  id: 7,
  title: "legacy",
  messages_json: JSON.stringify([
    {
      role: "tool",
      toolName: "search_applications",
      content: "raw result",
      toolResult: { success: true, result: "raw result", data: { secret: "x" } },
      timestamp: "2026-01-01T00:00:00.000Z",
    },
  ]),
};

describe("session user API safe projection", () => {
  beforeEach(() => {
    vi.resetModules();
    boundaries.getCurrentUser.mockResolvedValue({ userId: "user-1" });
    boundaries.list.mockResolvedValue([legacyRow]);
    boundaries.get.mockResolvedValue(legacyRow);
    boundaries.create.mockResolvedValue(8);
    boundaries.update.mockResolvedValue(true);
  });

  it("projects legacy tool messages before listing sessions", async () => {
    const route = await import("@/app/api/sessions/route");
    const response = await route.GET();
    const payload = await response.json();
    const serialized = JSON.stringify(payload);
    expect(response.status).toBe(200);
    expect(serialized).toContain("已查询投递记录");
    expect(serialized).not.toContain("raw result");
    expect(serialized).not.toContain("secret");
  });

  it("projects legacy tool messages before returning a session detail", async () => {
    const route = await import("@/app/api/sessions/[id]/route");
    const response = await route.GET(new Request("http://localhost/api/sessions/7"), {
      params: Promise.resolve({ id: "7" }),
    });
    const payload = await response.json();
    const serialized = JSON.stringify(payload);
    expect(response.status).toBe(200);
    expect(serialized).toContain("已查询投递记录");
    expect(serialized).not.toContain("raw result");
    expect(serialized).not.toContain("secret");
  });

  it("refuses browser transcript writes on create and update (0.11.0-C, ADR-0036)", async () => {
    const listRoute = await import("@/app/api/sessions/route");
    const postRes = await listRoute.POST(new Request("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({ messages: JSON.parse(legacyRow.messages_json) }),
    }));
    expect(postRes.status).toBe(422);
    expect(boundaries.create.mock.calls).toHaveLength(0);

    const detailRoute = await import("@/app/api/sessions/[id]/route");
    const patchRes = await detailRoute.PATCH(new Request("http://localhost/api/sessions/7", {
      method: "PATCH",
      body: JSON.stringify({ messages: JSON.parse(legacyRow.messages_json) }),
    }), { params: Promise.resolve({ id: "7" }) });
    expect(patchRes.status).toBe(422);
    expect(boundaries.update.mock.calls).toHaveLength(0);
  });

  it.each([
    { expectedInterviewCheckpointVersion: 2, interviewState: { checkpointVersion: 3 } },
    { interviewState: JSON.stringify({ checkpointVersion: 3, phase: "tech" }) },
    { agentState: { durableInterview: true, checkpointStateHash: "forged", lastTurnResult: { readBackVerified: true } } },
  ])("refuses forged internal interview receipts at both browser mutation boundaries", async (body) => {
    const createRoute = await import("@/app/api/sessions/route");
    const detailRoute = await import("@/app/api/sessions/[id]/route");
    const created = await createRoute.POST(new Request("http://localhost/api/sessions", {
      method: "POST", body: JSON.stringify(body),
    }));
    const updated = await detailRoute.PATCH(new Request("http://localhost/api/sessions/7", {
      method: "PATCH", body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: "7" }) });
    expect(created.status).toBe(422);
    expect(updated.status).toBe(422);
    expect(boundaries.create).not.toHaveBeenCalled();
    expect(boundaries.update).not.toHaveBeenCalled();
  });

  it("allows empty preparation state but refuses browser changes after a durable checkpoint exists", async () => {
    const state = {
      planSnapshot: { snapshotId: "prepared-1", jdSnapshot: { company: "甲公司", role: "AI 产品经理", body: "JD-A" } },
      status: "active", questionGraph: [], transcript: [], scoreArtifacts: [], rebindHistory: [],
    };
    const createRoute = await import("@/app/api/sessions/route");
    const created = await createRoute.POST(new Request("http://localhost/api/sessions", {
      method: "POST", body: JSON.stringify({ title: "准备面试", interviewState: state }),
    }));
    expect(created.status).toBe(201);
    expect(boundaries.create).toHaveBeenCalledWith(expect.objectContaining({ interviewState: state }), "user-1");

    boundaries.get.mockResolvedValue({ ...legacyRow, interview_state_json: JSON.stringify({ checkpointVersion: 2 }) });
    const detailRoute = await import("@/app/api/sessions/[id]/route");
    for (const body of [{ interviewState: state }, { agentState: { guidedSession: { status: "completed" } } }]) {
      const updated = await detailRoute.PATCH(new Request("http://localhost/api/sessions/7", {
        method: "PATCH", body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: "7" }) });
      expect(updated.status).toBe(422);
    }
    expect(boundaries.update).not.toHaveBeenCalled();

    const metadata = await detailRoute.PATCH(new Request("http://localhost/api/sessions/7", {
      method: "PATCH", body: JSON.stringify({ title: "修改标题", pinned: true }),
    }), { params: Promise.resolve({ id: "7" }) });
    expect(metadata.status).toBe(200);
    expect(boundaries.update).toHaveBeenCalledWith(7, "user-1", { title: "修改标题", pinned: true });
  });
});
