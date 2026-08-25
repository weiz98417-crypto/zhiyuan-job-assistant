import { beforeEach, describe, expect, it, vi } from "vitest";

const mcp = vi.hoisted(() => ({
  initServer: vi.fn(),
  getServerTools: vi.fn(),
  callTool: vi.fn(),
}));

vi.mock("@/lib/agent/mcp/manager", () => ({ mcpManager: mcp }));

import { searchWeb } from "@/lib/server/external-agent-service";

describe("external Agent service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ query: { search: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });

  it("uses the configured search MCP with the run cancellation signal", async () => {
    const controller = new AbortController();
    mcp.getServerTools.mockReturnValue([{
      name: "serpapi_search",
      parameters: { query: { type: "string", required: true, description: "query" } },
    }]);
    mcp.callTool.mockResolvedValue({ success: true, data: "甲公司官网与招聘页" });

    const result = await searchWeb("甲公司", controller.signal);

    expect(result).toEqual({ text: "【SerpAPI MCP】\n甲公司官网与招聘页", sources: ["SerpAPI MCP"] });
    expect(mcp.initServer).toHaveBeenCalledWith("serpapi", controller.signal);
    expect(mcp.callTool).toHaveBeenCalledWith("serpapi", "search", { query: "甲公司" }, controller.signal);
  });
});
