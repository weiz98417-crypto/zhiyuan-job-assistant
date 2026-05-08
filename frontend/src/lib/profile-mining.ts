import db from "@/lib/db";
import type {
  ZhiyuanProfile,
  ProfileSkill,
  ProfilePreferences,
  ProfileMarketFit,
} from "@/types";

/* ── Statistical Extraction ── */

interface MiningStats {
  totalApplications: number;
  passRate: number;
  statusDistribution: Record<string, number>;
  avgScore: number;
  industryDistribution: Record<string, number>;
  companySizeHints: Record<string, number>;
  totalPracticeCount: number;
  practiceByCategory: Record<string, number>;
}

async function computeStats(): Promise<MiningStats> {
  const apps = await db.applications.toArray();
  const reports = await db.reports.toArray();
  const practices = await db.practiceRecords.toArray();

  const totalApplications = apps.length;
  const passed = apps.filter((a) => a.status === "interview" || a.status === "offer").length;
  const passRate = totalApplications > 0 ? Math.round((passed / totalApplications) * 100) : 0;

  const statusDistribution: Record<string, number> = {};
  for (const a of apps) {
    statusDistribution[a.status] = (statusDistribution[a.status] || 0) + 1;
  }

  const scored = reports.filter((r) => r.overallScore > 0);
  const avgScore =
    scored.length > 0
      ? Math.round((scored.reduce((s, r) => s + r.overallScore, 0) / scored.length) * 10) / 10
      : 0;

  // Industry from report archetypes
  const industryDistribution: Record<string, number> = {};
  for (const r of reports) {
    if (r.archetype) {
      industryDistribution[r.archetype] = (industryDistribution[r.archetype] || 0) + 1;
    }
  }

  // Company size hints from report blocks
  const companySizeHints: Record<string, number> = { large: 0, sme: 0, startup: 0 };
  for (const r of reports) {
    const text = Object.values(r.blocks || {}).join(" ").toLowerCase();
    if (text.includes("大厂") || text.includes("上市") || text.includes("千人")) companySizeHints.large++;
    else if (text.includes("初创") || text.includes("天使轮") || text.includes("a轮")) companySizeHints.startup++;
    else companySizeHints.sme++;
  }

  const totalPracticeCount = practices.length;
  const practiceByCategory: Record<string, number> = {};
  for (const p of practices) {
    const cat = p.questionCategory || "其他";
    practiceByCategory[cat] = (practiceByCategory[cat] || 0) + 1;
  }

  return {
    totalApplications,
    passRate,
    statusDistribution,
    avgScore,
    industryDistribution,
    companySizeHints,
    totalPracticeCount,
    practiceByCategory,
  };
}

/* ── Main Profile Generation ──
 * Now delegates to server-side /api/profile/analyze.
 * This function is kept as a convenience wrapper for frontend code.
 */

export async function generateProfile(options?: {
  force?: boolean;
}): Promise<ZhiyuanProfile> {
  const { syncProfileToCache } = await import("@/lib/profile-update");

  try {
    const res = await fetch("/api/profile/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: options?.force ?? false }),
    });

    const json = await res.json();
    if (json.success && json.data) {
      await syncProfileToCache(json.data);
      const cached = await import("@/lib/profile-storage").then((m) => m.loadProfile());
      if (cached) return cached;
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: local stats-only profile
  const stats = await computeStats();
  return buildFallbackProfile(stats);
}

function buildFallbackProfile(stats: MiningStats): ZhiyuanProfile {
  const skills: ProfileSkill[] = [];
  if (stats.totalApplications > 0) {
    skills.push({ name: "求职活跃度", proficiency: Math.min(100, stats.totalApplications * 10), evidence: [`投递 ${stats.totalApplications} 个岗位`] });
  }
  if (stats.passRate > 0) {
    skills.push({ name: "简历转化率", proficiency: stats.passRate, evidence: [`通过率 ${stats.passRate}%`] });
  }
  if (stats.totalPracticeCount > 0) {
    skills.push({ name: "面试练习", proficiency: Math.min(100, stats.totalPracticeCount * 10), evidence: [`练习 ${stats.totalPracticeCount} 次`] });
  }

  const overallScore = stats.totalApplications > 0
    ? Math.round((stats.avgScore / 5) * 100)
    : 0;

  return {
    skills,
    preferences: {
      companySize: {
        startup: fraction(stats.companySizeHints.startup, stats.totalApplications),
        sme: fraction(stats.companySizeHints.sme, stats.totalApplications),
        large: fraction(stats.companySizeHints.large, stats.totalApplications),
      },
      industry: {},
      workStyle: {},
      salaryTarget: { min: 0, max: 0 },
    },
    marketFit: {
      overallScore,
      topArchetypes: Object.entries(stats.industryDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k),
      skillGaps: [],
    },
    history: [
      {
        timestamp: new Date().toISOString(),
        event: "统计画像生成（LLM 暂不可用）",
        changes: [
          `基于 ${stats.totalApplications} 条投递记录生成基础画像`,
          `竞争力分数: ${overallScore}`,
        ],
      },
    ],
    lastUpdated: new Date().toISOString(),
  };
}

function fraction(num: number, denom: number): number {
  return denom > 0 ? Math.round((num / denom) * 100) / 100 : 0;
}
