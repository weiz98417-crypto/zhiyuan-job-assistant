import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({ getSession: vi.fn(), query: vi.fn(), readTranscript: vi.fn() }));
vi.mock("@/lib/data-repositories", () => ({ getDataRepositories: () => ({ sessions: { get: boundaries.getSession } }) }));
vi.mock("@/lib/postgres", () => ({
  getDatabaseDriver: () => "postgres",
  isPostgresConfigured: () => true,
  withPostgresClient: (operation: (client: { query: typeof boundaries.query }) => unknown) => operation({ query: boundaries.query }),
}));
vi.mock("@/lib/agent/runtime/session-api-readback", () => ({ readSessionRowsWithDurableMessages: boundaries.readTranscript }));

import { loadProfileSignalCaptureContext } from "@/lib/server/profile-signal-capture-context";

beforeEach(() => {
  vi.clearAllMocks();
  boundaries.getSession.mockResolvedValue({ id: 42, user_id: "owner", messages_json: "[]" });
  boundaries.query.mockResolvedValue({ rows: [{ run_id: "run42", request_id: "request42", content_json: { content: "我精通 React" } }] });
  boundaries.readTranscript.mockResolvedValue([{ id: 42, messages_json: JSON.stringify([{ role: "user", content: "不要更新画像" }, { role: "assistant", content: "允许保存" }]) }]);
});

describe("admitted profile signal input identity", () => {
  it("loads only admitted owner and conversation-bound input and inherits actual user transcript", async () => {
    const context = await loadProfileSignalCaptureContext("owner", 42, "run42", "request42");
    expect(boundaries.getSession).toHaveBeenCalledWith(42, "owner");
    expect(boundaries.query).toHaveBeenCalledWith(expect.stringContaining("input.status IN ('pending', 'consumed')"), ["owner", 42]);
    expect(context).toEqual({ content: "我精通 React", priorUserContent: ["我精通 React", "不要更新画像"] });
  });

  it.each([["another-run", "request42"], ["run42", "another-request"]])("rejects mismatched run/request %s %s", async (runId, requestId) => {
    expect(await loadProfileSignalCaptureContext("owner", 42, runId, requestId)).toBeNull();
  });

  it("rejects cross-owner or deleted sessions before reading private input", async () => {
    boundaries.getSession.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 42, deleted_at: "2026-10-14" });
    expect(await loadProfileSignalCaptureContext("other-owner", 42, "run42", "request42")).toBeNull();
    expect(await loadProfileSignalCaptureContext("owner", 42, "run42", "request42")).toBeNull();
    expect(boundaries.query).not.toHaveBeenCalled();
  });

  it("fails closed when the formal transcript cannot be parsed", async () => {
    boundaries.readTranscript.mockResolvedValue([{ messages_json: "corrupt" }]);
    await expect(loadProfileSignalCaptureContext("owner", 42, "run42", "request42")).rejects.toThrow();
  });
});
