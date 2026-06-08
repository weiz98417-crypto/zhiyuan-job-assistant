import { routeImageIntake } from "@/lib/agent/image-intake-router";

export type ImageDocumentType =
  | "jd"
  | "offer"
  | "resume"
  | "chat_screenshot"
  | "unknown";

export interface ImageIntakeResult {
  documentType: ImageDocumentType;
  confidence: number;
  extractedText: string;
  structured?: Record<string, unknown>;
  reason?: string;
  quality?: "clear" | "thumbnail" | "blurred" | "unreadable" | "unknown";
  errors?: string[];
  perImage?: Array<{
    index: number;
    documentType: ImageDocumentType;
    confidence: number;
    extractedTextLength: number;
    reason?: string;
    candidate?: string;
  }>;
}

export interface ImageToolCallPlan {
  name: "evaluate_jd_full" | "evaluate_offer" | "save_reference_resume";
  params: Record<string, unknown>;
}

const JD_HINT_RE = /(JD|岗位|职位|职位描述|招聘|job description)/i;
const OFFER_HINT_RE = /(offer|录取|薪资包|薪资|待遇|谈判)/i;
const RESUME_HINT_RE = /(简历|履历|CV|resume)/i;
const SAVE_REFERENCE_RESUME_RE = /(保存|存|沉淀|加入|放到).{0,16}(优秀|参考|标杆|样例|范例).{0,16}(简历|履历|resume|cv)|(优秀|参考|标杆|样例|范例).{0,16}(简历|履历|resume|cv).{0,16}(保存|存|沉淀|加入|放到)/i;
const TEAM_SHARE_RE = /(团队|共享|局域网|大家|公共|共用|team|shared|lan)/i;
const ROLE_CATEGORY_RE = /(AI产品经理|AI运营|AI售前|数据产品经理|产品经理|大模型产品经理|Agent产品经理)/i;

function cleanExtractedText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.replace(/\u0000/g, "").trim();
}

function isAllowed(toolName: string, toolWhitelist?: string[]): boolean {
  return !toolWhitelist || toolWhitelist.includes(toolName);
}

function copyIfPresent(
  target: Record<string, unknown>,
  source: Record<string, unknown> | undefined,
  sourceKey: string,
  targetKey = sourceKey,
): void {
  const value = source?.[sourceKey];
  if (value === undefined || value === null || value === "") return;
  target[targetKey] = value;
}

export function resolveImageIntakeAgentId(
  userText: string,
  intake?: ImageIntakeResult | null,
  preferredDocumentType?: ImageDocumentType,
): "evaluate" | "offer" | "resume" | undefined {
  const decision = routeImageIntake(userText, intake ?? null);
  if (decision.route === "evaluate_jd") return "evaluate";
  if (decision.route === "evaluate_offer") return "offer";
  if (decision.route === "resume_preview") return "resume";

  if (!intake) {
    const effectiveType = preferredDocumentType ?? inferPreferredDocumentTypeFromText(userText);
    if (effectiveType === "jd") return "evaluate";
    if (effectiveType === "offer") return "offer";
    if (effectiveType === "resume") return "resume";
  }
  return undefined;
}

export function inferPreferredDocumentTypeFromText(text: string): ImageDocumentType | undefined {
  if (!text.trim()) return undefined;
  if (OFFER_HINT_RE.test(text)) return "offer";
  if (RESUME_HINT_RE.test(text)) return "resume";
  if (JD_HINT_RE.test(text)) return "jd";
  return undefined;
}

function isSaveReferenceResumeIntent(text: string): boolean {
  return SAVE_REFERENCE_RESUME_RE.test(text || "");
}

function inferRoleCategoryFromText(text: string, structured?: Record<string, unknown>): string {
  for (const key of ["roleCategory", "role_category", "targetRole", "role"]) {
    const value = structured?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return text.match(ROLE_CATEGORY_RE)?.[1] || "";
}

export function buildImageIntakeContext(intake: ImageIntakeResult): string {
  const extractedText = cleanExtractedText(intake.extractedText);
  const textPreview = extractedText
    ? extractedText.slice(0, 1200)
    : "";
  const structured = intake.structured && Object.keys(intake.structured).length
    ? JSON.stringify(intake.structured).slice(0, 1200)
    : "{}";

  return [
    "",
    "<!-- image_intake",
    `documentType=${intake.documentType}`,
    `confidence=${Math.round((intake.confidence || 0) * 100) / 100}`,
    `quality=${intake.quality || "unknown"}`,
    `reason=${(intake.reason || "").slice(0, 200)}`,
    `structured=${structured}`,
    textPreview ? `extractedText=${textPreview}` : "extractedText=",
    "-->",
  ].join("\n");
}

export function buildImageIntakeToolCall(
  userText: string,
  images: string[] | undefined,
  intake: ImageIntakeResult | null | undefined,
  toolWhitelist?: string[],
  preferredDocumentType?: ImageDocumentType,
): ImageToolCallPlan | null {
  const imageList = Array.isArray(images)
    ? images.filter((src) => typeof src === "string" && src.startsWith("data:image/"))
    : [];
  const extractedText = cleanExtractedText(intake?.extractedText);
  const structured = intake?.structured;

  let effectiveType: ImageDocumentType | undefined;
  if (intake) {
    const decision = routeImageIntake(userText, intake);
    const saveReferenceResume = decision.route === "resume_preview" && isSaveReferenceResumeIntent(userText);
    if (decision.route !== "evaluate_jd" && decision.route !== "evaluate_offer" && !saveReferenceResume) {
      return null;
    }
    effectiveType = decision.documentType;
  } else {
    effectiveType = preferredDocumentType ?? inferPreferredDocumentTypeFromText(userText);
  }
  if (!effectiveType || effectiveType === "unknown") return null;
  if (!extractedText && imageList.length === 0) return null;

  if (
    effectiveType === "resume" &&
    isSaveReferenceResumeIntent(userText) &&
    isAllowed("save_reference_resume", toolWhitelist)
  ) {
    const params: Record<string, unknown> = {
      resume_text: extractedText,
      role_category: inferRoleCategoryFromText(userText, structured),
      visibility: TEAM_SHARE_RE.test(userText) ? "team" : "private",
    };
    copyIfPresent(params, structured, "name");
    if (extractedText.length >= 80) {
      return { name: "save_reference_resume", params };
    }
  }

  if (effectiveType === "jd" && isAllowed("evaluate_jd_full", toolWhitelist)) {
    const params: Record<string, unknown> = {};
    if (extractedText.length >= 40) params.jd_text = extractedText;
    else if (imageList.length > 0) params.images = imageList;

    copyIfPresent(params, structured, "company", "target_company");
    copyIfPresent(params, structured, "target_company");

    if (params.jd_text || params.images) {
      return { name: "evaluate_jd_full", params };
    }
  }

  if (effectiveType === "offer" && isAllowed("evaluate_offer", toolWhitelist)) {
    const params: Record<string, unknown> = {};
    if (extractedText.length >= 10) params.offerText = extractedText;
    else if (imageList.length > 0) params.images = imageList;

    for (const key of [
      "company",
      "role",
      "location",
      "monthlySalary",
      "monthsPerYear",
      "annualBonus",
      "hasSocialInsurance",
      "housingFundRate",
      "probationMonths",
      "otherBenefits",
      "options",
      "employmentForm",
      "employerName",
      "contractMonths",
      "overtimePolicy",
      "bonusGuarantee",
      "equityType",
      "equityVesting",
      "commuteMinutes",
      "cityCostLevel",
      "jobNature",
      "startDate",
    ]) {
      copyIfPresent(params, structured, key);
    }

    if (params.offerText || params.images || params.company || params.role || params.monthlySalary) {
      return { name: "evaluate_offer", params };
    }
  }

  return null;
}
