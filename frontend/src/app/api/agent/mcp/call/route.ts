import { NextResponse } from "next/server";
import { mcpManager } from "@/lib/agent/mcp/tools";

export async function POST(request: Request) {
  try {
    // Ensure MCP is initialized
    await mcpManager.init();

    const body = await request.json();
    const { server, tool, params } = body as {
      server?: string;
      tool?: string;
      params?: Record<string, unknown>;
    };

    if (!server || !tool) {
      return NextResponse.json(
        { success: false, error: "Missing server or tool name" },
        { status: 400 },
      );
    }

    const result = await mcpManager.callTool(server, tool, params || {});

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "MCP proxy error";
    console.error("[MCP] Call error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
