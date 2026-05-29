import type { ProfileSkill } from "@/types";

type SkillSource = NonNullable<ProfileSkill["source"]>;

export interface SkillClaimInput {
  skill?: string;
  name?: string;
  evidence?: string;
  confidence?: number;
  source?: SkillSource;
}

export interface NormalizedSkillClaim {
  skill: string;
  evidence: string;
  confidence: number;
  source: SkillSource;
}

const SKILL_ALIASES: Record<string, string> = {
  "js": "JavaScript",
  "javascript": "JavaScript",
  "ts": "TypeScript",
  "typescript": "TypeScript",
  "react": "React",
  "next": "Next.js",
  "nextjs": "Next.js",
  "next.js": "Next.js",
  "node": "Node.js",
  "nodejs": "Node.js",
  "python": "Python",
  "sql": "SQL",
  "api": "API 设计",
  "rest api": "API 设计",
  "graphql": "GraphQL",
  "rag": "RAG",
  "llm": "大模型应用",
  "prompt": "提示词工程",
  "prompt engineering": "提示词工程",
  "yolov8": "YOLOv8",
  "opencv": "OpenCV",
  "uat": "UAT 测试",
  "bi": "BI 分析",
  "power bi": "Power BI",
  "tableau": "Tableau",
  "figma": "Figma",
  "axure": "Axure",
  "jira": "Jira",
  "数据分析": "数据分析",
  "数据运营": "数据运营",
  "数据产品": "数据产品",
  "数据经营": "经营分析",
  "经营分析": "经营分析",
  "bi分析": "BI 分析",
  "bi 类项目": "BI 分析",
  "数据仓库": "数据仓库",
  "数仓": "数据仓库",
  "主数据": "主数据管理",
  "主数据管理": "主数据管理",
  "数据治理": "数据治理",
  "指标体系": "指标体系设计",
  "数据指标体系": "指标体系设计",
  "ab测试": "A/B 测试",
  "a/b测试": "A/B 测试",
  "用户研究": "用户研究",
  "需求分析": "需求分析",
  "产品设计": "产品设计",
  "产品策略": "产品策略",
  "项目管理": "项目管理",
  "敏捷": "敏捷协作",
  "scrum": "敏捷协作",
  "机器学习": "机器学习",
  "深度学习": "深度学习",
  "计算机视觉": "计算机视觉",
  "目标检测": "目标检测",
  "多模态": "多模态模型",
  "大模型": "大模型应用",
  "大模型应用": "大模型应用",
  "提示词工程": "提示词工程",
  "多智能体": "多智能体系统",
  "多智能体系统": "多智能体系统",
};

const GENERIC_SKILLS = new Set([
  "业务", "技术", "能力", "经验", "项目", "系统", "平台", "方案", "流程", "团队",
  "复杂系统", "协调能力", "沟通能力", "执行力", "学习能力", "创新思维", "问题解决能力",
  "良好的编程能力", "逻辑思维能力", "较强的问题解决能力和创新思维", "至少一种编程语言",
  "的技术方案", "如果是数据", "捞取等数据", "我们既是帮助模型", "不断提升数据",
]);

const NOISE_PATTERNS = [
  /^的/,
  /下午茶/,
  /带你直接进入/,
  /直接攻击团队/,
  /为什么欺骗我/,
  /请描述/,
  /整体流程/,
  /入职后如果/,
  /你会如何/,
  /作为.*你/,
  /问题[:：]/,
  /面试官/,
  /考察点/,
  /JD\s*关联/i,
  /简历关联/,
];

const JD_OR_REQUIREMENT_PATTERNS = [
  /岗位职责/,
  /职位描述/,
  /任职要求/,
  /岗位要求/,
  /工作内容/,
  /加分项/,
  /优先/,
  /至少\d*/,
  /其中至少/,
  /我们希望/,
  /你将/,
  /需要具备/,
  /要求.*经验/,
  /负责.*团队/,
  /负责过至少/,
  /过至少\d*/,
];

const EVIDENCE_OWNER_PATTERNS = [
  /我/,
  /本人/,
  /我的/,
  /自己/,
  /简历/,
  /曾经/,
  /曾/,
  /实习/,
  /工作中/,
  /项目中/,
];

const SELF_EVIDENCE_PATTERN =
  /(我|本人|我的|自己|曾经|曾|在.*项目|项目中|实习|工作中|负责|主导|参与|搭建|构建|设计|开发|落地|使用|熟悉|掌握|做过|负责过|主导过|参与过|简历)/;

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[“”"'`]/g, "")
    .replace(/^[,，。；;:：、\-—\s]+|[,，。；;:：、\-—\s]+$/g, "")
    .trim();
}

function canonicalSkillName(raw: string): string {
  const cleaned = cleanText(raw)
    .replace(/^(熟悉|掌握|理解|负责|主导|参与|协助|具备|拥有|有|会|做过)/, "")
    .replace(/(经验|能力|相关经验|项目经验)$/g, "")
    .trim();
  const lower = cleaned.toLowerCase().replace(/\s+/g, " ");
  return SKILL_ALIASES[lower] || SKILL_ALIASES[cleaned] || cleaned;
}

export function looksLikeProfileNoise(text: string): boolean {
  const cleaned = cleanText(text);
  if (!cleaned) return true;
  if (NOISE_PATTERNS.some((pattern) => pattern.test(cleaned))) return true;
  return false;
}

export function looksLikeRequirementText(text: string): boolean {
  const cleaned = cleanText(text);
  return JD_OR_REQUIREMENT_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export function hasSelfEvidence(text: string): boolean {
  return SELF_EVIDENCE_PATTERN.test(text);
}

function hasEvidenceOwner(text: string): boolean {
  return EVIDENCE_OWNER_PATTERNS.some((pattern) => pattern.test(text));
}

export function shouldCaptureProfileRawContext(content: string): boolean {
  const text = cleanText(content);
  if (text.length < 20 || text.length > 1200) return false;
  if (!hasSelfEvidence(text)) return false;
  if (looksLikeProfileNoise(text)) return false;
  if (looksLikeRequirementText(text) && !hasSelfEvidence(text)) return false;
  return true;
}

export function normalizeSkillClaim(input: SkillClaimInput, defaultSource: SkillSource = "auto"): NormalizedSkillClaim | null {
  const rawName = input.skill || input.name || "";
  const rawEvidence = input.evidence || "";
  const name = canonicalSkillName(rawName);
  const evidence = cleanText(rawEvidence);
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : 0.5;
  const source = input.source || defaultSource;

  if (source === "manual") {
    if (name.length < 2 || name.length > 30) return null;
    return { skill: name, evidence, confidence: Math.max(confidence, 0.9), source };
  }

  if (name.length < 2 || name.length > 24) return null;
  if (GENERIC_SKILLS.has(name) || GENERIC_SKILLS.has(rawName)) return null;
  if (looksLikeProfileNoise(name) || looksLikeProfileNoise(evidence || name)) return null;
  if (!hasEvidenceOwner(evidence)) return null;
  if (looksLikeRequirementText(evidence || name)) return null;

  const hasKnownAlias = Object.values(SKILL_ALIASES).includes(name);
  const hasTechShape = /[A-Za-z][A-Za-z0-9.+#/-]{1,}/.test(name);
  const hasSkillSuffix = /(分析|设计|治理|管理|测试|建模|开发|研究|运营|策略|工程|产品|架构|算法|模型|系统)$/.test(name);
  if (!hasKnownAlias && !hasTechShape && !hasSkillSuffix) return null;

  const evidenceBoost = hasSelfEvidence(evidence) ? 0.18 : 0;
  const finalConfidence = Math.max(confidence, hasKnownAlias ? 0.62 : 0.5) + evidenceBoost;
  if (finalConfidence < 0.6) return null;

  return {
    skill: name,
    evidence: evidence || `提及 ${name}`,
    confidence: Math.min(0.95, finalConfidence),
    source,
  };
}

export function sanitizeSkillClaims(claims: SkillClaimInput[], defaultSource: SkillSource = "auto"): NormalizedSkillClaim[] {
  const bySkill = new Map<string, NormalizedSkillClaim>();
  for (const claim of claims) {
    const normalized = normalizeSkillClaim(claim, defaultSource);
    if (!normalized) continue;
    const existing = bySkill.get(normalized.skill);
    if (!existing || normalized.confidence > existing.confidence) {
      bySkill.set(normalized.skill, normalized);
    }
  }
  return Array.from(bySkill.values()).sort((a, b) => b.confidence - a.confidence);
}

export function sanitizeProfileSkills(skills: ProfileSkill[], preserveManual = true): ProfileSkill[] {
  const bySkill = new Map<string, ProfileSkill>();
  for (const skill of skills || []) {
    const normalized = normalizeSkillClaim({
      name: skill.name,
      evidence: skill.evidence?.[0] || "",
      confidence: skill.source === "manual" ? 0.95 : Math.max(0.5, (skill.proficiency || 50) / 100),
      source: skill.source || "auto",
    });
    if (!normalized) {
      if (preserveManual && skill.source === "manual" && skill.name.trim()) {
        bySkill.set(skill.name.trim(), skill);
      }
      continue;
    }
    const evidence = Array.from(new Set((skill.evidence || []).map(cleanText).filter(Boolean))).slice(0, 4);
    const next: ProfileSkill = {
      ...skill,
      name: normalized.skill,
      proficiency: Math.max(0, Math.min(100, Math.round(skill.proficiency || normalized.confidence * 100))),
      evidence,
      source: skill.source || normalized.source,
    };
    const existing = bySkill.get(next.name);
    if (!existing || (next.proficiency || 0) > (existing.proficiency || 0)) {
      bySkill.set(next.name, next);
    }
  }
  return Array.from(bySkill.values()).slice(0, 12);
}

export function skillFromClaim(claim: NormalizedSkillClaim, existingEvidenceCount = 0): ProfileSkill {
  const evidenceCount = existingEvidenceCount + 1;
  const base = Math.round(claim.confidence * 70);
  const repetitionBonus = Math.min(18, (evidenceCount - 1) * 6);
  const selfBonus = hasSelfEvidence(claim.evidence) ? 8 : 0;
  return {
    name: claim.skill,
    proficiency: Math.max(45, Math.min(82, base + repetitionBonus + selfBonus)),
    evidence: [claim.evidence].filter(Boolean),
    source: claim.source,
  };
}
