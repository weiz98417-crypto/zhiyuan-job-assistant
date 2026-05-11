import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadMCPConfig, getServerEnv, type MCPServerConfig } from "./config";
import type { ToolDefinition, ToolResult } from "@/lib/agent/tools/types";

interface MCPServerState {
  client: Client;
  transport: StdioClientTransport;
  tools: ToolDefinition[];
}

export class MCPManager {
  private servers = new Map<string, MCPServerState>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    const config = loadMCPConfig();
    const results = await Promise.allSettled(
      Object.entries(config.servers).map(([name, cfg]) =>
        this.connectServer(name, cfg),
      ),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.warn("[MCP] Server connection failed:", result.reason);
      }
    }

    this.initialized = true;
    const totalTools = this.getAllTools().length;
    console.log(`[MCP] Initialized with ${totalTools} tools from ${this.servers.size} servers`);
  }

  private async connectServer(name: string, cfg: MCPServerConfig): Promise<void> {
    const env = getServerEnv(name);
    if (!env && Object.keys(cfg.env).length > 0) {
      if (cfg.optional) {
        console.warn(`[MCP] Skipping optional server "${name}": missing API keys`);
        return;
      }
      throw new Error(`MCP server "${name}" requires API keys but none configured`);
    }

    const transport = new StdioClientTransport({
      command: "npx",
      args: ["-y", cfg.package],
      env: env || undefined,
    });

    const client = new Client(
      { name: "zhiyuan-agent", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const mcpTools = await client.listTools();

    const toolDefs: ToolDefinition[] = mcpTools.tools.map((t) => ({
      name: `${name}_${t.name}`,
      description: `[${name}] ${t.description || t.name}`,
      category: "query" as const,
      parameters: (t.inputSchema?.properties
        ? Object.fromEntries(
            Object.entries(t.inputSchema.properties as Record<string, { type?: string; description?: string }>).map(
              ([k, v]) => [
                k,
                {
                  type: (v.type || "string") as "string" | "number" | "boolean" | "object",
                  required: (t.inputSchema as { required?: string[] }).required?.includes(k) ?? false,
                  description: v.description || k,
                },
              ],
            ),
          )
        : {}) as ToolDefinition["parameters"],
      handler: async (params) => {
        return this.callTool(name, t.name, params as Record<string, unknown>);
      },
      formatResult: (result: ToolResult) => {
        if (!result.success) return `MCP 工具执行失败: ${result.error}`;
        const data = result.data as unknown;
        if (typeof data === "string") return data.slice(0, 1000);
        try {
          return JSON.stringify(data, null, 2).slice(0, 1000);
        } catch {
          return String(data).slice(0, 1000);
        }
      },
    }));

    this.servers.set(name, { client, transport, tools: toolDefs });
    console.log(`[MCP] Connected to "${name}" — ${toolDefs.length} tools`);
  }

  async callTool(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const server = this.servers.get(serverName);
    if (!server) {
      return { success: false, data: null, error: `MCP server not connected: ${serverName}` };
    }

    try {
      const result = await server.client.callTool({
        name: toolName,
        arguments: params,
      });

      const content = result.content as { type: string; text?: string }[] | undefined;
      const text = content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("\n") || JSON.stringify(result);

      return { success: true, data: text };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "MCP tool call failed",
      };
    }
  }

  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const server of this.servers.values()) {
      tools.push(...server.tools);
    }
    return tools;
  }

  getServerTools(serverName: string): ToolDefinition[] {
    return this.servers.get(serverName)?.tools || [];
  }

  async shutdown(): Promise<void> {
    for (const [name, server] of this.servers) {
      try {
        await server.transport.close();
      } catch {
        // ignore
      }
    }
    this.servers.clear();
    this.initialized = false;
  }
}

/** Singleton */
export const mcpManager = new MCPManager();
