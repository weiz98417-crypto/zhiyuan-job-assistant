// Analytics utilities — ported from followup-cadence.mjs + analyze-patterns.mjs
// Pure functions for follow-up urgency computation, status normalization, and pattern analysis.

// --- Status normalization (mirrors verify-pipeline.mjs) ---
const STATUS_ALIASES: Record<string, string> = {
  evaluada: "evaluated",
  condicional: "evaluated",
  hold: "evaluated",
  evaluar: "evaluated",
  verificar: "evaluated",
  aplicado: "applied",
  enviada: "applied",
  aplicada: "applied",
  applied: "applied",
  sent: "applied",
  respondido: "responded",
  entrevista: "interview",
  oferta: "offer",
  rechazado: "rejected",
  rechazada: "rejected",
  descartado: "discarded",
  descartada: "discarded",
  cerrada: "discarded",
  cancelada: "discarded",
  "no aplicar": "skip",
  no_aplicar: "skip",
  monitor: "skip",
  "geo blocker": "skip",
};

export function normalizeStatus(raw: string): string {
  const clean = raw
    .replace(/\*\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "")
    .trim();
  return STATUS_ALIASES[clean] || clean;
}

// --- Cadence configuration ---
export interface CadenceConfig {
  appliedFirst: number;
  appliedSubsequent: number;
  appliedMaxFollowups: number;
  respondedInitial: number;
  respondedSubsequent: number;
  interviewThankyou: number;
}

const DEFAULT_CADENCE: CadenceConfig = {
  appliedFirst: 7,
  appliedSubsequent: 7,
  appliedMaxFollowups: 2,
  respondedInitial: 1,
  respondedSubsequent: 3,
  interviewThankyou: 1,
};

export type Urgency = "urgent" | "overdue" | "waiting" | "cold";

// --- Date helpers ---
function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().split("T")[0];
}

// --- Follow-up entry ---
export interface FollowUpEntry {
  num: number;
  date: string;
  company: string;
  role: string;
  status: string;
  score: string;
  daysSinceApplication: number;
  daysSinceLastFollowup: number | null;
  followupCount: number;
  urgency: Urgency;
  nextFollowupDate: string | null;
  daysUntilNext: number | null;
}

// --- Compute urgency tier ---
export function computeUrgency(
  status: string,
  daysSinceApp: number,
  daysSinceLastFollowup: number | null,
  followupCount: number,
  cadence: CadenceConfig = DEFAULT_CADENCE
): Urgency {
  if (status === "applied") {
    if (followupCount >= cadence.appliedMaxFollowups) return "cold";
    if (followupCount === 0 && daysSinceApp >= cadence.appliedFirst) return "overdue";
    if (
      followupCount > 0 &&
      daysSinceLastFollowup !== null &&
      daysSinceLastFollowup >= cadence.appliedSubsequent
    )
      return "overdue";
    return "waiting";
  }
  if (status === "responded") {
    if (daysSinceApp < cadence.respondedInitial) return "urgent";
    if (daysSinceApp >= cadence.respondedSubsequent) return "overdue";
    return "waiting";
  }
  if (status === "interview") {
    if (daysSinceApp >= cadence.interviewThankyou) return "overdue";
    return "waiting";
  }
  return "waiting";
}

// --- Compute next follow-up date ---
export function computeNextFollowupDate(
  status: string,
  appDate: string,
  lastFollowupDate: string | null,
  followupCount: number,
  cadence: CadenceConfig = DEFAULT_CADENCE
): string | null {
  if (status === "applied") {
    if (followupCount >= cadence.appliedMaxFollowups) return null;
    if (followupCount === 0) return addDays(new Date(appDate), cadence.appliedFirst);
    if (lastFollowupDate) return addDays(new Date(lastFollowupDate), cadence.appliedSubsequent);
    return addDays(new Date(appDate), cadence.appliedFirst);
  }
  if (status === "responded") {
    if (lastFollowupDate) return addDays(new Date(lastFollowupDate), cadence.respondedSubsequent);
    return addDays(new Date(appDate), cadence.respondedSubsequent);
  }
  if (status === "interview") {
    return addDays(new Date(appDate), cadence.interviewThankyou);
  }
  return null;
}

// --- Outcome classification ---
export type Outcome = "positive" | "negative" | "self_filtered" | "pending";

export function classifyOutcome(status: string): Outcome {
  const s = normalizeStatus(status);
  if (["interview", "offer", "responded", "applied"].includes(s)) return "positive";
  if (["rejected", "discarded"].includes(s)) return "negative";
  if (["skip"].includes(s)) return "self_filtered";
  return "pending";
}

// --- Funnel analysis ---
export interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
}

const FUNNEL_STAGES = ["evaluated", "applied", "responded", "interview", "offer"] as const;

export function computeFunnel(
  statuses: string[],
  stageOrder: string[] = [...FUNNEL_STAGES]
): FunnelStage[] {
  return stageOrder.map((stage, idx) => {
    const stageIdx = stageOrder.indexOf(stage);
    const count = statuses.filter((s) => {
      const appIdx = stageOrder.indexOf(normalizeStatus(s));
      return appIdx >= stageIdx;
    }).length;
    const prevCount =
      idx > 0
        ? statuses.filter((s) => {
            const prevStageIdx = stageOrder.indexOf(stageOrder[idx - 1]);
            return stageOrder.indexOf(normalizeStatus(s)) >= prevStageIdx;
          }).length
        : count;
    const rate = prevCount > 0 ? Math.round((count / prevCount) * 100) : 100;
    return { stage, count, rate };
  });
}

// --- Follow-up cadence analysis ---
export interface CadenceInput {
  num: number;
  date: string;
  company: string;
  role: string;
  status: string;
  score: string;
  followups: { date: string }[];
}

const ACTIONABLE_STATUSES = ["applied", "responded", "interview"];

export function analyzeFollowUps(
  apps: CadenceInput[],
  cadence: CadenceConfig = DEFAULT_CADENCE
): { metadata: Record<string, number>; entries: FollowUpEntry[] } {
  const now = new Date(new Date().toISOString().split("T")[0]);
  const entries: FollowUpEntry[] = [];

  for (const app of apps) {
    const normalized = normalizeStatus(app.status);
    if (!ACTIONABLE_STATUSES.includes(normalized)) continue;

    const appDate = new Date(app.date);
    if (isNaN(appDate.getTime())) continue;

    const daysSinceApp = daysBetween(appDate, now);
    const followupCount = app.followups.length;

    let lastFollowupDate: string | null = null;
    let daysSinceLastFollowup: number | null = null;
    if (app.followups.length > 0) {
      const sorted = [...app.followups].sort((a, b) => (a.date > b.date ? -1 : 1));
      lastFollowupDate = sorted[0].date;
      const lastDate = new Date(lastFollowupDate);
      if (!isNaN(lastDate.getTime())) daysSinceLastFollowup = daysBetween(lastDate, now);
    }

    const urgency = computeUrgency(normalized, daysSinceApp, daysSinceLastFollowup, followupCount, cadence);
    const nextFollowupDate = computeNextFollowupDate(normalized, app.date, lastFollowupDate, followupCount, cadence);
    const nextDate = nextFollowupDate ? new Date(nextFollowupDate) : null;
    const daysUntilNext = nextDate && !isNaN(nextDate.getTime()) ? daysBetween(now, nextDate) : null;

    entries.push({
      num: app.num,
      date: app.date,
      company: app.company,
      role: app.role,
      status: normalized,
      score: app.score,
      daysSinceApplication: daysSinceApp,
      daysSinceLastFollowup,
      followupCount,
      urgency,
      nextFollowupDate,
      daysUntilNext,
    });
  }

  const urgencyOrder: Record<Urgency, number> = { urgent: 0, overdue: 1, waiting: 2, cold: 3 };
  entries.sort((a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9));

  return {
    metadata: {
      totalTracked: apps.length,
      actionable: entries.length,
      overdue: entries.filter((e) => e.urgency === "overdue").length,
      urgent: entries.filter((e) => e.urgency === "urgent").length,
      cold: entries.filter((e) => e.urgency === "cold").length,
      waiting: entries.filter((e) => e.urgency === "waiting").length,
    },
    entries,
  };
}
