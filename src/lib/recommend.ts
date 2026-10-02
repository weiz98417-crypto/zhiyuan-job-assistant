import db from "@/lib/db";
import { loadProfile } from "@/lib/profile-storage";
import { getCVFullText } from "@/lib/cv-storage";
import { loadPreferences, getPreferenceBonus } from "@/lib/agent/memory";
import type { AgentPreferenceModel, ZhiyuanProfile, EvaluationReport } from "@/types";
import { isFivePointScore, isPercentageScore } from "@/lib/score-scale";

export interface RecommendResult {
  jdId: number;
  company: string;
  role: string;
  matchScore: number;
  reasons: string[];
  riskNote?: string;
  reportId: number;
}

interface CachedResult {
  results: RecommendResult[];
  timestamp: number;
  jdHash: string;
}

let cache: CachedResult | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function jdHash(reports: EvaluationReport[]): string {
  return reports
    .map((r) => `${r.id}:${r.overallScore}`)
    .sort()
    .join("|");
}

export async function getRecommendations(limit = 3): Promise<{
  recommendations: RecommendResult[];
  cached: boolean;
  message?: string;
}> {
  const profile = await loadProfile();
  const reports = (await db.reports
    .where("overallScore")
    .aboveOrEqual(3.5)
    .toArray()).filter((report) => isFivePointScore(report.overallScore));

  // Filter to only evaluated (not yet applied)
  const apps = await db.applications.toArray();
  const appliedReportIds = new Set(apps.map((a) => a.reportPath).filter(Boolean));
  const availableReports = reports.filter((r) => {
    const rp = `reports/${String(r.reportNum).padStart(3, "0")}-${r.company.toLowerCase().replace(/\s+/g, "-")}-${r.date}.md`;
    return !appliedReportIds.has(rp);
  });

  // Cache check
  const hash = jdHash(availableReports);
  if (
    cache &&
    Date.now() - cache.timestamp < CACHE_TTL &&
    cache.jdHash === hash
  ) {
    return { recommendations: cache.results.slice(0, limit), cached: true };
  }

  if (availableReports.length === 0) {
    return {
      recommendations: [],
      cached: false,
      message: "暂无待评估的 JD——去评估页粘贴你的第一个 JD 吧",
    };
  }

  if (!profile || profile.skills.length === 0) {
    // Fallback: keyword matching based on goals
    const results = fallbackRecommend(availableReports, profile?.goals, limit);
    cache = { results, timestamp: Date.now(), jdHash: hash };
    return { recommendations: results, cached: false };
  }

  // Full recommendation: compute scores + LLM reasons
  const prefs = await loadPreferences();
  const scored = availableReports.map((report) => {
    // Spec 29：真实投递反馈替换写死的 prefFit=50（样本 <5 时保持 50 并标注数据不足）
    const outcome = computeOutcomeSignal(apps, report);
    const score = computeMatchScore(report, profile, prefs, outcome);
    return { report, score, outcome };
  });

  scored.sort((a, b) => b.score - a.score);

  const topN = scored.slice(0, limit);

  // Generate reasons via LLM
  const reasonsMap = await generateReasons(
    topN.map((s) => s.report),
    profile,
  );

  const results: RecommendResult[] = topN.map((s) => {
    const reasons = reasonsMap.get(s.report.id ?? 0) ?? [];
    return {
      jdId: s.report.id ?? 0,
      company: s.report.company,
      role: s.report.role,
      matchScore: s.score,
      reasons: reasons.length > 0 ? reasons : [`整体匹配度 ${s.score} 分`],
      reportId: s.report.reportNum,
      ...(s.outcome.sampleSize < 5 ? { outcomeNote: `偏好匹配数据不足（${s.outcome.sampleSize} 场面试样本，需 ≥5）` } : {}),
    };
  });

  cache = { results, timestamp: Date.now(), jdHash: hash };
  return { recommendations: results, cached: false };
}

/** Spec 29：从投递记录提炼「进入面试」的岗位特征信号（确定性，无 LLM）。 */
export function computeOutcomeSignal(
  apps: Array<{ status: string; company: string; role: string }>,
  report: { company: string; role: string },
): { sampleSize: number; similarity: number } {
  const INTERVIEW_PLUS = new Set(["interview", "offer"]);
  const interviewed = apps.filter((a) => INTERVIEW_PLUS.has(a.status));
  const sampleSize = interviewed.length;
  if (sampleSize === 0) return { sampleSize: 0, similarity: 50 };
  const reportRoleTokens = new Set((report.role || "").toLowerCase().split(/[\s·，,/、]+/).filter((t) => t.length >= 2));
  let best = 0;
  for (const app of interviewed) {
    const appRoleTokens = (app.role || "").toLowerCase().split(/[\s·，,/、]+/).filter((t) => t.length >= 2);
    const overlap = appRoleTokens.filter((token) => reportRoleTokens.has(token)).length;
    const roleSim = appRoleTokens.length ? Math.round((overlap / appRoleTokens.length) * 70) : 0;
    const companySim = app.company && report.company && app.company === report.company ? 30 : 0;
    best = Math.max(best, Math.min(100, roleSim + companySim));
  }
  return { sampleSize, similarity: best };
}

function computeMatchScore(
  report: EvaluationReport,
  profile: ZhiyuanProfile,
  prefs?: AgentPreferenceModel | null,
  outcome?: { sampleSize: number; similarity: number },
): number {
  // Skill match: check how many report keywords overlap with profile skills
  const profileSkillNames = new Set(profile.skills.map((s) => s.name.toLowerCase()));
  const keywordOverlap = (report.keywords ?? []).filter((k) =>
    profileSkillNames.has(k.toLowerCase()),
  ).length;
  const skillMatch = report.keywords?.length
    ? Math.min(100, Math.round((keywordOverlap / report.keywords.length) * 100))
    : 50;

  // Preference fit（Spec 29）：≥5 场面试样本时用真实反馈信号，否则保持 50
  let prefFit = 50;
  if (outcome && outcome.sampleSize >= 5) {
    prefFit = Math.max(20, Math.min(90, outcome.similarity));
  }

  // Competitiveness: based on overallScore
  const competitiveness = report.overallScore >= 4.5 ? 90
    : report.overallScore >= 4.0 ? 75
    : report.overallScore >= 3.5 ? 60
    : 40;

  // Profile signal
  const profileSignal = isPercentageScore(profile.marketFit.overallScore) && profile.marketFit.overallScore > 0
    ? profile.marketFit.overallScore
    : 50;

  const baseScore = Math.round(skillMatch * 0.4 + prefFit * 0.3 + competitiveness * 0.2 + profileSignal * 0.1);

  // V2.1: Preference bonus from learned feedback (backward compatible — 0 if no prefs)
  const prefBonus = prefs ? getPreferenceBonus(prefs, report.role, report.company) : 0;

  return Math.max(0, Math.min(100, baseScore + prefBonus));
}

function fallbackRecommend(
  reports: EvaluationReport[],
  goals: ZhiyuanProfile["goals"],
  limit: number,
): RecommendResult[] {
  // Sort by overallScore descending
  const sorted = [...reports].sort((a, b) => b.overallScore - a.overallScore);
  return sorted.slice(0, limit).map((r) => ({
    jdId: r.id ?? 0,
    company: r.company,
    role: r.role,
    matchScore: Math.round(r.overallScore * 20), // 5-point to 100 scale
    reasons: ["基础匹配（完成画像以获得个性化推荐）"],
    reportId: r.reportNum,
  }));
}

async function generateReasons(
  reports: EvaluationReport[],
  profile: ZhiyuanProfile,
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();

  if (reports.length === 0) return result;

  const profileSummary = `
技能：${profile.skills.map((s) => `${s.name}(熟练度${s.proficiency})`).join("、")}
偏好：${JSON.stringify(profile.preferences)}
目标：${profile.goals ? `${profile.goals.targetRoles.map((r) => `${r.role} ${r.level}`).join("、")}，薪资${profile.goals.salaryRange.min}K-${profile.goals.salaryRange.max}K` : "未设定"}
`.trim();

  const jdSummaries = reports
    .map(
      (r, i) => `[${i}] ${r.company} - ${r.role}，评分${r.overallScore}，关键词：${(r.keywords ?? []).join("、")}，${r.blocks?.a?.slice(0, 300) ?? ""}`,
    )
    .join("\n\n");

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY || "";
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages: [
          {
            role: "user",
            content: `你是一个求职推荐专家。基于求职者画像，为以下 JD 生成个性化推荐理由。

**求职者画像**：
${profileSummary}

**待推荐 JD**：
${jdSummaries}

请为每个 JD 生成 3-5 条个性化推荐理由，每条 15-30 字，引用画像中的具体数据点。格式为 JSON：
{
  "reasons": {
    "[JD索引]": ["理由1", "理由2", "理由3"]
  }
}
只返回 JSON，不要解释。`,
          },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      }),
    });

    if (!res.ok) return result;

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return result;

    const parsed = JSON.parse(jsonMatch[0]);
    const reasonMap = parsed.reasons || {};

    for (const [idx, reasons] of Object.entries(reasonMap)) {
      const reportIdx = parseInt(idx);
      const report = reports[reportIdx];
      if (report?.id && Array.isArray(reasons)) {
        result.set(report.id, reasons as string[]);
      }
    }
  } catch {
    // Silent fail — use default reasons
  }

  return result;
}
