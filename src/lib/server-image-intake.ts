import { buildOCRImageCandidates } from "@/lib/server-image-variants";
import { ZHIPU_API_URL, ZHIPU_VISION_MODEL } from "@/lib/zhipu";
import type { ImageDocumentType, ImageIntakeResult } from "@/lib/agent/image-intake";
import type { ImageCandidate } from "@/lib/server-image-variants";

type OCRQuality = NonNullable<ImageIntakeResult["quality"]>;

interface ParsedPayload {
  documentType?: string;
  confidence?: number | string;
  quality?: string;
  reason?: string;
  extractedText?: string;
  structured?: Record<string, unknown>;
  company?: string;
  role?: string;
  location?: string;
  salary?: string;
  body?: string;
  offerText?: string;
  summary?: string;
  experience?: string;
  projects?: string;
  skills?: unknown;
  education?: string;
  resumeText?: string;
  isJD?: boolean;
}

interface CandidateResult {
  documentType: ImageDocumentType;
  confidence: number;
  quality: OCRQuality;
  reason?: string;
  extractedText: string;
  structured?: Record<string, unknown>;
  candidateLabel: string;
}

interface ScanOptions {
  userText?: string;
  preferredDocumentType?: ImageDocumentType;
}

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const CANDIDATE_TIMEOUT_MS = 30_000;

function clampConfidence(value: unknown, fallback = 0.65): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeQuality(value: unknown): OCRQuality {
  if (value === "clear" || value === "thumbnail" || value === "blurred" || value === "unreadable") return value;
  return "unknown";
}

function normalizeDocumentType(value: unknown, fallbackText = ""): ImageDocumentType {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw && /offer|录取|薪资包|offer/.test(fallbackText)) return "offer";
  if (!raw && /简历|履历|resume|cv/.test(fallbackText)) return "resume";
  if (!raw && /jd|职位|岗位|招聘|职位描述/.test(fallbackText)) return "jd";

  if (["jd", "job", "job_description", "job-posting", "jobposting", "position"].includes(raw)) return "jd";
  if (["offer", "salary_offer", "compensation", "comp"].includes(raw)) return "offer";
  if (["resume", "cv", "cv_resume", "profile"].includes(raw)) return "resume";
  if (["chat", "chat_screenshot", "conversation", "screenshot"].includes(raw)) return "chat_screenshot";
  return "unknown";
}

function normalizeStructured(type: ImageDocumentType, payload: ParsedPayload): Record<string, unknown> | undefined {
  const structured = payload.structured && typeof payload.structured === "object"
    ? { ...payload.structured }
    : {};

  if (type === "jd") {
    return {
      company: payload.company || structured.company || "",
      role: payload.role || structured.role || "",
      location: payload.location || structured.location || "",
      salary: payload.salary || structured.salary || "",
      skills: Array.isArray(structured.skills) ? structured.skills : payload.skills || [],
      body: payload.body || payload.extractedText || structured.body || "",
      isJD: true,
    };
  }

  if (type === "offer") {
    return {
      company: payload.company || structured.company || "",
      role: payload.role || structured.role || "",
      location: payload.location || structured.location || "",
      monthlySalary: structured.monthlySalary ?? "",
      monthsPerYear: structured.monthsPerYear ?? "",
      annualBonus: structured.annualBonus ?? "",
      hasSocialInsurance: structured.hasSocialInsurance ?? "",
      housingFundRate: structured.housingFundRate ?? "",
      probationMonths: structured.probationMonths ?? "",
      otherBenefits: structured.otherBenefits ?? "",
      options: structured.options ?? "",
      employmentForm: structured.employmentForm ?? "",
      employerName: structured.employerName ?? "",
      contractMonths: structured.contractMonths ?? "",
      overtimePolicy: structured.overtimePolicy ?? "",
      bonusGuarantee: structured.bonusGuarantee ?? "",
      equityType: structured.equityType ?? "",
      equityVesting: structured.equityVesting ?? "",
      commuteMinutes: structured.commuteMinutes ?? "",
      cityCostLevel: structured.cityCostLevel ?? "",
      jobNature: structured.jobNature ?? "",
      offerText: payload.offerText || payload.extractedText || structured.offerText || "",
    };
  }

  if (type === "resume") {
    return {
      summary: payload.summary || structured.summary || "",
      experience: payload.experience || structured.experience || "",
      projects: payload.projects || structured.projects || "",
      skills: structured.skills || payload.skills || "",
      education: payload.education || structured.education || "",
      resumeText: payload.extractedText || structured.resumeText || "",
    };
  }

  if (type === "chat_screenshot") {
    return {
      summary: payload.summary || structured.summary || "",
      transcriptText: payload.extractedText || structured.transcriptText || "",
    };
  }

  return Object.keys(structured).length > 0 ? structured : undefined;
}

function parsePayload(content: string): ParsedPayload | null {
  const candidates = [
    content.trim(),
    content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim(),
    content.match(/\{[\s\S]*\}/)?.[0]?.trim(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ParsedPayload;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function cleanText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.replace(/\u0000/g, "").replace(/【缺失】/g, "").trim();
}

function scoreCandidate(result: CandidateResult): number {
  const textBonus = Math.min(result.extractedText.length, 2400) / 2400;
  const qualityBonus =
    result.quality === "clear" ? 0.18 :
    result.quality === "thumbnail" ? 0.08 :
    result.quality === "blurred" ? -0.04 :
    result.quality === "unreadable" ? -0.18 : 0;
  const typeBonus = result.documentType === "unknown" ? -0.12 : 0.1;
  return result.confidence + textBonus * 0.2 + qualityBonus + typeBonus;
}

async function inspectCandidate(
  dataUri: string,
  userText: string,
  candidateLabel: string,
  preferredDocumentType?: ImageDocumentType,
): Promise<CandidateResult> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    return {
      documentType: "unknown",
      confidence: 0,
      quality: "unknown",
      reason: "ZHIPU_API_KEY not configured",
      extractedText: "",
      candidateLabel,
    };
  }

  const hintBlock = preferredDocumentType && preferredDocumentType !== "unknown"
    ? `\n- 用户意图偏向：${preferredDocumentType}`
    : "";

  const systemPrompt = `你是一个多模态文档识别与分流助手。
用户会上传一张图片，可能是 JD 截图、Offer 截图、简历、聊天截图或其他页面。
你的任务是：
1. 识别图片类型；
2. 尽可能完整提取图片中的原文；
3. 如果图片模糊、只是聊天缩略图、或无法判断，请明确给出 unknown。

返回严格 JSON，不要额外解释。

字段要求：
{
  "documentType": "jd" | "offer" | "resume" | "chat_screenshot" | "unknown",
  "confidence": 0到1之间的小数,
  "quality": "clear" | "thumbnail" | "blurred" | "unreadable" | "unknown",
  "reason": "一句话说明判断依据",
  "extractedText": "尽可能完整的原文，读不到则为空串",
  "structured": { ... }
}

structured 字段按类型填写：
- JD: company, role, location, salary, skills, body, isJD
- Offer: company, role, location, monthlySalary, monthsPerYear, annualBonus, hasSocialInsurance, housingFundRate, probationMonths, otherBenefits, options, employmentForm, employerName, contractMonths, overtimePolicy, bonusGuarantee, equityType, equityVesting, commuteMinutes, cityCostLevel, jobNature, offerText
- Resume: summary, experience, projects, skills, education, resumeText
- Chat screenshot: summary, transcriptText

规则：
- 用户文本只是上下文，不要只看文本下结论。
- 如果图片里的正文非常小、只是聊天界面里的缩略图、或者 OCR 读不清，quality 标成 thumbnail/blurred/unreadable。
- extractedText 要保留换行和原文，不要总结。
${hintBlock}`.trim();

  let response: Response;
  try {
    response = await fetch(ZHIPU_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ZHIPU_VISION_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUri } },
            {
              type: "text",
              text: `用户文本：${userText || "（空）"}\n请判断这张图是什么类型的文档，并提取原文。`,
            },
          ],
        },
      ],
      thinking: { type: "disabled" },
      temperature: 0.1,
      max_tokens: 2200,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(CANDIDATE_TIMEOUT_MS),
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR request failed";
    return {
      documentType: "unknown",
      confidence: 0,
      quality: "unknown",
      reason: `OCR request failed: ${message}`,
      extractedText: "",
      candidateLabel,
    };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    return {
      documentType: "unknown",
      confidence: 0,
      quality: "unknown",
      reason: `OCR API ${response.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`,
      extractedText: "",
      candidateLabel,
    };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return {
      documentType: "unknown",
      confidence: 0,
      quality: "unknown",
      reason: "Empty OCR response",
      extractedText: "",
      candidateLabel,
    };
  }

  const parsed = parsePayload(content);
  if (!parsed) {
    return {
      documentType: "unknown",
      confidence: 0,
      quality: "unknown",
      reason: "OCR 返回格式解析失败",
      extractedText: "",
      candidateLabel,
    };
  }

  const fallbackText = cleanText(parsed.extractedText || parsed.body || parsed.offerText || parsed.summary || "");
  const type = normalizeDocumentType(parsed.documentType ?? (parsed.isJD === false ? "unknown" : parsed.isJD ? "jd" : ""), fallbackText);
  const extractedText = cleanText(parsed.extractedText || parsed.body || parsed.offerText || parsed.resumeText || parsed.summary || parsed.experience || parsed.projects || "");
  const structured = normalizeStructured(type, parsed);
  const confidence = clampConfidence(parsed.confidence, extractedText ? 0.72 : 0.25);
  const quality = normalizeQuality(parsed.quality);

  return {
    documentType: type,
    confidence,
    quality,
    reason: parsed.reason || (type === "unknown" ? "图片内容不足以稳定分类" : ""),
    extractedText,
    structured,
    candidateLabel,
  };
}

async function inspectImage(
  dataUri: string,
  userText: string,
  preferredDocumentType?: ImageDocumentType,
): Promise<CandidateResult> {
  let candidates: ImageCandidate[] = [];
  try {
    candidates = await buildOCRImageCandidates(dataUri);
  } catch {
    candidates = [];
  }

  if (candidates.length === 0) {
    return {
      documentType: "unknown",
      confidence: 0,
      quality: "unknown",
      reason: "图片预处理失败",
      extractedText: "",
      candidateLabel: "原图",
    };
  }

  const results: CandidateResult[] = [];
  for (const candidate of candidates) {
    const result = await inspectCandidate(candidate.dataUri, userText, candidate.label, preferredDocumentType);
    results.push(result);
    if (
      result.documentType !== "unknown" &&
      result.quality === "clear" &&
      result.confidence >= 0.78 &&
      result.extractedText.length >= 80
    ) {
      break;
    }
  }

  const best = results
    .slice()
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] || results[0];

  return best;
}

function mergeStructured(results: CandidateResult[], documentType: ImageDocumentType): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};
  for (const result of results) {
    if (result.documentType !== documentType || !result.structured) continue;
    for (const [key, value] of Object.entries(result.structured)) {
      if (value === undefined || value === null || value === "") continue;
      if (merged[key] === undefined || merged[key] === "" || merged[key] === null) {
        merged[key] = value;
        continue;
      }
      if (Array.isArray(merged[key]) && Array.isArray(value)) {
        const combined = [...merged[key] as unknown[], ...value];
        merged[key] = Array.from(new Set(combined.filter(Boolean)));
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeText(results: CandidateResult[], documentType: ImageDocumentType): string {
  return results
    .filter((result) => result.documentType === documentType && result.extractedText.trim())
    .map((result) => result.extractedText.trim())
    .join("\n\n---\n\n")
    .trim();
}

function majorityType(results: CandidateResult[], preferredDocumentType?: ImageDocumentType): ImageDocumentType {
  const tally = new Map<ImageDocumentType, number>();
  for (const result of results) {
    if (result.documentType === "unknown") continue;
    const weight = Math.max(0, result.confidence);
    tally.set(result.documentType, (tally.get(result.documentType) || 0) + weight);
  }
  if (preferredDocumentType && preferredDocumentType !== "unknown" && tally.has(preferredDocumentType)) {
    return preferredDocumentType;
  }
  let winner: ImageDocumentType = "unknown";
  let score = 0;
  for (const [type, value] of tally.entries()) {
    if (value > score) {
      winner = type;
      score = value;
    }
  }
  return winner;
}

export async function inspectDocumentImages(
  images: string[],
  options: ScanOptions = {},
): Promise<ImageIntakeResult> {
  const userText = options.userText || "";
  const validImages = images
    .filter((src) => typeof src === "string" && src.startsWith("data:image/"))
    .slice(0, MAX_IMAGES);

  if (validImages.length === 0) {
    return {
      documentType: "unknown",
      confidence: 0,
      extractedText: "",
      reason: "没有可识别的图片输入",
      quality: "unknown",
      errors: ["missing images"],
      perImage: [],
    };
  }

  const perImage: NonNullable<ImageIntakeResult["perImage"]> = [];
  const candidateResults: CandidateResult[] = [];
  const errors: string[] = [];

  for (let i = 0; i < validImages.length; i++) {
    const image = validImages[i];
    const normalized = image.startsWith("data:image/") ? image : null;
    if (!normalized) {
      errors.push(`第 ${i + 1} 张：图片格式无效`);
      continue;
    }

    const estimatedSize = Math.ceil((normalized.slice(normalized.indexOf(",") + 1).length * 3) / 4);
    if (estimatedSize > MAX_IMAGE_SIZE) {
      errors.push(`第 ${i + 1} 张：图片超过 10MB`);
      continue;
    }

    const result = await inspectImage(normalized, userText, options.preferredDocumentType);
    candidateResults.push(result);
    perImage.push({
      index: i,
      documentType: result.documentType,
      confidence: result.confidence,
      extractedTextLength: result.extractedText.length,
      reason: result.reason,
      candidate: result.candidateLabel,
    });
  }

  if (candidateResults.length === 0) {
    return {
      documentType: "unknown",
      confidence: 0,
      extractedText: "",
      reason: "图片识别失败",
      quality: "unknown",
      errors,
      perImage,
    };
  }

  const documentType = majorityType(candidateResults, options.preferredDocumentType);
  const sameTypeResults = candidateResults.filter((result) => result.documentType === documentType);
  const best = sameTypeResults[0] || candidateResults.slice().sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
  const extractedText = documentType === "unknown"
    ? candidateResults
        .map((result) => result.extractedText.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join("\n\n---\n\n")
    : mergeText(candidateResults, documentType) || best.extractedText.trim();
  const structured = documentType === "unknown"
    ? best.structured
    : mergeStructured(candidateResults, documentType) || best.structured;
  const confidenceBase = sameTypeResults.length
    ? sameTypeResults.reduce((sum, item) => sum + item.confidence, 0) / sameTypeResults.length
    : best.confidence;

  return {
    documentType,
    confidence: Math.max(0, Math.min(1, confidenceBase)),
    extractedText,
    structured,
    reason: best.reason || (documentType === "unknown" ? "无法稳定识别图片类型" : ""),
    quality: best.quality,
    errors: errors.length ? errors : undefined,
    perImage,
  };
}

export function mapImageIntakeToJDLegacy(result: ImageIntakeResult): {
  company: string;
  role: string;
  location: string;
  salary: string;
  skills: string[];
  body: string;
  isJD: boolean;
  reason?: string;
} {
  const structured = (result.structured || {}) as Record<string, unknown>;
  const skills = Array.isArray(structured.skills)
    ? structured.skills.filter((item): item is string => typeof item === "string")
    : typeof structured.skills === "string"
      ? String(structured.skills).split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean)
      : [];

  return {
    company: String(structured.company || ""),
    role: String(structured.role || ""),
    location: String(structured.location || ""),
    salary: String(structured.salary || ""),
    skills,
    body: String(structured.body || result.extractedText || ""),
    isJD: result.documentType === "jd",
    reason: result.reason,
  };
}
