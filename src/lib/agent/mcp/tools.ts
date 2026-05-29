import { mcpManager } from "./manager";
import { registry } from "@/lib/agent/tools";

let mcpRegistered = false;

/** Register all MCP-discovered tools into the agent tool registry */
export async function registerMCPTools(): Promise<void> {
  if (mcpRegistered) return;

  await mcpManager.init();

  const tools = mcpManager.getAllTools();
  for (const tool of tools) {
    if (!registry.get(tool.name)) {
      registry.register(tool);
    }
  }

  mcpRegistered = true;
  console.log(`[MCP] Registered ${tools.length} MCP tools into agent registry`);
}

/** Re-export for use in API routes */
export { mcpManager };
