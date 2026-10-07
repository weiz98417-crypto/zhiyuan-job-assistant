import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadMCPConfig, getServerEnv, type MCPServerConfig } from "./config";
import { buildBrowserToolCapability, buildBrowserToolGovernance, classifyBrowserTool, isUrlAllowed } from "./browser-tool-policy";
import type { ToolDefinition, ToolResult } from "@/lib/agent/tools/types";

interface MCPServerState {
  client: Client;
  transport: StdioClientTransport;
  tools: ToolDefinition[];
}

/** Spec 22: case-insensitive disconnect predicate — covers the SDK's "Not connected" /
 *  "Connection closed" (dead child), spawn ENOENT / stdin EPIPE, and the manager's own
 *  "MCP server not connected: X" early-return so a failed reconnect is retryable.
 *  "ended" 只以枚举短语出现：\bended\b 仍会命中 "ended up failing" 这类动词短语。
 *  Known boundary (Out of Scope): a zombie child that hangs until timeout produces a
 *  timeout error, which intentionally does NOT match — no reconnect on timeouts. */
export function isDisconnectError(errorText: string): boolean {
  return /not connected|connection closed|write after end|stream ended|connection ended|enoent|epipe/i.test(errorText);
}

export class MCPManager {
  private servers = new Map<string, MCPServerState>();
  /** Spec 22: per-server single-flight reconnect — concurrent callers wait on one attempt. */
  private reconnecting = new Map<string, Promise<void>>();

  async init(signal?: AbortSignal): Promise<void> {
    const config = loadMCPConfig();
    const results = await Promise.allSettled(
      Object.keys(config.servers).map((name) =>
        this.initServer(name, signal),
      ),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error(`[MCP] Server connection failed (its tools will NOT be available):`, result.reason);
      }
    }

    const totalTools = this.getAllTools().length;
    // 启动健康断言（Spec 16）：每个配置的 server 必须显式成功或显式失败，不允许静默缺席。
    const summary = Object.entries(config.servers).map(([name, cfg]) => ({
      server: name,
      connected: this.servers.has(name),
      policy: cfg.policy || "default",
    }));
    console.log(`[MCP] init summary: ${JSON.stringify(summary)}`);
    console.log(`[MCP] Initialized with ${totalTools} tools from ${this.servers.size} servers`);
  }

  async initServer(name: string, signal?: AbortSignal): Promise<void> {
    if (this.servers.has(name)) return;
    const config = loadMCPConfig();
    const serverConfig = config.servers[name];
    if (!serverConfig) return;
    try {
      await this.connectServer(name, serverConfig, signal);
    } catch (error) {
      if (!serverConfig.optional) throw error;
      console.warn(`[MCP] Optional server "${name}" connection failed:`, error);
    }
  }

  private async connectServer(name: string, cfg: MCPServerConfig, signal?: AbortSignal): Promise<void> {
    if (this.servers.has(name)) return;
    const env = getServerEnv(name);
    if (!env && Object.keys(cfg.env).length > 0) {
      if (cfg.optional) {
        console.warn(`[MCP] Skipping optional server "${name}": missing API keys`);
        return;
      }
      throw new Error(`MCP server "${name}" requires API keys but none configured`);
    }

    const connectTimeout = cfg.timeoutMs ?? 8_000;
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["-y", cfg.package, ...(cfg.args || [])],
      env: env || undefined,
    });

    const client = new Client(
      { name: "zhiyuan-agent", version: "1.0.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport, { signal, timeout: connectTimeout });
      const mcpTools = await client.listTools(undefined, { signal, timeout: connectTimeout });

      // 浏览器读结果绕开 1000 字符截断（Spec 16）：页面快照需要独立预算。
      const resultCap = cfg.policy === "browser" ? 20_000 : 1_000;
      const toolDefs: ToolDefinition[] = [];
      for (const t of mcpTools.tools) {
        const classification = cfg.policy === "browser"
          ? classifyBrowserTool(t.name)
          : { registerable: true, effect: "read" as const };
        if (!classification.registerable) {
          console.log(`[MCP] Excluded "${name}_${t.name}" per closed browser tool classification`);
          continue;
        }
        toolDefs.push({
        name: `${name}_${t.name}`,
        description: `[${name}] ${t.description || t.name}`,
        category: classification.effect === "write" ? "action" as const : "query" as const,
        governance: cfg.policy === "browser"
          ? buildBrowserToolGovernance(`${name}_${t.name}`, classification.effect)
          : undefined,
        capability: cfg.policy === "browser"
          ? buildBrowserToolCapability(classification.effect)
          : undefined,
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
        handler: async (params, context) => {
          if (cfg.policy === "browser") {
            const rawUrl = (params as { url?: unknown })?.url;
            const url = typeof rawUrl === "string" ? rawUrl : undefined;
            if (url && !isUrlAllowed(url)) {
              return {
                success: false,
                data: null,
                error: `域名不在浏览器允许清单内，已拒绝导航: ${url}`,
                errorCategory: "policy_denied" as const,
              };
            }
            // Spec 16 Further Notes: slow portals get a relaxed MCP call timeout
            // (registry capability deadline 90s/120s still bounds the attempt).
            return this.callTool(name, t.name, params as Record<string, unknown>, context?.signal, 85_000);
          }
          return this.callTool(name, t.name, params as Record<string, unknown>, context?.signal);
        },
        formatResult: (result: ToolResult) => {
          if (!result.success) return `MCP 工具执行失败: ${result.error}`;
          const data = result.data as unknown;
          if (typeof data === "string") return data.slice(0, resultCap);
          try {
            return JSON.stringify(data, null, 2).slice(0, resultCap);
          } catch {
            return String(data).slice(0, resultCap);
          }
        },
        });
      }

      this.servers.set(name, { client, transport, tools: toolDefs });
      console.log(`[MCP] Connected to "${name}" — ${toolDefs.length} tools`);
    } catch (error) {
      await transport.close().catch(() => undefined);
      throw error;
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs = 30_000,
  ): Promise<ToolResult> {
    const first = await this.invokeTool(serverName, toolName, params, signal, timeoutMs);
    if (!first.reconnectable) return first.result;
    // Spec 22: confirmed disconnect — reconnect once, replay the call once.
    const reconnected = await this.reconnectServer(serverName, signal);
    if (!reconnected) {
      return {
        success: false,
        data: null,
        error: `MCP server reconnect failed after disconnect: ${first.result.error}`,
        errorCategory: "transient",
        recoverable: true,
      };
    }
    const second = await this.invokeTool(serverName, toolName, params, signal, timeoutMs);
    if (second.reconnectable) {
      return {
        success: false,
        data: null,
        error: `MCP server disconnected again after reconnect: ${second.result.error}`,
        errorCategory: "transient",
        recoverable: true,
      };
    }
    return second.result;
  }

  private async invokeTool(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<{ result: ToolResult; reconnectable: boolean }> {
    const server = this.servers.get(serverName);
    if (!server) {
      return {
        result: {
          success: false,
          data: null,
          error: `MCP server not connected: ${serverName}`,
          errorCategory: "transient",
          recoverable: true,
        },
        reconnectable: true,
      };
    }

    try {
      const result = await server.client.callTool({
        name: toolName,
        arguments: params,
      }, undefined, { signal, timeout: timeoutMs });

      const content = result.content as { type: string; text?: string }[] | undefined;
      const text = content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("\n") || JSON.stringify(result);

      return { result: { success: true, data: text, errorCategory: "ok", llmSummary: text }, reconnectable: false };
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "MCP tool call failed";
      return {
        result: {
          success: false,
          data: null,
          error: errorText,
          errorCategory: "transient",
          recoverable: true,
        },
        reconnectable: isDisconnectError(errorText),
      };
    }
  }

  /** Spec 22: single-flight reconnect; concurrent callers await the same attempt.
   *  Failure clears the entry (self-produced "not connected" message then hits the
   *  predicate, so the NEXT call retries the reconnect). */
  private async reconnectServer(serverName: string, signal?: AbortSignal): Promise<boolean> {
    const inFlight = this.reconnecting.get(serverName);
    if (inFlight) {
      await inFlight.catch(() => undefined);
      return this.servers.has(serverName);
    }
    this.servers.delete(serverName);
    const startedAt = Date.now();
    const attempt = this.initServer(serverName, signal)
      .then(() => undefined)
      .finally(() => {
        this.reconnecting.delete(serverName);
      });
    this.reconnecting.set(serverName, attempt);
    try {
      await attempt;
      const ok = this.servers.has(serverName);
      if (ok) console.log(`[MCP] Reconnected to "${serverName}" in ${Date.now() - startedAt}ms`);
      return ok;
    } catch (error) {
      const classification = isDisconnectError(error instanceof Error ? error.message : String(error)) ? "disconnect" : "connect-failure";
      console.error(`[MCP] Reconnect to "${serverName}" failed (${classification}): ${error instanceof Error ? error.message : error}`);
      return false;
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
  }
}

/** Singleton */
export const mcpManager = new MCPManager();
