import { beforeEach, describe, expect, it, vi } from "vitest";

const sessions = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({ sessions }),
}));

describe("execution session SQLite fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    process.env.DB_DRIVER = "sqlite";
    sessions.get.mockReset();
    sessions.update.mockReset();
    sessions.get.mockResolvedValue({
      id: 12,
      messages_json: "[]",
      interview_state_json: "{}",
    });
    sessions.update.mockResolvedValue(true);
  });

  it("loads the repository conversation without requiring PostgreSQL", async () => {
    const { loadExecutionConversation } = await import("@/lib/agent/runtime/execution-session-service");

    await expect(loadExecutionConversation({ userId: "user-1" }, 12)).resolves.toEqual([]);
  });

  it("saves the repository conversation without requiring PostgreSQL", async () => {
    const { saveExecutionConversation } = await import("@/lib/agent/runtime/execution-session-service");
    const messages = [{ role: "user", content: "hello", timestamp: "2026-09-24T00:00:00.000Z" }];

    await expect(saveExecutionConversation({ userId: "user-1" }, 12, messages)).resolves.toBeUndefined();
    expect(sessions.update).toHaveBeenCalledWith(12, "user-1", { messages });
  });
});
