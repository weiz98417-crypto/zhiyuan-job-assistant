import { describe, expect, it } from "vitest";

describe("legacy Agent Run ledger mutation routes", () => {
  it("rejects direct status mutation and deletion", async () => {
    const route = await import("@/app/api/agent/runs/[id]/route");

    const patchResponse = await route.PATCH();
    const deleteResponse = await route.DELETE();

    expect(patchResponse.status).toBe(405);
    expect(patchResponse.headers.get("Allow")).toBe("GET");
    expect(deleteResponse.status).toBe(405);
  });

  it("rejects client-authored execution Step records", async () => {
    const route = await import("@/app/api/agent/runs/[id]/steps/route");

    const response = await route.POST();

    expect(response.status).toBe(405);
  });
});
