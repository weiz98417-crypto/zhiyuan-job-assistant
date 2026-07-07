import type Database from "better-sqlite3";
import type { PoolClient } from "pg";
import { normalizeApplicationStatus, type ApplicationStatus } from "./application-status";
import { getDatabaseDriver, withPostgresClient } from "./postgres";
import { getDb } from "./server-db";

type AnyRow = Record<string, unknown>;

export interface TeamInsights {
  overview: {
    totalUsers: number;
    activeThisWeek: number;
    pendingApprovals: number;
    totalApplications: number;
    totalReports: number;
    totalJds: number;
    totalOffers: number;
    averageScore: number;
  };
  pipelineFunnel: Array<{
    stage: "discovered" | "saved_jd" | "evaluated" | "tracked" | "applied" | "responded" | "interview" | "offer";
    label: string;
    count: number;
    rateFromPrevious: number | null;
  }>;
  marketSignals: {
    directions: Array<{ name: string; count: number; averageScore: number; highRiskCount: number }>;
    sources: Array<{ source: string; count: number }>;
    cities: Array<{ city: string; count: number }>;
  };
  bottlenecks: Array<{
    key: string;
    label: string;
    count: number;
    severity: "info" | "warning" | "critical";
    recommendation: string;
  }>;
  agentQuality: {
    totalRuns: number;
    toolSuccessRate: number | null;
    failedRuns: number;
    readBackFailures: number;
    routingIssues: number;
    topFailureTypes: Array<{ type: string; count: number }>;
  };
  sharedAssets: {
    referenceResumes: number;
    sharedReferenceResumes: number;
    reusedAssets: Array<{ name: string; count: number }>;
    assetGaps: Array<{ direction: string; missing: string; count: number }>;
  };
  actionRecommendations: Array<{ title: string; detail: string; priority: "low" | "medium" | "high" }>;
  weeklyActivity: Array<{ displayName: string; count: number }>;
  hotDirections: Array<{ archetype: string; count: number }>;
  weeklyTrend: Array<{ week: string; count: number }>;
}

interface TeamInsightRows {
  users: AnyRow[];
  applications: AnyRow[];
  applicationEvents: AnyRow[];
  reports: AnyRow[];
  jds: AnyRow[];
  offers: AnyRow[];
  scanQueue: AnyRow[];
  scanJobs: AnyRow[];
  agentRuns: AnyRow[];
  agentRunReviews: AnyRow[];
  referenceResumes: AnyRow[];
  referenceResumeUsage: AnyRow[];
}

const PIPELINE_ORDER: ApplicationStatus[] = [
  "evaluated",
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "discarded",
  "skip",
];

export function getTeamInsights(db: Database.Database): TeamInsights {
  const rows: TeamInsightRows = {
    users: sqliteAll(db, "users"),
    applications: sqliteAll(db, "applications"),
    applicationEvents: sqliteAll(db, "application_events"),
    reports: sqliteAll(db, "reports"),
    jds: sqliteAll(db, "jds"),
    offers: sqliteAll(db, "offers"),
    scanQueue: sqliteAll(db, "scan_queue"),
    scanJobs: sqliteAll(db, "scan_jobs"),
    agentRuns: sqliteAll(db, "agent_runs"),
    agentRunReviews: sqliteAll(db, "agent_run_reviews"),
    referenceResumes: sqliteAll(db, "reference_resumes"),
    referenceResumeUsage: sqliteAll(db, "reference_resume_usage"),
  };

  return buildTeamInsights(rows);
}

export async function getTeamInsightsForSelectedDatabase(): Promise<TeamInsights> {
  if (getDatabaseDriver() !== "postgres") {
    return getTeamInsights(getDb());
  }

  return withPostgresClient(async (client) => {
    const rows: TeamInsightRows = {
      users: await pgAll(client, "users"),
      applications: await pgAll(client, "applications"),
      applicationEvents: await pgAll(client, "application_events"),
      reports: await pgAll(client, "reports"),
      jds: await pgAll(client, "jds"),
      offers: await pgAll(client, "offers"),
      scanQueue: await pgAll(client, "scan_queue"),
      scanJobs: await pgAll(client, "scan_jobs"),
      agentRuns: await pgAll(client, "agent_runs"),
      agentRunReviews: await pgAll(client, "agent_run_reviews"),
      referenceResumes: await pgAll(client, "reference_resumes"),
      referenceResumeUsage: await pgAll(client, "reference_resume_usage"),
    };

    return buildTeamInsights(rows);
  });
}

function buildTeamInsights(rows: TeamInsightRows): TeamInsights {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const monthAgo = now - 30 * 86400000;
  const activeUsers = rows.users.filter((row) => String(row.status || "") === "active");
  const pendingApprovals = rows.users.filter((row) => String(row.status || "") === "pending").length;

  const apps: Array<AnyRow & { status: ApplicationStatus; score: number }> = rows.applications.map((row) => ({
    ...row,
    status: normalizeApplicationStatus(String(row.status || "")),
    score: Number(row.score || 0),
  }));
  const reports: Array<AnyRow & { overall_score: number }> = rows.reports.map((row) => ({ ...row, overall_score: Number(row.overall_score || 0) }));
  const activeThisWeek = new Set(
    [...apps, ...reports, ...rows.offers, ...rows.jds]
      .filter((row) => toTime(row.updated_at || row.created_at || row.date) >= weekAgo)
      .map((row) => String(row.user_id || ""))
      .filter(Boolean),
  ).size;

  const discovered = Math.max(
    rows.scanJobs.length,
    sum(rows.scanQueue.map((row) => Number(row.jobs_found || row.jobs_new || 0))),
  );
  const evaluatedStatuses = countAppsAtOrBeyond(apps, ["evaluated", "applied", "responded", "interview", "offer", "rejected"]);
  const funnelCounts = [
    { stage: "discovered" as const, label: "岗位发现", count: discovered },
    { stage: "saved_jd" as const, label: "JD 入库", count: rows.jds.length },
    { stage: "evaluated" as const, label: "完成评估", count: Math.max(reports.length, evaluatedStatuses) },
    { stage: "tracked" as const, label: "加入追踪", count: apps.length },
    { stage: "applied" as const, label: "实际投递", count: countAppsAtOrBeyond(apps, ["applied", "responded", "interview", "offer", "rejected"]) },
    { stage: "responded" as const, label: "获得回复", count: countAppsAtOrBeyond(apps, ["responded", "interview", "offer", "rejected"]) },
    { stage: "interview" as const, label: "进入面试", count: countAppsAtOrBeyond(apps, ["interview", "offer"]) },
    { stage: "offer" as const, label: "拿到 Offer", count: Math.max(rows.offers.length, countAppsAtOrBeyond(apps, ["offer"])) },
  ];
  const pipelineFunnel = funnelCounts.map((item, index) => {
    const previous = index === 0 ? null : funnelCounts[index - 1].count;
    return {
      ...item,
      rateFromPrevious: previous && previous > 0 ? Math.round((item.count / previous) * 100) : null,
    };
  });

  const weeklyActivity = rankByUserReports(rows.users, reports, weekAgo);
  const directions = buildDirections(apps, reports, monthAgo);
  const sources = buildSources(apps, rows.jds, rows.scanJobs);
  const cities = buildCities(apps, rows.scanJobs);
  const bottlenecks = buildBottlenecks(apps, rows.applicationEvents, rows.offers, reports, now);
  const agentQuality = buildAgentQuality(rows.agentRuns, rows.agentRunReviews);
  const sharedAssets = buildSharedAssets(rows.referenceResumes, rows.referenceResumeUsage, directions);
  const actionRecommendations = buildRecommendations(bottlenecks, agentQuality, pipelineFunnel, sharedAssets);

  return {
    overview: {
      totalUsers: activeUsers.length,
      activeThisWeek,
      pendingApprovals,
      totalApplications: apps.length,
      totalReports: reports.length,
      totalJds: rows.jds.length,
      totalOffers: rows.offers.length,
      averageScore: average([...apps.map((a) => Number(a.score || 0)), ...reports.map((r) => Number(r.overall_score || 0))]),
    },
    pipelineFunnel,
    marketSignals: { directions, sources, cities },
    bottlenecks,
    agentQuality,
    sharedAssets,
    actionRecommendations,
    weeklyActivity,
    hotDirections: directions.map((direction) => ({ archetype: direction.name, count: direction.count })),
    weeklyTrend: buildWeeklyTrend(reports),
  };
}

function sqliteAll(db: Database.Database, table: string): AnyRow[] {
  try {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) return [];
    return db.prepare(`SELECT * FROM ${table}`).all() as AnyRow[];
  } catch {
    return [];
  }
}

async function pgAll(client: PoolClient, table: string): Promise<AnyRow[]> {
  const exists = await client.query("SELECT to_regclass($1) AS name", [table]);
  if (!exists.rows[0]?.name) return [];
  const result = await client.query(`SELECT * FROM ${pgIdent(table)}`);
  return result.rows.map(normalizePgRow);
}

function rankByUserReports(users: AnyRow[], reports: AnyRow[], since: number) {
  const userNames = new Map(users.map((row) => [String(row.id), String(row.display_name || row.username || "未命名成员")]));
  const counts = new Map<string, number>();
  for (const report of reports) {
    if (toTime(report.date || report.created_at) < since) continue;
    const userId = String(report.user_id || "");
    if (!userId) continue;
    counts.set(userId, (counts.get(userId) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([userId, count]) => ({ displayName: userNames.get(userId) || "未知成员", count }))
    .sort((a, b) => b.count - a.count);
}

function buildDirections(apps: AnyRow[], reports: AnyRow[], since: number) {
  const buckets = new Map<string, { count: number; scoreTotal: number; scoreCount: number; highRiskCount: number }>();
  const add = (name: string, score: number, highRisk: boolean) => {
    const key = cleanLabel(name) || "未分类方向";
    const bucket = buckets.get(key) || { count: 0, scoreTotal: 0, scoreCount: 0, highRiskCount: 0 };
    bucket.count += 1;
    if (score > 0) {
      bucket.scoreTotal += score;
      bucket.scoreCount += 1;
    }
    if (highRisk) bucket.highRiskCount += 1;
    buckets.set(key, bucket);
  };

  for (const report of reports) {
    if (toTime(report.date || report.created_at) < since) continue;
    add(String(report.archetype || report.role || ""), Number(report.overall_score || 0), isHighRisk(report));
  }
  for (const app of apps) {
    if (toTime(app.updated_at || app.created_at || app.date) < since) continue;
    add(String(app.role || ""), Number(app.score || 0), Number(app.score || 0) > 0 && Number(app.score || 0) < 65);
  }

  return [...buckets.entries()]
    .map(([name, item]) => ({
      name,
      count: item.count,
      averageScore: item.scoreCount ? Math.round(item.scoreTotal / item.scoreCount) : 0,
      highRiskCount: item.highRiskCount,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildSources(apps: AnyRow[], jds: AnyRow[], scanJobs: AnyRow[]) {
  const counts = new Map<string, number>();
  const add = (source: string, count = 1) => counts.set(source, (counts.get(source) || 0) + count);
  for (const jd of jds) add(sourceLabel(String(jd.source_type || "manual")));
  for (const app of apps) {
    const metadata = parseJsonObject(app.metadata_json);
    add(sourceLabel(String(metadata.source || metadata.origin || (app.source_url ? "source_url" : "manual"))));
  }
  if (scanJobs.length) add("岗位发现", scanJobs.length);
  return [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
}

function buildCities(apps: AnyRow[], scanJobs: AnyRow[]) {
  const counts = new Map<string, number>();
  for (const row of [...apps, ...scanJobs]) {
    const metadata = parseJsonObject(row.metadata_json || row.source_metadata_json);
    const city = cleanLabel(String(row.location || metadata.location || metadata.city || ""));
    if (city) counts.set(city, (counts.get(city) || 0) + 1);
  }
  return [...counts.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count).slice(0, 10);
}

function buildBottlenecks(apps: AnyRow[], events: AnyRow[], offers: AnyRow[], reports: AnyRow[], now: number) {
  const eventByApp = new Map<number, AnyRow[]>();
  for (const event of events) {
    const appId = Number(event.application_id || 0);
    if (!appId) continue;
    eventByApp.set(appId, [...(eventByApp.get(appId) || []), event]);
  }
  const highScoreNotApplied = apps.filter((app) => app.status === "evaluated" && Number(app.score || 0) >= 75).length;
  const appliedNoResponse = apps.filter((app) => app.status === "applied" && daysSince(app.updated_at || app.date, now) >= 7).length;
  const interviewNoRetro = apps.filter((app) => {
    if (app.status !== "interview") return false;
    const appEvents = eventByApp.get(Number(app.id || 0)) || [];
    return !appEvents.some((event) => /retro|review|复盘/.test(String(event.event_type || event.note || "")));
  }).length;
  const offerNeedsNegotiation = offers.filter((offer) => !offer.latest_report_id).length;
  const riskyJdFollowup = reports.filter(isHighRisk).length;
  return [
    {
      key: "high_score_not_applied",
      label: "高分岗位未投递",
      count: highScoreNotApplied,
      severity: highScoreNotApplied > 5 ? "critical" : highScoreNotApplied > 0 ? "warning" : "info",
      recommendation: "优先推动高分 JD 进入投递，或明确放弃原因，避免机会停在评估层。",
    },
    {
      key: "applied_no_response",
      label: "投递后长期无回复",
      count: appliedNoResponse,
      severity: appliedNoResponse > 5 ? "critical" : appliedNoResponse > 0 ? "warning" : "info",
      recommendation: "生成跟进话术，复盘简历关键词和投递渠道质量。",
    },
    {
      key: "interview_no_retro",
      label: "面试后缺少复盘",
      count: interviewNoRetro,
      severity: interviewNoRetro > 0 ? "warning" : "info",
      recommendation: "把面试反馈沉淀为题库、STAR 素材和下一轮准备动作。",
    },
    {
      key: "offer_needs_negotiation",
      label: "Offer 缺少谈判评估",
      count: offerNeedsNegotiation,
      severity: offerNeedsNegotiation > 0 ? "warning" : "info",
      recommendation: "补齐 Offer 评估和 HR 问询清单，避免只看月薪做决策。",
    },
    {
      key: "risky_jd_followup",
      label: "高风险 JD 待处理",
      count: riskyJdFollowup,
      severity: riskyJdFollowup > 3 ? "critical" : riskyJdFollowup > 0 ? "warning" : "info",
      recommendation: "集中复核外包、派遣、薪资模糊和职责混乱的 JD 风险。",
    },
  ] as TeamInsights["bottlenecks"];
}

function buildAgentQuality(agentRuns: AnyRow[], reviews: AnyRow[]): TeamInsights["agentQuality"] {
  const failedRuns = agentRuns.filter((run) => ["failed", "needs_engineering", "rolled_back"].includes(String(run.status || ""))).length;
  const completedRuns = agentRuns.filter((run) => ["succeeded", "failed", "needs_engineering", "rolled_back"].includes(String(run.status || ""))).length;
  const successfulRuns = agentRuns.filter((run) => String(run.status || "") === "succeeded").length;
  const readBackFailures = reviews.filter((review) => /read.?back|verification|校验/i.test(String(review.primary_failure_type || review.suggested_fix || ""))).length;
  const routingIssues = reviews.filter((review) => /route|routing|tool_mismatch|工具|路由/i.test(String(review.primary_failure_type || review.suggested_fix || ""))).length;
  const failureCounts = new Map<string, number>();
  for (const review of reviews) {
    const key = cleanLabel(String(review.primary_failure_type || "")) || "未分类失败";
    if (key === "未分类失败" && !review.verdict) continue;
    failureCounts.set(key, (failureCounts.get(key) || 0) + 1);
  }
  return {
    totalRuns: agentRuns.length,
    toolSuccessRate: completedRuns ? Math.round((successfulRuns / completedRuns) * 100) : null,
    failedRuns,
    readBackFailures,
    routingIssues,
    topFailureTypes: [...failureCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

function buildSharedAssets(referenceResumes: AnyRow[], usage: AnyRow[], directions: TeamInsights["marketSignals"]["directions"]): TeamInsights["sharedAssets"] {
  const sharedReferenceResumes = referenceResumes.filter((row) => ["team", "shared", "public"].includes(String(row.visibility || ""))).length;
  const usageCounts = new Map<string, number>();
  for (const row of usage) {
    const key = String(row.reference_resume_id || row.task_type || "参考资产");
    usageCounts.set(key, (usageCounts.get(key) || 0) + 1);
  }
  const assetGaps = directions
    .filter((direction) => direction.count >= 3 && sharedReferenceResumes === 0)
    .slice(0, 5)
    .map((direction) => ({ direction: direction.name, missing: "共享简历 / 面试素材 / 谈薪策略", count: direction.count }));
  return {
    referenceResumes: referenceResumes.length,
    sharedReferenceResumes,
    reusedAssets: [...usageCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    assetGaps,
  };
}

function buildRecommendations(
  bottlenecks: TeamInsights["bottlenecks"],
  agentQuality: TeamInsights["agentQuality"],
  funnel: TeamInsights["pipelineFunnel"],
  sharedAssets: TeamInsights["sharedAssets"],
): TeamInsights["actionRecommendations"] {
  const recommendations: TeamInsights["actionRecommendations"] = [];
  const criticalBottleneck = bottlenecks.find((item) => item.severity === "critical" && item.count > 0) || bottlenecks.find((item) => item.count > 0);
  if (criticalBottleneck) {
    recommendations.push({ title: criticalBottleneck.label, detail: criticalBottleneck.recommendation, priority: criticalBottleneck.severity === "critical" ? "high" : "medium" });
  }
  const tracked = funnel.find((item) => item.stage === "tracked")?.count || 0;
  const applied = funnel.find((item) => item.stage === "applied")?.count || 0;
  if (tracked > 0 && applied / tracked < 0.35) {
    recommendations.push({ title: "追踪到投递转化偏低", detail: "让 Agent 对高分未投岗位批量生成投递建议和下一步动作。", priority: "high" });
  }
  if ((agentQuality.readBackFailures || agentQuality.routingIssues) > 0) {
    recommendations.push({ title: "Agent 可靠性需要复盘", detail: "优先查看读回校验失败和路由错误，补 evals 后再扩展新工具。", priority: "high" });
  }
  if (sharedAssets.assetGaps.length > 0) {
    recommendations.push({ title: "团队资产缺口", detail: "为高频方向补共享简历、面试题和谈薪材料，减少重复准备。", priority: "medium" });
  }
  if (recommendations.length === 0) {
    recommendations.push({ title: "继续沉淀 Pipeline 数据", detail: "当前没有明显卡点。保持 JD 入库、评估、投递和复盘事件的完整记录。", priority: "low" });
  }
  return recommendations.slice(0, 5);
}

function buildWeeklyTrend(reports: AnyRow[]) {
  const counts = new Map<string, number>();
  const since = Date.now() - 28 * 86400000;
  for (const report of reports) {
    const time = toTime(report.date || report.created_at);
    if (time < since) continue;
    const date = new Date(time);
    const week = `${date.getFullYear()}-${String(Math.ceil((dayOfYear(date) + 1) / 7)).padStart(2, "0")}`;
    counts.set(week, (counts.get(week) || 0) + 1);
  }
  return [...counts.entries()].map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week));
}

function countAppsAtOrBeyond(apps: Array<AnyRow & { status: ApplicationStatus }>, statuses: ApplicationStatus[]) {
  return apps.filter((app) => statuses.includes(app.status)).length;
}

function isHighRisk(row: AnyRow) {
  const legitimacy = String(row.legitimacy || "").toLowerCase();
  const score = Number(row.overall_score || row.score || 0);
  return score > 0 && score < 65 || /risk|red|high|高风险|外包|派遣/.test(legitimacy);
}

function sourceLabel(source: string) {
  const value = source.toLowerCase();
  if (value.includes("discovery") || value.includes("scan")) return "岗位发现";
  if (value.includes("agent")) return "Agent";
  if (value.includes("url") || value.includes("source")) return "原始链接";
  if (value.includes("paste")) return "手动粘贴";
  if (value.includes("report")) return "评估报告";
  return source || "未知来源";
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!usable.length) return 0;
  return Math.round(sum(usable) / usable.length);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function daysSince(value: unknown, now: number) {
  const time = toTime(value);
  if (!time) return 0;
  return Math.floor((now - time) / 86400000);
}

function toTime(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function parseJsonObject(value: unknown): AnyRow {
  if (!value) return {};
  if (typeof value === "object") return value as AnyRow;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizePgRow(row: AnyRow): AnyRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
}

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

function pgIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
