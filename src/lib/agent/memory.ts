import db from "@/lib/db";
import type {
  AgentInteraction,
  AgentDecision,
  AgentPreferenceModel,
  RolePreference,
} from "@/types";

const MAX_INTERACTION_AGE_DAYS = 90;
const PREF_DECAY_HALF_LIFE_DAYS = 90;
const PREF_SCORE_MAX = 0.15;
const PREF_SCORE_MIN = -0.15;
const PREF_CONFIDENCE_THRESHOLD = 0.3;

/* ── AgentInteraction ── */

export async function logInteraction(
  interaction: Omit<AgentInteraction, "id">,
): Promise<number> {
  const id = await db.agentInteractions.add(interaction as AgentInteraction);
  return id as number;
}

export async function updateInteractionFeedback(
  id: number,
  feedback: AgentInteraction["feedback"],
): Promise<void> {
  await db.agentInteractions.update(id as never, { feedback } as never);
}

export async function getRecentInteractions(limit = 5): Promise<AgentInteraction[]> {
  return db.agentInteractions
    .orderBy("timestamp")
    .reverse()
    .limit(limit)
    .toArray();
}

export async function findInteractionByTrigger(
  trigger: AgentInteraction["trigger"],
  since: Date,
): Promise<AgentInteraction | undefined> {
  return db.agentInteractions
    .where("trigger")
    .equals(trigger)
    .filter((i) => i.timestamp >= since)
    .first();
}

export async function cleanupOldInteractions(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_INTERACTION_AGE_DAYS);
  await db.agentInteractions.where("timestamp").below(cutoff).delete();
}

/* ── AgentDecision ── */

export async function logDecision(
  decision: Omit<AgentDecision, "id">,
): Promise<number> {
  const id = await db.agentDecisions.add(decision as AgentDecision);
  return id as number;
}

export async function updateDecisionResponse(
  id: number,
  userResponse: AgentDecision["userResponse"],
): Promise<void> {
  await db.agentDecisions.update(id as never, { userResponse } as never);
}

export async function updateDecisionOutcome(
  id: number,
  outcome: AgentDecision["outcome"],
): Promise<void> {
  await db.agentDecisions.update(id as never, { outcome } as never);
}

export async function getPendingDecisions(): Promise<AgentDecision[]> {
  return db.agentDecisions
    .where("userResponse")
    .equals("pending")
    .toArray();
}

export async function getRecentDecisions(limit = 10): Promise<AgentDecision[]> {
  return db.agentDecisions
    .orderBy("timestamp")
    .reverse()
    .limit(limit)
    .toArray();
}

export async function findDecisionsByEntity(
  entityType: string,
  entityId: number,
): Promise<AgentDecision[]> {
  return db.agentDecisions
    .filter(
      (d) =>
        d.target.entityType === entityType && d.target.entityId === entityId,
    )
    .toArray();
}

/* ── AgentPreferenceModel ── */

const DEFAULT_PREFERENCES: AgentPreferenceModel = {
  rolePreferences: {},
  companyPreferences: {
    liked: [],
    disliked: [],
    preferredSize: null,
    preferredIndustry: [],
  },
  salarySensitivity: {
    minAcceptable: 0,
    preferred: 0,
    flexibility: "unknown",
    learnedFrom: [],
  },
  behaviorPatterns: {
    evaluateToApplyDays: 0,
    preferredInterviewPrepHours: 0,
    activeHours: [],
    decisionStyle: "cautious",
  },
  lastUpdated: new Date().toISOString(),
};

export async function loadPreferences(): Promise<AgentPreferenceModel> {
  const pref = await db.agentPreferences.where("id").equals(1 as never).first();
  return pref ?? { ...DEFAULT_PREFERENCES };
}

export async function savePreferences(
  model: AgentPreferenceModel,
): Promise<void> {
  model.lastUpdated = new Date().toISOString();
  const existing = await db.agentPreferences.where("id").equals(1 as never).first();
  if (existing) {
    await db.agentPreferences.update(1 as never, { ...model } as never);
  } else {
    await db.agentPreferences.put({ ...model, id: 1 } as AgentPreferenceModel);
  }
}

/* ── Preference updates with decay ── */

export function applyRolePreferenceDecay(
  rolePrefs: Record<string, RolePreference>,
): Record<string, RolePreference> {
  const now = new Date();
  const updated: Record<string, RolePreference> = {};

  for (const [role, pref] of Object.entries(rolePrefs)) {
    const daysSinceUpdate =
      (now.getTime() - new Date(pref.lastUpdated).getTime()) / 86400000;

    if (daysSinceUpdate > PREF_DECAY_HALF_LIFE_DAYS) {
      const decayedScore = pref.score * 0.5;
      if (Math.abs(decayedScore) < 0.05) continue; // Remove negligible
      updated[role] = {
        ...pref,
        score: decayedScore,
        confidence: Math.max(0.1, pref.confidence * 0.5),
        lastUpdated: now.toISOString(),
      };
    } else {
      updated[role] = pref;
    }
  }

  return updated;
}

export async function updateRolePreference(
  role: string,
  scoreDelta: number,
  source: RolePreference["source"] = "learned",
): Promise<void> {
  const prefs = await loadPreferences();

  // Apply decay first
  prefs.rolePreferences = applyRolePreferenceDecay(prefs.rolePreferences);

  const existing = prefs.rolePreferences[role];
  if (existing) {
    // Manual source overrides learned/explore
    if (existing.source === "manual" && source !== "manual") return;

    const newScore = clampScore(existing.score + scoreDelta);
    existing.score = newScore;
    existing.sampleCount += 1;
    existing.confidence = Math.min(1, existing.confidence + 0.1);
    existing.lastUpdated = new Date().toISOString();
    if (source === "manual") existing.source = "manual";
  } else {
    prefs.rolePreferences[role] = {
      score: clampScore(scoreDelta),
      confidence: source === "explore" ? 0.4 : 0.2,
      sampleCount: 1,
      lastUpdated: new Date().toISOString(),
      source,
    };
  }

  // Cleanup low-confidence entries
  for (const [r, p] of Object.entries(prefs.rolePreferences)) {
    if (p.confidence < PREF_CONFIDENCE_THRESHOLD && p.source !== "manual") {
      delete prefs.rolePreferences[r];
    }
  }

  await savePreferences(prefs);
}

export async function updateCompanyPreference(
  company: string,
  action: "like" | "dislike",
): Promise<void> {
  const prefs = await loadPreferences();

  if (action === "dislike") {
    if (!prefs.companyPreferences.disliked.includes(company)) {
      prefs.companyPreferences.disliked = [
        ...prefs.companyPreferences.disliked,
        company,
      ];
    }
    prefs.companyPreferences.liked = prefs.companyPreferences.liked.filter(
      (c) => c !== company,
    );
  } else {
    if (!prefs.companyPreferences.liked.includes(company)) {
      prefs.companyPreferences.liked = [
        ...prefs.companyPreferences.liked,
        company,
      ];
    }
    prefs.companyPreferences.disliked =
      prefs.companyPreferences.disliked.filter((c) => c !== company);
  }

  await savePreferences(prefs);
}

/* ── Scoring helpers ── */

export function getPreferenceBonus(
  prefs: AgentPreferenceModel | null,
  role: string,
  company: string,
): number {
  if (!prefs) return 0;

  let bonus = 0;

  // Check role preferences
  const rolePref = prefs.rolePreferences[role];
  if (rolePref && rolePref.confidence >= PREF_CONFIDENCE_THRESHOLD) {
    // Map score (-1..1) to bonus (-10..+10)
    bonus += Math.round(rolePref.score * 10);
  }

  // Check company preferences
  if (prefs.companyPreferences.liked.includes(company)) {
    bonus += 5;
  }
  if (prefs.companyPreferences.disliked.includes(company)) {
    bonus -= 10;
  }

  return clampBonus(bonus);
}

function clampScore(score: number): number {
  return Math.max(PREF_SCORE_MIN, Math.min(PREF_SCORE_MAX, score));
}

function clampBonus(bonus: number): number {
  return Math.max(-15, Math.min(15, bonus));
}
