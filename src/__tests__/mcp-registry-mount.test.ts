import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@/lib/agent/tools/registry";
import { RuntimeResourceScheduler } from "@/lib/agent/runtime/runtime-resource-scheduler";
import { loadMCPConfig } from "@/lib/agent/mcp/config";
import type { ToolDefinition } from "@/lib/agent/tools/types";

function fakeTool(name: string): ToolDefinition {
  return {
    name,
    description: `fake ${name}`,
    category: "query",
    parameters: {},
    handler: async () => ({ success: true, data: null, errorCategory: "ok" }),
    formatResult: () => "ok",
  };
}

describe("Spec 16: registry mount path (unseal -> register -> reseal)", () => {
  it("rejects registration while sealed, allows it through the mount window, reseals", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool("base_tool"));
    registry.seal();
    expect(() => registry.register(fakeTool("late_tool"))).toThrow(/sealed/);

    registry.unseal();
    registry.register(fakeTool("mcp_browser_navigate"));
    registry.seal();

    expect(registry.get("mcp_browser_navigate")).toBeDefined();
    expect(() => registry.register(fakeTool("late_tool_2"))).toThrow(/sealed/);
  });
});

describe("Spec 16: browser tools serialize on a dedicated resource", () => {
  it("runs browser operations one at a time even under concurrency", async () => {
    const scheduler = new RuntimeResourceScheduler();
    const events: string[] = [];

    const operation = (label: string, ms: number) =>
      scheduler.run("browser", async () => {
        events.push(`start:${label}`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        events.push(`end:${label}`);
      });

    await Promise.all([operation("a", 30), operation("b", 10), operation("c", 10)]);
    expect(events).toEqual(["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
  });
});

describe("Spec 16: mcp.config.json contract", () => {
  it("declares the playwright browser server with headless/isolated args", () => {
    const config = loadMCPConfig();
    const playwright = config.servers.playwright;
    expect(playwright).toBeDefined();
    expect(playwright.package).toBe("@playwright/mcp");
    expect(playwright.args).toContain("--headless");
    expect(playwright.args).toContain("--isolated");
    expect(playwright.policy).toBe("browser");
    expect(playwright.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });
});
