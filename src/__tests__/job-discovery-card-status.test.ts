import { describe, expect, it } from "vitest";
import {
  collectJobDiscoveryScanIds,
  reconcileJobDiscoveryRunMessages,
} from "@/lib/agent/job-discovery-card-status";
import type { AgentMessage } from "@/types";

function cardMessage(overrides: {
  scanId?: string;
  status?: string;
  wrap?: "uiPayload" | "flat";
  role?: "tool";
}): AgentMessage {
  const payload: Record<string, unknown> = {
    type: "job_discovery_run",
    ...(overrides.scanId ? { scanId: overrides.scanId } : {}),
    status: overrides.status ?? "pending",
    companiesTotal: 3,
  };
  const toolResult = overrides.wrap === "flat"
    ? payload
    : { success: true, uiPayload: payload };
  return { role: overrides.role || "tool", content: "", toolName: "scan_portals", toolResult, timestamp: "2026-10-01T00:00:00Z" };
}

describe("Spec 20: reconcileJobDiscoveryRunMessages", () => {
  it("overwrites in-flight cards with terminal statuses from the fact source", () => {
    const messages = [cardMessage({ scanId: "s1", status: "running" })];
    const result = reconcileJobDiscoveryRunMessages(messages, {
      s1: { status: "done", updatedAt: "2026-09-30T12:00:00Z" },
    });
    const payload = (result[0].toolResult as Record<string, unknown>).uiPayload as Record<string, unknown>;
    expect(payload.status).toBe("done");
    expect(payload.resolvedAt).toBe("2026-09-30T12:00:00Z");
  });

  it("maps failed and canceled without marking them active", () => {
    const failed = reconcileJobDiscoveryRunMessages(
      [cardMessage({ scanId: "s2", status: "pending" })],
      { s2: { status: "failed", updatedAt: null } },
    );
    const canceled = reconcileJobDiscoveryRunMessages(
      [cardMessage({ scanId: "s3", status: "running" })],
      { s3: { status: "canceled", updatedAt: null } },
    );
    expect(((failed[0].toolResult as Record<string, unknown>).uiPayload as Record<string, unknown>).status).toBe("failed");
    expect(((canceled[0].toolResult as Record<string, unknown>).uiPayload as Record<string, unknown>).status).toBe("canceled");
  });

  it("maps missing records and missing scanIds to unknown, never to in-flight", () => {
    const noRecord = reconcileJobDiscoveryRunMessages(
      [cardMessage({ scanId: "missing", status: "running" })],
      {},
    );
    const noScanId = reconcileJobDiscoveryRunMessages(
      [cardMessage({ status: "pending" })],
      {},
    );
    expect(((noRecord[0].toolResult as Record<string, unknown>).uiPayload as Record<string, unknown>).status).toBe("unknown");
    expect(((noScanId[0].toolResult as Record<string, unknown>).uiPayload as Record<string, unknown>).status).toBe("unknown");
  });

  it("handles the flat toolResult shape (item-projection path)", () => {
    const messages = [cardMessage({ scanId: "s4", status: "running", wrap: "flat" })];
    const result = reconcileJobDiscoveryRunMessages(messages, { s4: { status: "done", updatedAt: null } });
    expect((result[0].toolResult as Record<string, unknown>).status).toBe("done");
  });

  it("leaves terminal cards, non-card messages, and orphan running scans untouched", () => {
    const messages: AgentMessage[] = [
      cardMessage({ scanId: "done-card", status: "done" }),
      { role: "assistant", content: "hello", timestamp: "2026-10-01T00:00:00Z" },
      cardMessage({ scanId: "orphan", status: "running" }),
    ];
    const result = reconcileJobDiscoveryRunMessages(messages, {
      "done-card": { status: "done", updatedAt: null },
      orphan: { status: "running", updatedAt: null },
    });
    expect(result).toBe(messages);
  });

  it("returns the same array when nothing changed", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "hi", timestamp: "" }];
    expect(reconcileJobDiscoveryRunMessages(messages, {})).toBe(messages);
  });

  it("collects scan ids across both payload shapes", () => {
    const ids = collectJobDiscoveryScanIds([
      cardMessage({ scanId: "a", status: "running" }),
      cardMessage({ scanId: "b", status: "pending", wrap: "flat" }),
      { role: "user", content: "x", timestamp: "" },
    ]);
    expect(ids.sort()).toEqual(["a", "b"]);
  });
});
