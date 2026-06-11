import type { ProfileSkill } from "@/types";

type SkillSource = NonNullable<ProfileSkill["source"]>;

export type ProfileSignalCategory =
  | "hard_skill"
  | "soft_skill"
  | "domain"
  | "tool"
  | "method"
  | "project_experience"
  | "preference"
  | "goal"
  | "constraint";

export type ProfileSignalSourceType =
  | "resume"
  | "jd"
  | "offer"
  | "interview_answer"
  | "user_preference"
  | "ordinary_chat"
  | "agent_output"
  | "manual"
  | "unknown";

export type ProfileSignalStatus = "candidate" | "confirmed" | "rejected";

export const PROFILE_SIGNAL_CATEGORIES: ProfileSignalCategory[] = [
  "hard_skill",
  "soft_skill",
  "domain",
  "tool",
  "method",
  "project_experience",
  "preference",
  "goal",
  "constraint",
];

export const PROFILE_SIGNAL_SOURCE_WEIGHTS: Record<ProfileSignalSourceType, number> = {
  resume: 0.95,
  manual: 0.95,
  user_preference: 0.9,
  interview_answer: 0.75,
  offer: 0.65,
  ordinary_chat: 0.55,
  agent_output: 0.35,
  jd: 0.2,
  unknown: 0.45,
};

export const PROFILE_SIGNAL_MIN_EVIDENCE: Record<ProfileSignalCategory, number> = {
  hard_skill: 1,
  soft_skill: 2,
  domain: 1,
  tool: 1,
  method: 1,
  project_experience: 1,
  preference: 1,
  goal: 1,
  constraint: 1,
};

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

export interface ProfileSignalStorageInput {
  signal_type: string;
  content_json: Record<string, unknown>;
  source?: string;
  session_id?: string;
}

export interface ProfileSignalStorageDecision {
  accepted: boolean;
  rejectedReason?: string;
  signal?: {
    signal_type: string;
    content_json: Record<string, unknown>;
    source: string;
    session_id?: string;
  };
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
  "灵性", "带你直接进入", "协助创意团队", "请描述整体流程",
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
  /不少于\d*/,
  /\d+\s*年以上/,
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

const DEALBREAKER_DIRECT_TERMS = new Set([
  "996",
  "007",
  "大小周",
  "外包",
  "驻场",
  "派遣",
  "加班",
  "双休",
  "单休",
  "社保",
  "五险一金",
  "公积金",
  "年假",
  "远程",
  "在家办公",
  "补充医疗",
  "体检",
  "期权",
  "股票",
  "13薪",
  "14薪",
  "15薪",
  "16薪",
  "outsourcing",
  "contractor",
  "staffing",
  "vendor",
  "onsite",
  "remote",
  "relocation",
]);

const DEALBREAKER_NOISE_TERMS = new Set([
  "去寻",
  "先解",
  "野蛮",
  "拒绝",
  "不去",
  "不要",
  "不考虑",
  "不接受",
  "此Offer",
  "此 Offer",
]);

const DEALBREAKER_ACTION_NOISE_PATTERNS = [
  /拒绝此\s*Offer/i,
  /接受此\s*Offer/i,
  /点击|按钮|重新|上传|截图|识别|调用|工具|返回错误|拉取失败/,
];

const DEALBREAKER_PREFIX_PATTERN =
  /(?:不接受|不考虑|排斥|拒绝|不去|不要|坚决不|绝对不|必须|一定|得有|要有|需要|要求|只要)/;

const DEALBREAKER_CAREER_KEYWORDS =
  /(996|007|大小周|外包|驻场|派遣|加班|双休|单休|社保|五险|公积金|薪资|工资|降薪|年假|调休|远程|办公|通勤|城市|地点|出差|试用|合同|背调|裁员|公司|岗位|行业|职级|歧视|学历|年龄|绩效|KPI|OKR|画饼|PUA|违法|拖欠|报销|管理混乱|野蛮管理|outsourcing|contractor|staffing|vendor|onsite|remote|relocation|commute|salary|benefit)/i;

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[“”"'`]/g, "")
    .replace(/^[,，。；;:：、\-—\s]+|[,，。；;:：、\-—\s]+$/g, "")
    .trim();
}

function clamp01(value: unknown, fallback = 0.5): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, n));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? cleanText(value) : "";
}

function evidenceFromContent(content: Record<string, unknown>): string {
  return stringValue(content.evidence) || stringValue(content.quote) || stringValue(content.text);
}

function normalizeStatus(value: unknown): ProfileSignalStatus | null {
  if (value === "candidate" || value === "confirmed" || value === "rejected") return value;
  return null;
}

export function classifyProfileSignalSource(source?: string): ProfileSignalSourceType {
  const raw = (source || "").toLowerCase();
  if (raw.includes("resume") || raw.includes("cv") || raw.includes("简历")) return "resume";
  if (raw.includes("jd") || raw.includes("job")) return "jd";
  if (raw.includes("offer")) return "offer";
  if (raw.includes("interview") || raw.includes("面试")) return "interview_answer";
  if (raw.includes("manual") || raw.includes("user_confirmed")) return "manual";
  if (raw.includes("preference") || raw.includes("dingwei") || raw.includes("goal")) return "user_preference";
  if (raw.includes("agent") || raw.includes("tool")) return "agent_output";
  if (raw.includes("chat") || raw.includes("auto_scan")) return "ordinary_chat";
  return "unknown";
}

function inferSkillCategory(skill: string): ProfileSignalCategory {
  if (/[A-Za-z][A-Za-z0-9.+#/-]{1,}/.test(skill)) return "tool";
  if (/(行业|地产|建筑|金融|教育|医疗|游戏|电商|SaaS|B端|C端)/i.test(skill)) return "domain";
  if (/(分析|设计|治理|管理|测试|建模|开发|研究|运营|策略|工程|架构|算法|模型|系统)$/.test(skill)) return "method";
  return "hard_skill";
}

function inferCategory(signalType: string, content: Record<string, unknown>): ProfileSignalCategory {
  if (signalType === "skill_claim") return inferSkillCategory(stringValue(content.skill) || stringValue(content.name));
  if (signalType === "role_preference") return "goal";
  if (signalType === "dealbreaker") return "constraint";
  if (signalType === "company_pref" || signalType === "salary_expectation") return "preference";
  return "preference";
}

function defaultStatus(input: {
  explicitStatus: ProfileSignalStatus | null;
  sourceType: ProfileSignalSourceType;
  confidence: number;
}): ProfileSignalStatus {
  if (input.explicitStatus) return input.explicitStatus;
  if ((input.sourceType === "resume" || input.sourceType === "manual") && input.confidence >= 0.75) {
    return "confirmed";
  }
  return "candidate";
}

function baseSignalContent(input: {
  content: Record<string, unknown>;
  category: ProfileSignalCategory;
  sourceType: ProfileSignalSourceType;
  status: ProfileSignalStatus;
  confidence: number;
  evidence: string;
}): Record<string, unknown> {
  return {
    ...input.content,
    category: input.category,
    status: input.status,
    sourceType: input.sourceType,
    sourceWeight: PROFILE_SIGNAL_SOURCE_WEIGHTS[input.sourceType],
    confidence: Math.round(input.confidence * 100) / 100,
    evidence: input.evidence,
    evidenceCount: input.evidence ? 1 : 0,
    validatedAt: new Date().toISOString(),
  };
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

function cleanDealBreakerText(value: string): string {
  return cleanText(value)
    .replace(/[()[\]{}<>]/g, "")
    .replace(/[👉👈✅❌]/g, "")
    .replace(/\s*[,，、]\s*/g, "、")
    .replace(/^[。；;:：、\s]+|[。；;:：、\s]+$/g, "")
    .trim();
}

export function normalizeDealBreaker(value: unknown, evidence: unknown = value): string | null {
  const raw = typeof value === "string" ? cleanDealBreakerText(value) : "";
  const evidenceText = typeof evidence === "string" ? cleanDealBreakerText(evidence) : raw;
  const compactValue = raw.replace(/\s+/g, "");

  if (!raw || raw.length < 2 || raw.length > 60) return null;
  if (looksLikeProfileNoise(raw)) return null;
  if (DEALBREAKER_NOISE_TERMS.has(raw) || DEALBREAKER_NOISE_TERMS.has(compactValue)) return null;
  if (DEALBREAKER_ACTION_NOISE_PATTERNS.some((pattern) => pattern.test(raw) || pattern.test(evidenceText))) {
    return null;
  }
  if (/^[去先此那这请帮看发传点开关解][\u4e00-\u9fff]$/.test(raw)) return null;

  const direct = DEALBREAKER_DIRECT_TERMS.has(raw) || DEALBREAKER_DIRECT_TERMS.has(compactValue);
  const hasCareerKeyword = DEALBREAKER_CAREER_KEYWORDS.test(raw);
  const hasExplicitConstraint = DEALBREAKER_PREFIX_PATTERN.test(raw) || DEALBREAKER_PREFIX_PATTERN.test(evidenceText);

  if (/^[\u4e00-\u9fff]{2}$/.test(raw) && !direct) return null;
  if (!direct && !hasCareerKeyword) return null;
  if (!direct && !hasExplicitConstraint && raw.length < 4) return null;

  return raw;
}

export function sanitizeDealBreakers(values: unknown[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeDealBreaker(value);
    if (normalized) unique.add(normalized);
  }

  const sorted = Array.from(unique).sort((a, b) => b.length - a.length);
  const result: string[] = [];
  for (const value of sorted) {
    if (result.some((existing) => existing.includes(value))) continue;
    result.push(value);
  }
  return result;
}

export function normalizeProfileSignalForStorage(input: ProfileSignalStorageInput): ProfileSignalStorageDecision {
  const signalType = cleanText(input.signal_type || "");
  const source = input.source || "auto_scan";
  const sourceType = classifyProfileSignalSource(source);
  const content = input.content_json || {};
  const explicitStatus = normalizeStatus(content.status);
  const evidence = evidenceFromContent(content);
  const rawConfidence = clamp01(content.confidence, 0.5);
  const category = inferCategory(signalType, content);

  if (!signalType) return { accepted: false, rejectedReason: "missing_signal_type" };

  if (signalType === "skill_claim") {
    if (sourceType === "jd") {
      return { accepted: false, rejectedReason: "jd_requirement_is_not_user_skill" };
    }

    const normalized = normalizeSkillClaim({
      skill: stringValue(content.skill) || stringValue(content.name),
      evidence,
      confidence: rawConfidence,
      source: sourceType === "manual" ? "manual" : "auto",
    });

    if (!normalized) return { accepted: false, rejectedReason: "invalid_or_low_value_skill_claim" };

    const status = defaultStatus({
      explicitStatus,
      sourceType,
      confidence: normalized.confidence,
    });

    const normalizedContent = baseSignalContent({
      content: {
        ...content,
        skill: normalized.skill,
        evidence: normalized.evidence,
        confidence: normalized.confidence,
      },
      category: inferSkillCategory(normalized.skill),
      sourceType,
      status,
      confidence: normalized.confidence,
      evidence: normalized.evidence,
    });

    return {
      accepted: true,
      signal: {
        signal_type: signalType,
        content_json: normalizedContent,
        source,
        session_id: input.session_id,
      },
    };
  }

  if (signalType === "raw_context") {
    const text = stringValue(content.text);
    if (!shouldCaptureProfileRawContext(text)) {
      return { accepted: false, rejectedReason: "raw_context_not_user_owned" };
    }
    const status = defaultStatus({ explicitStatus, sourceType, confidence: rawConfidence });
    return {
      accepted: true,
      signal: {
        signal_type: signalType,
        content_json: baseSignalContent({
          content: { ...content, text },
          category,
          sourceType,
          status,
          confidence: rawConfidence,
          evidence: text,
        }),
        source,
        session_id: input.session_id,
      },
    };
  }

  if (signalType === "role_preference") {
    const role = stringValue(content.role);
    if (role.length < 2 || role.length > 40 || looksLikeProfileNoise(role)) {
      return { accepted: false, rejectedReason: "invalid_role_preference" };
    }
    const status = defaultStatus({ explicitStatus, sourceType, confidence: rawConfidence });
    return {
      accepted: true,
      signal: {
        signal_type: signalType,
        content_json: baseSignalContent({
          content: { ...content, role },
          category,
          sourceType,
          status,
          confidence: rawConfidence,
          evidence: evidence || role,
        }),
        source,
        session_id: input.session_id,
      },
    };
  }

  if (signalType === "dealbreaker") {
    const value = normalizeDealBreaker(content.value, evidence || content.value);
    if (!value) {
      return { accepted: false, rejectedReason: "invalid_constraint" };
    }
    const status = defaultStatus({ explicitStatus, sourceType, confidence: rawConfidence });
    return {
      accepted: true,
      signal: {
        signal_type: signalType,
        content_json: baseSignalContent({
          content: { ...content, value },
          category,
          sourceType,
          status,
          confidence: rawConfidence,
          evidence: evidence || value,
        }),
        source,
        session_id: input.session_id,
      },
    };
  }

  if (signalType === "company_pref") {
    const company = stringValue(content.company);
    if (company.length < 2 || company.length > 50 || looksLikeProfileNoise(company)) {
      return { accepted: false, rejectedReason: "invalid_company_preference" };
    }
    const status = defaultStatus({ explicitStatus, sourceType, confidence: rawConfidence });
    return {
      accepted: true,
      signal: {
        signal_type: signalType,
        content_json: baseSignalContent({
          content: { ...content, company },
          category,
          sourceType,
          status,
          confidence: rawConfidence,
          evidence: evidence || company,
        }),
        source,
        session_id: input.session_id,
      },
    };
  }

  if (signalType === "salary_expectation") {
    const min = Number(content.min || 0);
    const max = Number(content.max || 0);
    if (!Number.isFinite(min) || min < 1 || min > 300) {
      return { accepted: false, rejectedReason: "invalid_salary_expectation" };
    }
    const status = defaultStatus({ explicitStatus, sourceType, confidence: rawConfidence });
    return {
      accepted: true,
      signal: {
        signal_type: signalType,
        content_json: baseSignalContent({
          content: { ...content, min, max: Number.isFinite(max) && max > 0 ? max : min },
          category,
          sourceType,
          status,
          confidence: rawConfidence,
          evidence: evidence || `${min}K`,
        }),
        source,
        session_id: input.session_id,
      },
    };
  }

  return { accepted: false, rejectedReason: "unsupported_signal_type" };
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
    if (!existing) {
      bySkill.set(next.name, next);
      continue;
    }
    if (existing.source === "manual" && next.source !== "manual") {
      continue;
    }
    if (next.source === "manual" && existing.source !== "manual") {
      bySkill.set(next.name, next);
      continue;
    }
    if ((next.proficiency || 0) > (existing.proficiency || 0)) {
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
