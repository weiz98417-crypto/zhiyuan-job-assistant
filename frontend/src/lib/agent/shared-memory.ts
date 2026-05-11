/**
 * Shared Memory Layer — 所有子 Agent 的统一记忆层
 *
 * Provides:
 * - Career DNA summary (from profile_signals + ZhiyuanProfile + config)
 * - Session context / memory digest
 * - Cross-agent findings query
 * - Per-agent knowledge injection
 */
import type { KnowledgeDomain } from "@/lib/agent/registry/types";
import { injectKnowledge } from "@/lib/agent/knowledge";
import type { AgentScenario } from "@/lib/agent/knowledge";

// ── Domain → scenario mapping for knowledge injection ──

const DOMAIN_SCENARIO: Record<KnowledgeDomain, AgentScenario> = {
  "interview-styles": "interview_prep",
  "salary-benchmarks": "evaluate",
  "zhiyuan-levels": "dingwei",
  "jd-signals": "evaluate",
};

/**
 * Generate compact Career DNA summary from profile data.
 *
 * Aggregates from:
 * - profile_signals (IndexedDB — skill claims, role prefs, dealbreakers)
 * - config/profile.yml (name, targetRoles, salary range, narrative)
 * - ZhiyuanProfile from IndexedDB (goals, preferences)
 *
 * Falls back to "用户画像数据暂不可用" on any error.
 */
export async function getCareerDNASummary(): Promise<string> {
  try {
    // First try server-side profile API for authoritative data
    const res = await fetch("/api/profile/dna").catch(() => null);
    if (res?.ok) {
      const json = await res.json();
      if (json.success && json.data?.summary) return json.data.summary;
    }

    // Fallback to IndexedDB
    const { default: db } = await import("@/lib/db");
    const profile = await db.profiles.orderBy("lastUpdated").last();
    if (profile) {
      const parts: string[] = [];
      if (profile.goals) {
        const goals = typeof profile.goals === "string" ? JSON.parse(profile.goals) : profile.goals;
        if (goals.targetRoles?.length) {
          const roleStrs = goals.targetRoles.map((r: unknown) => {
            if (typeof r === "string") return r;
            if (r && typeof r === "object") {
              const o = r as Record<string,string>;
              return o.level ? `${o.role}(${o.level})` : o.role;
            }
            return String(r);
          });
          parts.push(`目标岗位: ${roleStrs.join("、")}`);
        }
        if (goals.salaryRange) {
          if (typeof goals.salaryRange === "object") {
            const sr = goals.salaryRange as { min?: number; max?: number };
            parts.push(`薪资期望: ${sr.min || "?"}K-${sr.max || "?"}K`);
          } else {
            parts.push(`薪资期望: ${goals.salaryRange}`);
          }
        }
        if (goals.dealBreakers?.length) parts.push(`底线: ${goals.dealBreakers.join("、")}`);
      }
      if (profile.skills?.length) {
        parts.push(`核心技能: ${profile.skills.slice(0, 8).map((s: { name: string }) => s.name).join("、")}`);
      }
      if (parts.length) return parts.join("\n");
    }
  } catch { /* fall through */ }

  return "用户画像数据暂不可用";
}

/**
 * Get session memory digest.
 *
 * Reuses generateMemoryDigest from sessions.ts.
 * Returns null if fewer than 5 user messages.
 */
export function getSessionContext(
  messages: { role: string; content: string }[],
): string | null {
  try {
    // generateMemoryDigest requires AgentMessage[] — do lightweight check
    const userMsgs = messages.filter((m) => m.role === "user");
    if (userMsgs.length < 5) return null;

    // Build a simple digest from user messages
    const recentUserText = userMsgs.slice(-10).map((m) => m.content).join("\n");
    if (recentUserText.length < 50) return null;

    return `[会话摘要] 最近${Math.min(userMsgs.length, 10)}条用户消息涉及: ${recentUserText.slice(0, 300)}`;
  } catch {
    return null;
  }
}

/**
 * Query key findings from a specific agent type.
 *
 * Scans agent_decisions and recent interactions for
 * discoveries made by the given agent.
 */
export async function getAgentFindings(agentId: string): Promise<string[]> {
  try {
    const { default: db } = await import("@/lib/db");
    const interactions = await db.agentInteractions
      .orderBy("timestamp")
      .reverse()
      .limit(20)
      .toArray();

    return interactions
      .filter((i) => i.output?.summary)
      .map((i) => i.output!.summary!)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Get Claude Agent's recent evaluation activity from SQLite.
 *
 * Queries the applications table for the 5 most recent evaluations,
 * plus pipeline status summary. Returns a compact formatted string
 * suitable for injection into Next.js Agent system prompts.
 *
 * Falls back to empty string on any error (SQLite not available, no data, etc.)
 */
export async function getClaudeAgentActivity(): Promise<string> {
  try {
    const res = await fetch("/api/agent/claude-activity");
    if (!res.ok) return "";
    const data = await res.json();
    return data.activity || "";
  } catch {
    return "";
  }
}

/**
 * Inject knowledge subset based on agent's knowledge domains.
 *
 * Uses the existing injectKnowledge() from knowledge/index.ts,
 * calling it once per domain with the appropriate scenario.
 */
export function getKnowledgeForAgent(domains: KnowledgeDomain[]): string {
  if (!domains || domains.length === 0) return "";

  const parts: string[] = [];
  const seenScenarios = new Set<string>();

  for (const domain of domains) {
    const scenario = DOMAIN_SCENARIO[domain];
    if (!scenario || seenScenarios.has(scenario)) continue;
    seenScenarios.add(scenario);

    try {
      const knowledge = injectKnowledge(scenario);
      if (knowledge) parts.push(knowledge);
    } catch {
      // Skip failed injections
    }
  }

  return parts.join("\n\n");
}
