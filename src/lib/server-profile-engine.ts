/* ── Server-side Profile Engine ──
 * Reads from SQLite, fuses three signal layers, calls LLM for inference.
 * This replaces the frontend profile-mining.ts which read from DexieDB.
 */

import { listApps, listReports, getProfile, getProfileGoals, querySignals } from "@/lib/server-db";
import type { ZhiyuanProfile, ProfileSkill, ProfilePreferences, ProfileMarketFit, SkillGapItem, ProfileHistoryEntry } from "@/types";
import fs from "fs";
import path from "path";

/* ── Types ── */

interface SignalSummary {
  rolePreferences: { role: string; confidence: number; reason: string }[];
  skillClaims: { skill: string; evidence: string }[];
  dealBreakers: string[];
  companyPrefs: { liked: string[]; disliked: string[] };
  salaryExpectations: { min: number; max: number } | null;
  rawContexts: string[];
}

interface SignalContent {
  role?: string;
  confidence?: number;
  reason?: string;
  skill?: string;
  evidence?: string;
  value?: string;
  liked?: string;
  disliked?: string;
  min?: number;
  max?: number;
}

interface LayerInput {
  layer1: Record<string, unknown>;       // profile.yml
  layer2: SignalSummary;                 // profile_signals
  layer3: {                              // behavioral stats
    totalApplications: number;
    passRate: number;
    avgScore: number;
    industryDistribution: Record<string, number>;
    companySizeHints: Record<string, number>;
    totalPractices: number;
  };
}

/* ── Signal Extraction ── */

function extractSignals(): SignalSummary {
  const signals = querySignals({ since: thirtyDaysAgo(), limit: 200 });

  const rolePreferences: SignalSummary["rolePreferences"] = [];
  const skillClaims: SignalSummary["skillClaims"] = [];
  const dealBreakers: string[] = [];
  const companyPrefs: SignalSummary["companyPrefs"] = { liked: [], disliked: [] };
  const rawContexts: string[] = [];
  let salaryMin = 0;
  let salaryMax = 0;

  for (const s of signals) {
    try {
      const raw = typeof s.content_json === "string" ? JSON.parse(s.content_json) : s.content_json;
      const content = raw as SignalContent & { text?: string };

      switch (s.signal_type) {
        case "role_preference":
          if (content.role) {
            rolePreferences.push({
              role: content.role,
              confidence: content.confidence || 0.5,
              reason: content.reason || "",
            });
          }
          break;
        case "skill_claim":
          if (content.skill) {
            skillClaims.push({ skill: content.skill, evidence: content.evidence || "" });
          }
          break;
        case "dealbreaker":
          if (content.value) dealBreakers.push(content.value);
          break;
        case "company_pref":
          if (content.liked) companyPrefs.liked.push(content.liked);
          if (content.disliked) companyPrefs.disliked.push(content.disliked);
          break;
        case "salary_expectation":
          if (content.min) salaryMin = content.min;
          if (content.max) salaryMax = content.max;
          break;
        case "raw_context":
          if (content.text) rawContexts.push(content.text);
          break;
      }
    } catch { /* skip malformed signals */ }
  }

  const salaryExpectations = salaryMin > 0 || salaryMax > 0 ? { min: salaryMin, max: salaryMax } : null;
  return { rolePreferences, skillClaims, dealBreakers, companyPrefs, salaryExpectations, rawContexts };
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

/* ── Layer 1: profile.yml ── */

function readProfileYml(): Record<string, unknown> {
  try {
    const ymlPath = path.join(process.cwd(), "config", "profile.yml");
    if (!fs.existsSync(ymlPath)) return {};
    const content = fs.readFileSync(ymlPath, "utf-8");
    // Simple extraction of key-value pairs
    const result: Record<string, unknown> = {};
    for (const line of content.split("\n")) {
      const m = line.match(/^(\w[\w_]*):\s*(.+)$/);
      if (m) {
        const val = m[2].trim().replace(/^['"]|['"]$/g, "");
        if (val) result[m[1]] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/* ── Layer 3: Behavioral Stats ── */

function computeBehavioralStats() {
  const apps = listApps();
  const reports = listReports();

  const totalApplications = apps.length;
  const passed = apps.filter((a) => a.status === "interview" || a.status === "offer").length;
  const passRate = totalApplications > 0 ? Math.round((passed / totalApplications) * 100) : 0;

  const scored = reports.filter((r) => r.overall_score > 0);
  const avgScore = scored.length > 0
    ? Math.round((scored.reduce((s, r) => s + r.overall_score, 0) / scored.length) * 10) / 10
    : 0;

  const industryDistribution: Record<string, number> = {};
  for (const r of reports) {
    if (r.archetype) {
      industryDistribution[r.archetype] = (industryDistribution[r.archetype] || 0) + 1;
    }
  }

  const companySizeHints: Record<string, number> = { large: 0, sme: 0, startup: 0 };
  for (const r of reports) {
    const text = (r.blocks_json || "").toLowerCase();
    if (text.includes("大厂") || text.includes("上市")) companySizeHints.large++;
    else if (text.includes("初创") || text.includes("天使")) companySizeHints.startup++;
    else companySizeHints.sme++;
  }

  return { totalApplications, passRate, avgScore, industryDistribution, companySizeHints, totalPractices: 0 };
}

/* ── LLM Inference ── */

function buildMiningPrompt(input: LayerInput): string {
  const l1 = input.layer1;
  const l2 = input.layer2;
  const l3 = input.layer3;

  // Raw contexts (regex didn't classify these — LLM does semantic extraction)
  const rawContextBlock = l2.rawContexts.length > 0
    ? `\n**原始对话片段（需要语义提取）**：\n${l2.rawContexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n请你从以上片段中识别出：角色/岗位、技能/能力、行业/领域、底线条件。没有把握请留空。`
    : "";

  return `你是一个职业分析专家。请根据以下三层数据融合生成用户求职画像。

**Layer 1 — 用户显式声明（最高优先级，不可被覆盖）**：
${JSON.stringify(l1, null, 2)}

**Layer 2 — 对话信号（中优先级，用户表达的偏好和技能）**：
- 角色偏好：${JSON.stringify(l2.rolePreferences)}
- 技能声明：${JSON.stringify(l2.skillClaims)}
- 底线：${JSON.stringify(l2.dealBreakers)}
- 公司偏好：${JSON.stringify(l2.companyPrefs)}
- 薪资期望：${JSON.stringify(l2.salaryExpectations)}${rawContextBlock}

**Layer 3 — 行为数据（最低优先级，统计推断）**：
- 总投递：${l3.totalApplications}，通过率：${l3.passRate}%，平均分：${l3.avgScore}
- 行业分布：${JSON.stringify(l3.industryDistribution)}
- 公司规模倾向：${JSON.stringify(l3.companySizeHints)}

请返回 JSON（只返回 JSON）：
{
  "skills": [{ "name": "技能名", "proficiency": 0-100, "evidence": ["证据"] }],
  "preferences": {
    "companySize": { "startup": 0-1, "sme": 0-1, "large": 0-1 },
    "industry": { "行业名": 0-1 },
    "workStyle": {},
    "salaryTarget": { "min": 数字K, "max": 数字K }
  },
  "marketFit": {
    "overallScore": 0-100,
    "topArchetypes": ["1-3个最适合的职业方向"],
    "skillGaps": [{ "skill": "缺失技能", "demand": 0-100, "myLevel": 0-100, "gap": 差值 }]
  }
}`;
}

async function callLLM(prompt: string): Promise<{
  skills: ProfileSkill[];
  preferences: ProfilePreferences;
  marketFit: ProfileMarketFit;
} | null> {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return null;

    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/* ── Signal Fusion Logic ── */

function fuseSkills(layer1Skills: ProfileSkill[], layer2SkillClaims: SignalSummary["skillClaims"], layer3Skills: ProfileSkill[]): ProfileSkill[] {
  const skillMap = new Map<string, ProfileSkill>();

  // Layer 3 (behavioral) — lowest priority, goes in first
  for (const s of layer3Skills) {
    skillMap.set(s.name, s);
  }

  // Layer 2 (signals) — medium priority, adds/overwrites
  for (const claim of layer2SkillClaims) {
    const existing = skillMap.get(claim.skill);
    if (existing) {
      if (!existing.evidence.includes(claim.evidence)) {
        existing.evidence.push(claim.evidence);
      }
    } else {
      skillMap.set(claim.skill, {
        name: claim.skill,
        proficiency: 50,
        evidence: [claim.evidence],
      });
    }
  }

  // Layer 1 (declared) — highest priority, overwrites
  for (const s of layer1Skills) {
    skillMap.set(s.name, s);
  }

  return Array.from(skillMap.values());
}

function fusePreferences(layer2Preferences: ProfilePreferences, layer3Preferences: ProfilePreferences): ProfilePreferences {
  return {
    companySize: {
      startup: layer2Preferences.companySize.startup || layer3Preferences.companySize.startup,
      sme: layer2Preferences.companySize.sme || layer3Preferences.companySize.sme,
      large: layer2Preferences.companySize.large || layer3Preferences.companySize.large,
    },
    industry: { ...layer3Preferences.industry, ...layer2Preferences.industry },
    workStyle: { ...layer3Preferences.workStyle, ...layer2Preferences.workStyle },
    salaryTarget: layer2Preferences.salaryTarget.max > 0 ? layer2Preferences.salaryTarget : layer3Preferences.salaryTarget,
  };
}

/* ── Main Engine ── */

export interface EngineOptions {
  force?: boolean;
}

export async function runProfileEngine(options: EngineOptions = {}): Promise<ZhiyuanProfile> {
  // Gather three layers
  const layer1 = readProfileYml();
  const layer2 = extractSignals();
  const layer3 = computeBehavioralStats();

  // Build LLM prompt
  const prompt = buildMiningPrompt({ layer1, layer2, layer3 });
  const llmResult = await callLLM(prompt);

  if (!llmResult) {
    return buildFallbackProfile(layer2, layer3);
  }

  // Load existing profile to respect locked fields
  const existingRow = getProfile();
  const existingData = existingRow ? JSON.parse(existingRow.data_json || "{}") : {};
  const existingSkills: ProfileSkill[] = existingData.skills || [];
  // Fuse skills — skip locked skills during merge
  const l1Skills: ProfileSkill[] = [];
  const l3Skills: ProfileSkill[] = layer3.totalApplications > 0
    ? [{ name: "求职活跃度", proficiency: Math.min(100, layer3.totalApplications * 10), evidence: [`投递 ${layer3.totalApplications} 个岗位`] }]
    : [];

  const fusedSkills = fuseSkills(l1Skills, layer2.skillClaims, [...llmResult.skills, ...l3Skills]);

  // Preserve locked skills from existing profile
  for (const locked of existingSkills.filter((s: ProfileSkill) => s.source === "manual")) {
    const idx = fusedSkills.findIndex((ns) => ns.name === locked.name);
    if (idx >= 0) {
      fusedSkills[idx] = locked; // Keep locked version
    } else {
      fusedSkills.push(locked); // Re-add locked skill that LLM removed
    }
  }

  // Fuse preferences
  const fusedPreferences = fusePreferences(llmResult.preferences, {
    companySize: {
      startup: fraction(layer3.companySizeHints.startup, layer3.totalApplications),
      sme: fraction(layer3.companySizeHints.sme, layer3.totalApplications),
      large: fraction(layer3.companySizeHints.large, layer3.totalApplications),
    },
    industry: {},
    workStyle: {},
    salaryTarget: { min: 0, max: 0 },
  });

  const historyEntries: ProfileHistoryEntry[] = [{
    timestamp: new Date().toISOString(),
    event: "Profile Engine 分析完成",
    changes: [
      `识别 ${fusedSkills.length} 项技能`,
      `竞争力分数: ${llmResult.marketFit.overallScore}`,
      `${llmResult.marketFit.skillGaps.length > 0 ? `发现 ${llmResult.marketFit.skillGaps.length} 项技能缺口` : ""}`,
    ].filter(Boolean),
  }];

  return {
    skills: fusedSkills,
    preferences: fusedPreferences,
    marketFit: llmResult.marketFit,
    history: historyEntries,
    lastUpdated: new Date().toISOString(),
  };
}

function buildFallbackProfile(layer2: SignalSummary, stats: ReturnType<typeof computeBehavioralStats>): ZhiyuanProfile {
  const skills: ProfileSkill[] = [];

  // Include signal-derived skills even without LLM
  for (const claim of layer2.skillClaims) {
    skills.push({
      name: claim.skill,
      proficiency: 50,
      evidence: [claim.evidence],
      source: "auto",
    });
  }

  // Layer 2 role preferences → add as skill context
  for (const rp of layer2.rolePreferences) {
    const exists = skills.find((s) => s.name === rp.role);
    if (!exists) {
      skills.push({
        name: rp.role,
        proficiency: Math.round(rp.confidence * 100),
        evidence: ["对话中提及"],
        source: "auto",
      });
    }
  }

  if (stats.totalApplications > 0) {
    skills.push({ name: "求职活跃度", proficiency: Math.min(100, stats.totalApplications * 10), evidence: [`投递 ${stats.totalApplications} 个岗位`], source: "inferred" });
  }
  if (stats.passRate > 0) {
    skills.push({ name: "简历转化率", proficiency: stats.passRate, evidence: [`通过率 ${stats.passRate}%`], source: "inferred" });
  }

  // Include signal-derived company preferences
  const industry: Record<string, number> = { ...Object.fromEntries(
    Object.entries(stats.industryDistribution).slice(0, 5).map(([k, v]) => [k, fraction(v, stats.totalApplications)])
  ) };

  return {
    skills,
    preferences: {
      companySize: {
        startup: fraction(stats.companySizeHints.startup, stats.totalApplications),
        sme: fraction(stats.companySizeHints.sme, stats.totalApplications),
        large: fraction(stats.companySizeHints.large, stats.totalApplications),
      },
      industry,
      workStyle: {},
      salaryTarget: layer2.salaryExpectations
        ? { min: layer2.salaryExpectations.min, max: layer2.salaryExpectations.max }
        : { min: 0, max: 0 },
    },
    marketFit: {
      overallScore: stats.totalApplications > 0 ? Math.round((stats.avgScore / 5) * 100) : 0,
      topArchetypes: Object.entries(stats.industryDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k),
      skillGaps: [],
    },
    history: [{
      timestamp: new Date().toISOString(),
      event: "统计画像生成（LLM 暂不可用）",
      changes: [
        `基于 ${stats.totalApplications} 条投递记录生成`,
        layer2.skillClaims.length > 0 ? `识别 ${layer2.skillClaims.length} 项对话技能` : "",
        layer2.rolePreferences.length > 0 ? `${layer2.rolePreferences.length} 个角色偏好` : "",
      ].filter(Boolean),
    }],
    lastUpdated: new Date().toISOString(),
  };
}

function fraction(num: number, denom: number): number {
  return denom > 0 ? Math.round((num / denom) * 100) / 100 : 0;
}
