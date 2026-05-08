import { ToolRegistry } from "./registry";

// Query tools
import { searchApplications } from "./query/search-applications";
import { getReportDetail } from "./query/get-report-detail";
import { getProfile } from "./query/get-profile";
import { getRecentActivity } from "./query/get-recent-activity";
import { getRecommendations } from "./query/get-recommendations";
import { getPipelineStatus } from "./query/get-pipeline-status";

// Action tools
import { evaluateJD } from "./action/evaluate-jd";
import { evaluateOffer } from "./action/evaluate-offer";
import { generateCV } from "./action/generate-cv";
import { scanPortals } from "./action/scan-portals";
import { checkHealth } from "./action/check-health";
import { fetchJDContent } from "./action/fetch-jd-content";
import { exportFile } from "./action/export-file";
import { importResume } from "./action/import-resume";
import { mineProfile } from "./action/mine-profile";

// Interview tools
import { generateInterviewQuestions, scoreInterviewAnswer } from "./interview-tools";

// MCP tool shims (browser-compatible, proxy to server-side MCP)
import { webSearch } from "./mcp/web-search";
import { getWeather, searchPlace, getDirections } from "./mcp/baidu-map";
import { searchJobs } from "./mcp/job-search";

import type { ToolDefinition, ToolResult } from "./types";

/* ── Singleton registry ── */

const registry = new ToolRegistry();

// Query tools
registry.register(searchApplications);
registry.register(getReportDetail);
registry.register(getProfile);
registry.register(getRecentActivity);
registry.register(getRecommendations);
registry.register(getPipelineStatus);

// Action tools
registry.register(evaluateJD);
registry.register(evaluateOffer);
registry.register(generateCV);
registry.register(scanPortals);
registry.register(checkHealth);
registry.register(fetchJDContent);
registry.register(exportFile);
registry.register(importResume);
registry.register(mineProfile);

// Interview tools
registry.register(generateInterviewQuestions);
registry.register(scoreInterviewAnswer);

// MCP tool shims (proxy to server-side MCP)
registry.register(webSearch);
registry.register(getWeather);
registry.register(searchPlace);
registry.register(getDirections);
registry.register(searchJobs);

/* ── Backward-compatible exports ── */

export { registry, ToolRegistry };
export type { ToolDefinition, ToolResult };

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return registry.getAll();
}

export function getToolsByCategory(category: "query" | "action"): ToolDefinition[] {
  return registry.getByCategory(category);
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  return registry.execute(name, params);
}

export function buildToolListForLLM(): string {
  return registry.buildToolListText();
}

/**
 * Build tool list text filtered to specific tool names.
 * Used by sub-agents to only list their allowed tools in the system prompt.
 */
export function buildToolListForAgent(toolNames: string[]): string {
  const tools = toolNames.map((n) => registry.get(n)).filter(Boolean);
  if (tools.length === 0) return "";
  const lines = tools.map((t) => {
    const paramsStr = Object.entries(t!.parameters)
      .map(([k, p]) => `${k}${p.required ? "" : "?"}: ${p.description}`)
      .join(", ");
    return `- ${t!.name}: ${t!.description}${paramsStr ? ` (${paramsStr})` : ""}`;
  });
  return `\n## 可用工具\n\n${lines.join("\n")}`;
}

/** Set tool whitelist for current active agent */
export function setActiveAgentTools(toolNames: string[]): void {
  registry.setActiveAgentTools(toolNames);
}

/** Clear tool whitelist (allow all tools) */
export function clearActiveAgentTools(): void {
  registry.clearActiveAgentTools();
}

export function formatToolResult(result: ToolResult, toolName: string): string {
  return registry.formatResult(result, toolName);
}

export default registry;
