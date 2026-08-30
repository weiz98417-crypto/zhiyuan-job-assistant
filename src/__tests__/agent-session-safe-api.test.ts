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

  it("sanitizes messages before create and update persistence", async () => {
    const listRoute = await import("@/app/api/sessions/route");
    await listRoute.POST(new Request("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({ messages: JSON.parse(legacyRow.messages_json) }),
    }));
    expect(JSON.stringify(boundaries.create.mock.calls[0]?.[0])).not.toContain("raw result");

    const detailRoute = await import("@/app/api/sessions/[id]/route");
    await detailRoute.PATCH(new Request("http://localhost/api/sessions/7", {
      method: "PATCH",
      body: JSON.stringify({ messages: JSON.parse(legacyRow.messages_json) }),
    }), { params: Promise.resolve({ id: "7" }) });
    expect(JSON.stringify(boundaries.update.mock.calls[0]?.[2])).not.toContain("raw result");
  });
});
