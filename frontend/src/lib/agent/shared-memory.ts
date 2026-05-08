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
    const parts: string[] = [];

    // Read from IndexedDB profile signals
    try {
      const { default: db } = await import("@/lib/db");
      const profile = await db.profiles.orderBy("lastUpdated").last();
      if (profile) {
        if (profile.goals) {
          const goals = typeof profile.goals === "string" ? JSON.parse(profile.goals) : profile.goals;
          if (goals.targetRoles?.length) {
            parts.push(`目标岗位: ${goals.targetRoles.join("、")}`);
          }
          if (goals.salaryRange) {
            parts.push(`薪资期望: ${goals.salaryRange}`);
          }
          if (goals.preferredCompanies?.length) {
            parts.push(`意向公司: ${goals.preferredCompanies.join("、")}`);
          }
        }
        if (profile.skills?.length) {
          const topSkills = profile.skills
            .slice(0, 8)
            .map((s: { name: string; proficiency?: number }) =>
              s.proficiency != null ? `${s.name}(${s.proficiency})` : s.name,
            );
          parts.push(`核心技能: ${topSkills.join("、")}`);
        }
        if (profile.goals?.dealBreakers?.length) {
          parts.push(`底线: ${profile.goals.dealBreakers.join("、")}`);
        }
      }
    } catch {
      // IndexedDB not available — skip
    }

    return parts.length > 0 ? parts.join("\n") : "用户画像数据暂不可用";
  } catch {
    return "用户画像数据暂不可用";
  }
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
