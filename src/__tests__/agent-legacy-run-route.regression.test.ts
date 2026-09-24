import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orchestrateGen: vi.fn(() => (async function* () {
    yield { type: "done" };
  })()),
}));

vi.mock("@/lib/agent/orchestrator", () => ({
  orchestrateGen: mocks.orchestrateGen,
}));

describe("legacy agent run route", () => {
  it("does not expose the legacy model loop as a production endpoint", async () => {
    const { POST } = await import("@/app/api/agent/run/route");
    const response = await POST(new Request("http://localhost/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "请读取我的简历" }],
      }),
    }));

    expect(response.status).toBe(410);
    expect(mocks.orchestrateGen).not.toHaveBeenCalled();
  });
});
