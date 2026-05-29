import { getProfile, listApps, listReports, querySignals } from "@/lib/server-db";
import type { ProfileMarketFit, ProfilePreferences, ProfileSkill, ZhiyuanProfile } from "@/types";
import fs from "fs";
import path from "path";
import {
  normalizeSkillClaim,
  sanitizeProfileSkills,
  sanitizeSkillClaims,
  skillFromClaim,
} from "@/lib/profile-skill-quality";

interface SignalSummary {
  rolePreferences: { role: string; confidence: number; reason: string }[];
  skillClaims: { skill: string; evidence: string; confidence: number }[];
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
  text?: string;
}

interface BehavioralStats {
  totalApplications: number;
  passRate: number;
  avgScore: number;
  industryDistribution: Record<string, number>;
  companySizeHints: Record<string, number>;
  totalPractices: number;
}

interface LLMProfileResult {
  skills: ProfileSkill[];
  preferences: ProfilePreferences;
  marketFit: ProfileMarketFit;
}

export interface EngineOptions {
  force?: boolean;
  userId?: string;
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function extractSignals(userId?: string): SignalSummary {
  const signals = querySignals({ since: thirtyDaysAgo(), limit: 300 }, userId);
  const rolePreferences: SignalSummary["rolePreferences"] = [];
  const skillClaims: SignalSummary["skillClaims"] = [];
  const dealBreakers: string[] = [];
  const companyPrefs: SignalSummary["companyPrefs"] = { liked: [], disliked: [] };
  const rawContexts: string[] = [];
  let salaryMin = 0;
  let salaryMax = 0;

  for (const signal of signals) {
    try {
      const content = (typeof signal.content_json === "string"
        ? JSON.parse(signal.content_json)
        : signal.content_json) as SignalContent;

      if (signal.signal_type === "role_preference" && content.role) {
        rolePreferences.push({
          role: content.role,
          confidence: content.confidence || 0.5,
          reason: content.reason || "",
        });
      }

      if (signal.signal_type === "skill_claim" && content.skill) {
        const normalized = normalizeSkillClaim({
          skill: content.skill,
          evidence: content.evidence || "",
          confidence: content.confidence,
          source: "auto",
        });
        if (normalized) {
          skillClaims.push({
            skill: normalized.skill,
            evidence: normalized.evidence,
            confidence: normalized.confidence,
          });
        }
      }

      if (signal.signal_type === "dealbreaker" && content.value) dealBreakers.push(content.value);
      if (signal.signal_type === "company_pref") {
        if (content.liked) companyPrefs.liked.push(content.liked);
        if (content.disliked) companyPrefs.disliked.push(content.disliked);
      }
      if (signal.signal_type === "salary_expectation") {
        if (content.min) salaryMin = content.min;
        if (content.max) salaryMax = content.max;
      }
      if (signal.signal_type === "raw_context" && content.text) {
        rawContexts.push(content.text.slice(0, 800));
      }
    } catch {
      // Skip malformed rows.
    }
  }

  return {
    rolePreferences,
    skillClaims,
    dealBreakers,
    companyPrefs,
    salaryExpectations: salaryMin > 0 || salaryMax > 0 ? { min: salaryMin, max: salaryMax } : null,
    rawContexts,
  };
}

function readProfileYml(): Record<string, unknown> {
  try {
    const ymlPath = path.join(process.cwd(), "config", "profile.yml");
    if (!fs.existsSync(ymlPath)) return {};
    const content = fs.readFileSync(ymlPath, "utf-8");
    const result: Record<string, unknown> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w[\w_]*):\s*(.+)$/);
      if (match) {
        const value = match[2].trim().replace(/^['"]|['"]$/g, "");
        if (value) result[match[1]] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function computeBehavioralStats(userId?: string): BehavioralStats {
  const apps = listApps(undefined, userId);
  const reports = listReports(userId);
  const totalApplications = apps.length;
  const passed = apps.filter((app) => app.status === "interview" || app.status === "offer").length;
  const scored = reports.filter((report) => report.overall_score > 0);

  const industryDistribution: Record<string, number> = {};
  for (const report of reports) {
    if (report.archetype) industryDistribution[report.archetype] = (industryDistribution[report.archetype] || 0) + 1;
  }

  const companySizeHints: Record<string, number> = { large: 0, sme: 0, startup: 0 };
  for (const report of reports) {
    const text = (report.blocks_json || "").toLowerCase();
    if (text.includes("大厂") || text.includes("上市")) companySizeHints.large++;
    else if (text.includes("初创") || text.includes("天使")) companySizeHints.startup++;
    else companySizeHints.sme++;
  }

  return {
    totalApplications,
    passRate: totalApplications > 0 ? Math.round((passed / totalApplications) * 100) : 0,
    avgScore: scored.length > 0
      ? Math.round((scored.reduce((sum, report) => sum + report.overall_score, 0) / scored.length) * 10) / 10
      : 0,
    industryDistribution,
    companySizeHints,
    totalPractices: 0,
  };
}

function buildMiningPrompt(input: {
  layer1: Record<string, unknown>;
  layer2: SignalSummary;
  layer3: BehavioralStats;
}): string {
  const { layer1, layer2, layer3 } = input;
  const rawBlock = layer2.rawContexts.length
    ? `\n原始对话片段：\n${layer2.rawContexts.map((text, index) => `${index + 1}. ${text}`).join("\n")}\n`
    : "";

  return `你是职业画像分析专家。请生成求职画像，只返回 JSON。

核心规则：
- skills 只能包含用户本人已经掌握、做过、负责过、项目中使用过的能力。
- 禁止把 JD 要求、面试题、招聘话术、模型建议、泛词、半截句、闲聊口语放入 skills。
- 每个 skill 必须有 evidence，evidence 必须能说明“用户本人”与该技能有关。
- 技能名要标准化，比如 "数据分析"、"RAG"、"产品设计"、"YOLOv8"。

显式资料：
${JSON.stringify(layer1, null, 2)}

对话信号：
- 角色偏好：${JSON.stringify(layer2.rolePreferences)}
- 高可信技能候选：${JSON.stringify(layer2.skillClaims)}
- 底线：${JSON.stringify(layer2.dealBreakers)}
- 公司偏好：${JSON.stringify(layer2.companyPrefs)}
- 薪资期望：${JSON.stringify(layer2.salaryExpectations)}
${rawBlock}

行为数据：
- 总投递：${layer3.totalApplications}
- 通过率：${layer3.passRate}%
- 平均评估分：${layer3.avgScore}
- 行业分布：${JSON.stringify(layer3.industryDistribution)}
- 公司规模倾向：${JSON.stringify(layer3.companySizeHints)}

返回 JSON：
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
    "topArchetypes": ["1-3个最适合方向"],
    "skillGaps": [{ "skill": "缺失技能", "demand": 0-100, "myLevel": 0-100, "gap": 0-100 }]
  }
}`;
}

async function callLLM(prompt: string): Promise<LLMProfileResult | null> {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return null;
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 3000,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as LLMProfileResult;
  } catch {
    return null;
  }
}

function fraction(num: number, denom: number): number {
  return denom > 0 ? Math.round((num / denom) * 100) / 100 : 0;
}

function emptyPreferences(): ProfilePreferences {
  return {
    companySize: { startup: 0, sme: 0, large: 0 },
    industry: {},
    workStyle: {},
    salaryTarget: { min: 0, max: 0 },
  };
}

function defaultMarketFit(stats: BehavioralStats): ProfileMarketFit {
  return {
    overallScore: stats.totalApplications > 0 ? Math.round((stats.avgScore / 5) * 100) : 0,
    topArchetypes: Object.entries(stats.industryDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name),
    skillGaps: [],
  };
}

function fusePreferences(layer2: SignalSummary, stats: BehavioralStats, llm?: ProfilePreferences): ProfilePreferences {
  const behavioral: ProfilePreferences = {
    companySize: {
      startup: fraction(stats.companySizeHints.startup, stats.totalApplications),
      sme: fraction(stats.companySizeHints.sme, stats.totalApplications),
      large: fraction(stats.companySizeHints.large, stats.totalApplications),
    },
    industry: Object.fromEntries(
      Object.entries(stats.industryDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, value]) => [key, fraction(value, stats.totalApplications)]),
    ),
    workStyle: {},
    salaryTarget: layer2.salaryExpectations || { min: 0, max: 0 },
  };

  if (!llm) return behavioral;
  return {
    companySize: {
      startup: llm.companySize?.startup || behavioral.companySize.startup,
      sme: llm.companySize?.sme || behavioral.companySize.sme,
      large: llm.companySize?.large || behavioral.companySize.large,
    },
    industry: { ...behavioral.industry, ...(llm.industry || {}) },
    workStyle: { ...behavioral.workStyle, ...(llm.workStyle || {}) },
    salaryTarget: llm.salaryTarget?.max > 0 ? llm.salaryTarget : behavioral.salaryTarget,
  };
}

function fuseSkills(input: {
  signalClaims: SignalSummary["skillClaims"];
  llmSkills: ProfileSkill[];
  existingSkills: ProfileSkill[];
}): ProfileSkill[] {
  const skillMap = new Map<string, ProfileSkill>();

  const llmSkills = sanitizeProfileSkills(
    (input.llmSkills || [])
      .filter((skill) => Array.isArray(skill.evidence) && skill.evidence.some(Boolean))
      .map((skill) => ({ ...skill, source: skill.source || "auto" })),
    false,
  );
  for (const skill of llmSkills) skillMap.set(skill.name, skill);

  const normalizedClaims = sanitizeSkillClaims(
    input.signalClaims.map((claim) => ({
      skill: claim.skill,
      evidence: claim.evidence,
      confidence: claim.confidence,
      source: "auto",
    })),
    "auto",
  );

  for (const claim of normalizedClaims) {
    const existing = skillMap.get(claim.skill);
    if (existing) {
      const evidence = Array.from(new Set([...(existing.evidence || []), claim.evidence].filter(Boolean))).slice(0, 4);
      skillMap.set(claim.skill, {
        ...existing,
        evidence,
        proficiency: Math.max(existing.proficiency || 0, skillFromClaim(claim, evidence.length).proficiency),
      });
    } else {
      skillMap.set(claim.skill, skillFromClaim(claim));
    }
  }

  for (const manual of input.existingSkills.filter((skill) => skill.source === "manual")) {
    const normalized = normalizeSkillClaim({
      name: manual.name,
      evidence: manual.evidence?.[0] || "",
      confidence: 0.95,
      source: "manual",
    });
    if (normalized) skillMap.set(normalized.skill, { ...manual, name: normalized.skill, source: "manual" });
  }

  return sanitizeProfileSkills(Array.from(skillMap.values()))
    .sort((a, b) => (b.proficiency || 0) - (a.proficiency || 0))
    .slice(0, 12);
}

export async function runProfileEngine(options: EngineOptions = {}): Promise<ZhiyuanProfile> {
  const layer1 = readProfileYml();
  const layer2 = extractSignals(options.userId);
  const layer3 = computeBehavioralStats(options.userId);
  const existingRow = getProfile(options.userId);
  const existingData = existingRow ? JSON.parse(existingRow.data_json || "{}") : {};
  const existingSkills: ProfileSkill[] = Array.isArray(existingData.skills) ? existingData.skills : [];

  const llmResult = await callLLM(buildMiningPrompt({ layer1, layer2, layer3 }));
  const skills = fuseSkills({
    signalClaims: layer2.skillClaims,
    llmSkills: llmResult?.skills || [],
    existingSkills,
  });

  const preferences = fusePreferences(layer2, layer3, llmResult?.preferences || emptyPreferences());
  const marketFit = llmResult?.marketFit || defaultMarketFit(layer3);
  const changes = [
    `识别 ${skills.length} 项高可信核心技能`,
    `过滤 JD/题干/聊天噪音后重建画像`,
    `竞争力分数 ${marketFit.overallScore}`,
  ];

  return {
    skills,
    preferences,
    marketFit,
    history: [{
      timestamp: new Date().toISOString(),
      event: llmResult ? "画像分析完成" : "画像分析完成（规则兜底）",
      changes,
    }],
    lastUpdated: new Date().toISOString(),
  };
}
