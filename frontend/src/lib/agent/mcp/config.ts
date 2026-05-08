import { readFileSync } from "fs";
import { resolve } from "path";

export interface MCPServerConfig {
  package: string;
  env: Record<string, string>;
  /** If true, connection failure is logged but not fatal */
  optional: boolean;
}

interface MCPConfigFile {
  servers: Record<string, MCPServerConfig>;
}

let cachedConfig: MCPConfigFile | null = null;

export function loadMCPConfig(): MCPConfigFile {
  if (cachedConfig) return cachedConfig;

  const configPath = resolve(process.cwd(), "mcp.config.json");
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as MCPConfigFile;

  // Resolve env:VAR references
  for (const [_, serverCfg] of Object.entries(config.servers)) {
    for (const [key, value] of Object.entries(serverCfg.env)) {
      if (value.startsWith("env:")) {
        const envVar = value.slice(4);
        serverCfg.env[key] = process.env[envVar] || "";
      }
    }
  }

  cachedConfig = config;
  return config;
}

/** Get env vars for an MCP server, filtered to non-empty values */
export function getServerEnv(serverName: string): Record<string, string> | null {
  const config = loadMCPConfig();
  const serverCfg = config.servers[serverName];
  if (!serverCfg) return null;

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(serverCfg.env)) {
    if (value) env[key] = value;
  }
  return env;
}
