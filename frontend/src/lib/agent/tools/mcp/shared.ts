import type { ToolResult } from "@/lib/agent/tools/types";

/** Shared handler for all MCP tool shims — proxies to server-side MCP endpoint */
export async function callMCPTool(
  server: string,
  tool: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const res = await fetch("/api/agent/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server, tool, params }),
    });
    if (!res.ok) {
      return { success: false, data: null, error: `MCP proxy error: ${res.status}` };
    }
    return (await res.json()) as ToolResult;
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "MCP call failed",
    };
  }
}
