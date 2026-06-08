import type { ImageIntakeResult } from "@/lib/agent/image-intake";

export type ReferenceResumeSaveSource = "image" | "paste" | "file";

export interface PendingReferenceResumeSaveAction {
  type: "save_reference_resume";
  resumeText: string;
  source: ReferenceResumeSaveSource;
  sourceImageCount?: number;
  sourceFileName?: string;
  inferredName?: string;
  roleCategory?: string;
  visibility: "private" | "team";
  askedRoleCategoryAt?: string;
  createdAt: string;
}

export interface ReferenceResumeSaveSessionState {
  pending?: PendingReferenceResumeSaveAction;
}

export interface CompletedReferenceResumeSaveAction {
  resume_text: string;
  name?: string;
  role_category: string;
  visibility: "private" | "team";
}

const TEAM_SHARE_RE = /(团队|共享|局域网|大家|公共|共用|同事|team|shared|lan)/i;
const CANCEL_RE = /(取消|别存|不要存|算了|停止|cancel|stop)/i;
const SAVE_EXCELLENT_RESUME_RE =
  /(保存|存|沉淀|加入|放到).{0,16}(优秀|参考|标杆|样例|范例).{0,16}(简历|履历|resume|cv)|(优秀|参考|标杆|样例|范例).{0,16}(简历|履历|resume|cv).{0,16}(保存|存|沉淀|加入|放到)/i;
const RESUME_HINT_RE = /(简历|履历|resume|curriculum vitae|\bcv\b|教育经历|项目经历|工作经历|实习经历|专业技能|个人优势|求职意向|个人概述)/i;
const ROLE_ALIASES: Array<[RegExp, string]> = [
  [/(ai|人工智能|大模型|智能).{0,8}(产品|pm)|ai产品|aipm/i, "ai_product_manager"],
  [/(ai|人工智能|大模型|智能).{0,8}运营|ai运营|增长运营|用户运营/i, "ai_operations"],
  [/(ai|人工智能|大模型|智能).{0,8}(售前|解决方案)|ai售前|pre.?sales/i, "ai_presales"],
  [/数据产品|bi|business intelligence|数仓|数据经营|主数据/i, "data_product_manager"],
  [/产品经理|product manager|\bpm\b/i, "product_manager"],
  [/通用|general/i, "general"],
];
const CANONICAL_ROLE_CATEGORIES = new Set([
  "ai_product_manager",
  "ai_operations",
  "ai_presales",
  "data_product_manager",
  "product_manager",
  "general",
]);
const ROLE_PROMPT =
  "这份优秀简历要保存到哪个岗位方向？请直接回复一个方向，例如：AI产品经理、AI运营、AI售前、数据产品经理、产品经理。";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}

function normalizeSpecificRole(input: string, fallbackText = ""): string {
  const normalized = normalizeReferenceResumeRoleCategory(input, fallbackText);
  if (!CANONICAL_ROLE_CATEGORIES.has(normalized)) return "";
  return normalized && normalized !== "general" ? normalized : "";
}

function detectSaveExcellentResumeIntent(text: string): boolean {
  return SAVE_EXCELLENT_RESUME_RE.test(text || "");
}

function looksLikeResumeText(text: string): boolean {
  const normalized = cleanText(text);
  if (normalized.length < 120) return false;
  const hits = [
    /教育经历|education/i,
    /项目经历|projects?/i,
    /工作经历|experience|employment/i,
    /实习经历|intern/i,
    /专业技能|skills?/i,
    /个人优势|个人概述|summary|profile/i,
  ].filter((pattern) => pattern.test(normalized)).length;
  return hits >= 2 || (RESUME_HINT_RE.test(normalized) && normalized.length >= 300);
}

function normalizeReferenceResumeRoleCategory(input: string | undefined, fallbackText = ""): string {
  const raw = cleanText([input || "", fallbackText].filter(Boolean).join("\n"));
  for (const [pattern, role] of ROLE_ALIASES) {
    if (pattern.test(raw)) return role;
  }
  return "";
}

function inferName(text: string, structured?: Record<string, unknown>): string | undefined {
  for (const key of ["name", "candidateName", "candidate_name"]) {
    const value = structured?.[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 60);
  }
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return undefined;
  if (firstLine.length <= 30 && !/[：:]/.test(firstLine)) return firstLine;
  return undefined;
}

function inferRoleFromStructured(structured?: Record<string, unknown>): string {
  for (const key of ["roleCategory", "role_category", "targetRole", "target_role", "role"]) {
    const value = structured?.[key];
    if (typeof value === "string" && value.trim()) {
      const normalized = normalizeSpecificRole(value);
      if (normalized) return normalized;
    }
  }
  return "";
}

export function inferReferenceResumeVisibility(text: string): "private" | "team" {
  return TEAM_SHARE_RE.test(text || "") ? "team" : "private";
}

export function inferReferenceResumeRoleCategory(text: string, fallbackText = "", structured?: Record<string, unknown>): string {
  return inferRoleFromStructured(structured) || normalizeSpecificRole(text, fallbackText);
}

export function buildPendingReferenceResumeSave(input: {
  userText: string;
  resumeText: string;
  source: ReferenceResumeSaveSource;
  imageCount?: number;
  structured?: Record<string, unknown>;
  createdAt?: string;
}): PendingReferenceResumeSaveAction | null {
  const resumeText = cleanText(input.resumeText);
  if (!detectSaveExcellentResumeIntent(input.userText)) return null;
  if (!looksLikeResumeText(resumeText)) return null;

  return {
    type: "save_reference_resume",
    resumeText,
    source: input.source,
    sourceImageCount: input.imageCount,
    inferredName: inferName(resumeText, input.structured),
    roleCategory: inferReferenceResumeRoleCategory(input.userText, "", input.structured) || undefined,
    visibility: inferReferenceResumeVisibility(input.userText),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function buildPendingReferenceResumeSaveFromImage(
  userText: string,
  imageCount: number,
  intake?: ImageIntakeResult | null,
  createdAt?: string,
): PendingReferenceResumeSaveAction | null {
  if (intake?.documentType !== "resume") return null;
  return buildPendingReferenceResumeSave({
    userText,
    resumeText: intake.extractedText,
    source: "image",
    imageCount,
    structured: intake.structured,
    createdAt,
  });
}

export function buildReferenceResumeRoleQuestion(pending: PendingReferenceResumeSaveAction): string {
  const sourceText = pending.source === "image"
    ? `我已经从你上传的 ${pending.sourceImageCount || 1} 张简历截图里提取到了简历内容。`
    : "我已经拿到了这份简历内容。";
  const visibilityText = pending.visibility === "team"
    ? "你刚才提到了团队/局域网共享，保存后会按团队共享流程处理。"
    : "如果你没有特别说明，我会先按私有优秀简历保存。";
  return `${sourceText}\n\n${ROLE_PROMPT}\n\n${visibilityText}`;
}

export function completePendingReferenceResumeSave(
  pending: PendingReferenceResumeSaveAction,
  userText: string,
): CompletedReferenceResumeSaveAction | { cancelled: true } | null {
  if (isPendingReferenceResumeSaveCancelled(userText)) return { cancelled: true };
  const roleCategory = inferReferenceResumeRoleCategory(userText, "") || pending.roleCategory || "general";
  if (!roleCategory) return null;
  return {
    resume_text: pending.resumeText,
    name: pending.inferredName,
    role_category: roleCategory,
    visibility: inferReferenceResumeVisibility(userText) === "team" ? "team" : pending.visibility,
  };
}

export function isPendingReferenceResumeSaveCancelled(text: string): boolean {
  return CANCEL_RE.test(text || "");
}
