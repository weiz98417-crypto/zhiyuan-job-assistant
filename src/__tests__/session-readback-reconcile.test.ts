import { afterEach, describe, expect, it, vi } from "vitest";
import { readSessionRowsWithDurableMessages } from "@/lib/agent/runtime/session-api-readback";

const driverState = vi.hoisted(() => ({ driver: "sqlite" }));
const scanStatusesMock = vi.hoisted(() => vi.fn());
const adapterLoadMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/scan-data", () => ({
  getScanStatusesForUser: scanStatusesMock,
}));
vi.mock("@/lib/postgres", () => ({
  getDatabaseDriver: () => driverState.driver,
  isPostgresConfigured: () => driverState.driver === "postgres",
}));
vi.mock("@/lib/memory/postgres-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/memory/postgres-memory")>()),
  getSessionMemoryAdapter: () => ({
    load: adapterLoadMock,
  }),
}));

function sessionRow(messagesJson: string): Record<string, unknown> {
  return { id: 1, title: "t", messages_json: messagesJson, created_at: "2026-10-01T00:00:00Z" };
}

function runningCardJson(): string {
  return JSON.stringify([{
    role: "tool",
    content: "",
    toolName: "scan_portals",
    timestamp: "2026-10-01T00:00:00Z",
    toolResult: { success: true, uiPayload: { type: "job_discovery_run", scanId: "scan-1", status: "running" } },
  }]);
}

describe("Spec 20: readback-layer card reconciliation", () => {
  afterEach(() => {
    driverState.driver = "sqlite";
    vi.clearAllMocks();
  });

  it("reconciles legacy-driver rows (early return path) before returning", async () => {
    driverState.driver = "sqlite";
    scanStatusesMock.mockResolvedValue({ "scan-1": { status: "done", updatedAt: "2026-09-30T12:00:00Z" } });

    const rows = await readSessionRowsWithDurableMessages([sessionRow(runningCardJson())], "user-1");
    const messages = JSON.parse(String(rows[0].messages_json)) as Array<{ toolResult: { uiPayload: { status: string; resolvedAt?: string } } }>;
    expect(scanStatusesMock).toHaveBeenCalledWith("user-1", ["scan-1"]);
    expect(messages[0].toolResult.uiPayload.status).toBe("done");
    expect(messages[0].toolResult.uiPayload.resolvedAt).toBe("2026-09-30T12:00:00Z");
  });

  it("marks cards as unknown when the scan record is gone", async () => {
    scanStatusesMock.mockResolvedValue({});

    const rows = await readSessionRowsWithDurableMessages([sessionRow(runningCardJson())], "user-1");
    const messages = JSON.parse(String(rows[0].messages_json)) as Array<{ toolResult: { uiPayload: { status: string } } }>;
    expect(messages[0].toolResult.uiPayload.status).toBe("unknown");
  });

  it("leaves orphan running scans untouched (true state, scan subsystem's defect)", async () => {
    scanStatusesMock.mockResolvedValue({ "scan-1": { status: "running", updatedAt: null } });

    const rows = await readSessionRowsWithDurableMessages([sessionRow(runningCardJson())], "user-1");
    const messages = JSON.parse(String(rows[0].messages_json)) as Array<{ toolResult: { uiPayload: { status: string } } }>;
    expect(messages[0].toolResult.uiPayload.status).toBe("running");
  });

  it("skips reconciliation entirely when the session has no job discovery cards", async () => {
    const plain = JSON.stringify([{ role: "user", content: "hi", timestamp: "2026-10-01T00:00:00Z" }]);

    const rows = await readSessionRowsWithDurableMessages([sessionRow(plain)], "user-1");
    expect(scanStatusesMock).not.toHaveBeenCalled();
    expect(rows[0].messages_json).toBe(plain);
  });

  it("never blocks the session read when reconciliation throws", async () => {
    scanStatusesMock.mockRejectedValue(new Error("scan store down"));

    const rows = await readSessionRowsWithDurableMessages([sessionRow(runningCardJson())], "user-1");
    expect(rows).toHaveLength(1);
    expect(String(rows[0].messages_json)).toContain("running");
  });

  it("reconciles after durable message assembly on the postgres path", async () => {
    driverState.driver = "postgres";
    adapterLoadMock.mockResolvedValue([{
      id: "m1",
      role: "tool",
      content: "",
      createdAt: "2026-10-01T01:00:00Z",
      metadata: { execution: { role: "tool", toolName: "scan_portals", toolResult: { success: true, uiPayload: { type: "job_discovery_run", scanId: "scan-9", status: "running" } } } },
    }]);
    scanStatusesMock.mockResolvedValue({ "scan-9": { status: "canceled", updatedAt: null } });

    const rows = await readSessionRowsWithDurableMessages([sessionRow("[]")], "user-1");
    const messages = JSON.parse(String(rows[0].messages_json)) as Array<{ toolResult?: { uiPayload?: { type?: string; status: string } } }>;
    const card = messages.find((message) => message.toolResult?.uiPayload?.type === "job_discovery_run");
    expect(card?.toolResult?.uiPayload?.status).toBe("canceled");
  });
});
