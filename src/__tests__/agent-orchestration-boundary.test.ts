import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const getProfileDnaSummaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent/load-agent-md", () => ({
  loadAgentMD: vi.fn(() => ({ body: "general soul" })),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/agent/runtime/agent-read-service", () => ({
  getAgentReadService: vi.fn(() => ({
    getProfileDnaSummary: getProfileDnaSummaryMock,
  })),
}));

describe("Agent orchestration browser boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getCurrentUserMock.mockResolvedValue({ userId: "user-1" });
    getProfileDnaSummaryMock.mockResolvedValue("career dna");
  });

  it("keeps the client page away from the server orchestrator graph", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/agent/page.tsx"),
      "utf8",
    );
    const chatSource = readFileSync(
      path.join(process.cwd(), "src/components/agent/AgentChat.tsx"),
      "utf8",
    );

    expect(pageSource).toContain('from "@/lib/agent/orchestrator/client"');
    expect(pageSource).not.toContain('from "@/lib/agent/orchestrator"');
    expect(pageSource).not.toContain('from "@/lib/agent/loop/remote-runner"');
    expect(pageSource).not.toContain('from "@/lib/agent/loop/client-runner"');
    expect(chatSource).not.toContain('from "@/lib/agent/registry"');
  });

  it("returns serializable agent metadata and all exposed tools for general mode", async () => {
    const { POST } = await import("@/app/api/agent/orchestration/route");
    const response = await POST(new Request("http://localhost/api/agent/orchestration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "帮我规划下一步",
        messages: [{ role: "user", content: "帮我规划下一步" }],
        forcedAgentId: "general",
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.agent).toMatchObject({
      id: "general",
      name: "通用助手",
    });
    expect(payload.data.agent).not.toHaveProperty("buildSystemPrompt");
    expect(payload.data.agent).not.toHaveProperty("intentPatterns");
    expect(payload.data.toolWhitelist.length).toBeGreaterThan(0);
    expect(payload.data.tools.length).toBe(payload.data.toolWhitelist.length);
    expect(payload.data.systemPrompt).toContain("career dna");
    expect(getProfileDnaSummaryMock).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("rejects orchestration metadata requests without an authenticated principal", async () => {
    getCurrentUserMock.mockRejectedValueOnce(new Error("unauthorized"));
    const { POST } = await import("@/app/api/agent/orchestration/route");
    const response = await POST(new Request("http://localhost/api/agent/orchestration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "hello",
        messages: [{ role: "user", content: "hello" }],
      }),
    }));

    expect(response.status).toBe(401);
  });
});
