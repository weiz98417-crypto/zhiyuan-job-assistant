import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const guards = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const governance = vi.hoisted(() => ({
  deleteMemoryItem: vi.fn(),
  deleteReferenceResumePreferDisable: vi.fn(),
  listMemoryGovernanceOverview: vi.fn(),
  updateMemoryItemStatus: vi.fn(),
}));
const repositories = vi.hoisted(() => ({ getDataRepositories: vi.fn() }));

vi.mock("@/lib/security/auth-guards", () => guards);
vi.mock("@/lib/memory/governance", () => governance);
vi.mock("@/lib/data-repositories", () => repositories);
vi.mock("@/lib/reference-resume-vector", () => ({
  redactReferenceResumeText: vi.fn(),
  reindexReferenceResumeRecord: vi.fn(),
}));

import { PATCH } from "@/app/api/admin/memory/route";

function request(action: string) {
  return new NextRequest("http://localhost/api/admin/memory", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 42, action }),
  });
}

describe("legacy memory deletion guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireAdmin.mockResolvedValue({ userId: "admin-1" });
    governance.updateMemoryItemStatus.mockResolvedValue(true);
  });

  it("rejects deletion without modifying any memory item", async () => {
    const response = await PATCH(request("delete_memory"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "MEMORY_ERASURE_UNAVAILABLE",
      error: expect.stringContaining("暂不支持完整清除记忆"),
    });
    expect(guards.requireAdmin).toHaveBeenCalledOnce();
    expect(governance.deleteMemoryItem).not.toHaveBeenCalled();
    expect(governance.updateMemoryItemStatus).not.toHaveBeenCalled();
    expect(repositories.getDataRepositories).not.toHaveBeenCalled();
  });

  it.each([
    ["disable_memory", "archived"],
    ["reject_memory", "rejected"],
  ])("keeps %s available", async (action, status) => {
    const response = await PATCH(request(action));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 42, action, nextStatus: status, updated: true },
    });
    expect(governance.updateMemoryItemStatus).toHaveBeenCalledExactlyOnceWith(42, status);
    expect(governance.deleteMemoryItem).not.toHaveBeenCalled();
  });

  it("checks admin access before disclosing deletion availability", async () => {
    guards.requireAdmin.mockRejectedValue(new Error("Forbidden"));

    const response = await PATCH(request("delete_memory"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: "Forbidden" });
    expect(governance.deleteMemoryItem).not.toHaveBeenCalled();
    expect(governance.updateMemoryItemStatus).not.toHaveBeenCalled();
  });
});
