import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  load: vi.fn(),
  databaseDriver: vi.fn(),
  postgresConfigured: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: boundaries.getCurrentUser }));
vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({ sessions: { list: boundaries.list, get: boundaries.get } }),
}));
vi.mock("@/lib/postgres", () => ({
  getDatabaseDriver: boundaries.databaseDriver,
  isPostgresConfigured: boundaries.postgresConfigured,
}));
vi.mock("@/lib/memory/postgres-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/memory/postgres-memory")>()),
  getSessionMemoryAdapter: () => ({ load: boundaries.load }),
}));

const session = {
  id: 131,
  title: "你好，你是谁",
  messages_json: "[]",
  created_at: "2026-09-27T00:00:00.000Z",
  updated_at: "2026-09-27T00:01:00.000Z",
};

describe("Agent session durable memory read-back", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    boundaries.getCurrentUser.mockResolvedValue({ userId: "user-1" });
    boundaries.list.mockResolvedValue([session]);
    boundaries.get.mockResolvedValue(session);
    boundaries.load.mockResolvedValue([
      { role: "user", content: "你好，你是谁", createdAt: "2026-09-27T00:00:00.000Z" },
      { role: "assistant", content: "你好，我是纸鸢。", createdAt: "2026-09-27T00:01:00.000Z" },
    ]);
    boundaries.databaseDriver.mockReturnValue("postgres");
    boundaries.postgresConfigured.mockReturnValue(true);
  });

  it("returns the worker's assistant reply from durable memory in session detail", async () => {
    const route = await import("@/app/api/sessions/[id]/route");
    const response = await route.GET(new Request("http://localhost/api/sessions/131"), {
      params: Promise.resolve({ id: "131" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.parse(payload.data.messages_json)).toEqual([
      expect.objectContaining({ role: "user", content: "你好，你是谁" }),
      expect.objectContaining({ role: "assistant", content: "你好，我是纸鸢。" }),
    ]);
    expect(boundaries.load).toHaveBeenCalledWith({ userId: "user-1", conversationId: 131 });
  });

  it("returns the same durable reply in the session list", async () => {
    const route = await import("@/app/api/sessions/route");
    const response = await route.GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.parse(payload.data[0].messages_json)).toEqual([
      expect.objectContaining({ role: "user", content: "你好，你是谁" }),
      expect.objectContaining({ role: "assistant", content: "你好，我是纸鸢。" }),
    ]);
  });

  it("keeps SQLite sessions on their existing transcript path", async () => {
    boundaries.databaseDriver.mockReturnValue("sqlite");
    const route = await import("@/app/api/sessions/[id]/route");
    const response = await route.GET(new Request("http://localhost/api/sessions/131"), {
      params: Promise.resolve({ id: "131" }),
    });
    const payload = await response.json();

    expect(JSON.parse(payload.data.messages_json)).toEqual([]);
    expect(boundaries.load).not.toHaveBeenCalled();
  });
});
