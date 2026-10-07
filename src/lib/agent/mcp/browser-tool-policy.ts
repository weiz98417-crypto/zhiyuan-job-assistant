import type { ToolGovernance } from "@/lib/agent/tool-governance";
import type { ToolCapability } from "@/lib/agent/tools/types";

/**
 * 浏览器工具的封闭分级（Spec 16 / ADR-0039）。
 *
 * 规则：
 * - 显式 READ 清单里的工具是读动作（免 Run Gate）；
 * - `browser_evaluate` 可以在页面里执行任意 JS，等同远程执行，本批不注册；
 * - 其余一切浏览器工具（含未来新增的）一律按写动作处理——分级必须封闭，不允许新工具落进无治理空档。
 */

export interface BrowserToolClassification {
  registerable: boolean;
  effect: "read" | "write";
}

const BROWSER_READ_TOOLS = new Set([
  "browser_navigate",
  "browser_go_back",
  "browser_go_forward",
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_wait_for",
  "browser_console_messages",
  "browser_network_requests",
  "browser_tab_list",
  "browser_tab_select",
]);

const BROWSER_EXCLUDED_TOOLS = new Set([
  "browser_evaluate",
]);

export function classifyBrowserTool(mcpToolName: string): BrowserToolClassification {
  if (BROWSER_EXCLUDED_TOOLS.has(mcpToolName)) return { registerable: false, effect: "write" };
  if (BROWSER_READ_TOOLS.has(mcpToolName)) return { registerable: true, effect: "read" };
  return { registerable: true, effect: "write" };
}

/** repo 级域名允许清单（ADR-0039）：清单外导航确定性拒绝，不弹审批。改动走 PR 评审。 */
export const BROWSER_DOMAIN_ALLOWLIST = [
  "zhipin.com",
  "liepin.com",
  "lagou.com",
  "51job.com",
  "zhaopin.com",
] as const;

export function isUrlAllowed(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return BROWSER_DOMAIN_ALLOWLIST.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

export function buildBrowserToolGovernance(toolName: string, effect: "read" | "write"): ToolGovernance {
  return {
    name: toolName,
    effect: effect === "read" ? "read" : "write",
    allowedTaskTypes: ["general_chat", "job_search", "jd_evaluation", "resume_diagnosis", "resume_query"],
    agentAllowlist: ["general", "evaluate", "resume"],
    requiresUserConfirmation: effect === "write",
    requiresReadBack: false,
    successContract: effect === "read"
      ? "Read the allowlisted page snapshot/content only; no site mutation."
      : "Perform the single approved page action on an allowlisted site; report the resulting page state.",
    conflictPriority: 60,
    userVisibleNameZh: effect === "read" ? "浏览网页" : "网页操作（需批准）",
  };
}

export function buildBrowserToolCapability(effect: "read" | "write"): ToolCapability {
  const read = effect === "read";
  return {
    risk: read ? "low" : "high",
    deadlineClass: read ? "foreground_read" : "verified_write",
    // 慢门户放宽（Spec 16）：读 90s / 写 120s，均高于 MCP callTool 的 30s。
    deadlineMs: read ? 90_000 : 120_000,
    cancellation: "cooperative",
    idempotency: read ? "none" : "request_key",
    reconciliation: read ? "none" : "manual",
    verification: "none",
    backgroundCapable: false,
    workerExecution: "server",
  };
}
