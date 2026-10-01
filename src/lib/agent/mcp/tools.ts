import { mcpManager } from "./manager";
import { registry } from "@/lib/agent/tools";

let mcpRegistered = false;

/**
 * Mount all MCP-discovered tools into the agent tool registry (Spec 16).
 * Worker-only: call during agent-worker startup, before the worker claims its first run.
 * The registry is sealed at import time, so the mount path briefly unseals it and
 * reseals in a finally block — no tool lookup runs in that window.
 */
export async function registerMCPTools(): Promise<void> {
  if (mcpRegistered) return;

  await mcpManager.init();

  const tools = mcpManager.getAllTools();
  let mounted = 0;
  registry.unseal();
  try {
    for (const tool of tools) {
      if (!registry.get(tool.name)) {
        registry.register(tool);
        mounted += 1;
      }
    }
  } finally {
    registry.seal();
  }

  mcpRegistered = true;
  console.log(`[MCP] Mounted ${mounted} MCP tools into agent registry (registry resealed)`);
}

/** Re-export for use in API routes */
export { mcpManager };
