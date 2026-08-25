import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import {
  extractResumeDocument,
  type DocumentExtractionDiagnostics,
} from "@/lib/server/document-extraction";
import { getDataRepositories } from "@/lib/data-repositories";
import { llmRetry } from "@/lib/llm-retry";
import {
  buildResumeIntegrityEvidence,
  chunkResumeText,
  createResumeIntake,
  mergeParsedResumeChunks,
  normalizeResumeSections,
  resumeSectionsToText,
  stableResumeHash,
  type ParsedResumeChunk,
  type ResumeSections,
} from "@/lib/resume/document";
import { ZHIPU_API_URL, ZHIPU_VISION_MODEL } from "@/lib/zhipu";
import type { CVData } from "@/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface ResumeTextImportInput {
  text: string;
  source?: string;
  originalImages?: string[];
}

export interface ResumeDocumentImportInput {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}

export interface ResumeImportResult {
  sections: ResumeSections;
  extraction?: DocumentExtractionDiagnostics;
  integrity: ReturnType<typeof buildResumeIntegrityEvidence>;
  persisted: {
    documentId: string;
    versionId: string;
    status: string;
    cvData: CVData;
    readBackVerified: true;
    reconciled?: boolean;
  };
}

export class ResumeImportInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ResumeImportInputError";
    this.status = status;
  }
}

export async function importResumeTextForAgent(
  principal: ExecutionPrincipal,
  input: ResumeTextImportInput,
  options: { signal?: AbortSignal } = {},
): Promise<ResumeImportResult> {
  const rawText = String(input.text || "").trim();
  if (!rawText) throw new ResumeImportInputError("请提供简历文本内容");
  if (rawText.length > 200_000) throw new ResumeImportInputError("简历文本过长，请提供 20 万字符以内的内容");
  const originalImages = Array.isArray(input.originalImages)
    ? input.originalImages.filter((image) => typeof image === "string" && image.startsWith("data:image/")).slice(0, 5)
    : [];
  const verificationMode = /image|ocr|screenshot|截图|图片/i.test(String(input.source || ""))
    ? "model_reconstructed" as const
    : "source_text" as const;
  return importParsedResume(principal, {
    rawText,
    sourceType: String(input.source || "paste"),
    filename: originalImages.length ? "agent-chat-resume-images.json" : "",
    mimeType: originalImages.length ? "application/x-resume-image-set+json" : "text/plain",
    originalBase64: originalImages.length ? JSON.stringify(originalImages) : "",
    verificationMode,
  }, options.signal);
}

export async function importResumeDocumentForAgent(
  principal: ExecutionPrincipal,
  input: ResumeDocumentImportInput,
  options: { signal?: AbortSignal } = {},
): Promise<ResumeImportResult> {
  if (!input.buffer?.length) throw new ResumeImportInputError("未上传文件");
  if (input.buffer.length > MAX_FILE_SIZE) throw new ResumeImportInputError("文件大小不能超过 10MB");
  const extension = getExtension(input.filename);
  const mimeType = input.mimeType || `application/${extension}`;
  const originalBase64 = input.buffer.toString("base64");
  if (["pdf", "doc", "docx", "txt", "md"].includes(extension)) {
    const extraction = await extractResumeDocument({
      buffer: input.buffer,
      filename: input.filename,
      ext: extension,
    });
    if (!extraction.text.trim()) {
      throw new ResumeImportInputError("未能从文件中提取到可解析的简历文本", 422);
    }
    return importParsedResume(principal, {
      rawText: extraction.text,
      sourceType: "upload",
      filename: input.filename,
      mimeType,
      originalBase64,
      extraction: extraction.diagnostics,
      verificationMode: "source_text",
    }, options.signal);
  }
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    const imageMimeType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    const sections = await parseResumeImage(`data:${imageMimeType};base64,${originalBase64}`, options.signal);
    return importParsedResume(principal, {
      rawText: resumeSectionsToText(sections),
      sourceType: "upload",
      filename: input.filename,
      mimeType: imageMimeType,
      originalBase64,
      verificationMode: "model_reconstructed",
      sections,
    }, options.signal);
  }
  throw new ResumeImportInputError(`不支持的文件格式（${extension}）。支持：pdf / png / jpg / webp / doc / docx / txt / md`);
}

export async function parseResumeTextInChunks(
  rawText: string,
  signal?: AbortSignal,
): Promise<{ sections: ResumeSections; chunks: ParsedResumeChunk[] }> {
  const chunks = chunkResumeText(rawText);
  if (chunks.length === 0) throw new ResumeImportInputError("简历原文为空，无法解析");
  const parsedChunks: ParsedResumeChunk[] = [];
  for (const chunk of chunks) {
    signal?.throwIfAborted();
    parsedChunks.push({ ...chunk, sections: await parseResumeChunk(chunk.text, signal) });
  }
  return { sections: mergeParsedResumeChunks(parsedChunks), chunks: parsedChunks };
}

async function importParsedResume(
  principal: ExecutionPrincipal,
  input: {
    rawText: string;
    sourceType: string;
    filename: string;
    mimeType: string;
    originalBase64: string;
    verificationMode: "source_text" | "model_reconstructed";
    extraction?: DocumentExtractionDiagnostics;
    sections?: ResumeSections;
  },
  signal?: AbortSignal,
): Promise<ResumeImportResult> {
  signal?.throwIfAborted();
  const repositories = getDataRepositories();
  const rawText = normalizeSourceText(input.rawText);
  const sourceHash = stableResumeHash(rawText);
  for (const document of await repositories.resumeDocuments.list(principal.userId)) {
    const artifact = await repositories.resumeDocuments.getArtifact(document.id, principal.userId);
    if (artifact?.source_hash !== sourceHash) continue;
    const cvRow = await repositories.cv.get(principal.userId);
    return {
      sections: sectionsFromDocument(document.sections_json),
      extraction: input.extraction,
      integrity: parseIntegrity(document.integrity_json),
      persisted: {
        documentId: document.id,
        versionId: document.version_id,
        status: document.status,
        cvData: parseCvData(cvRow?.data_json),
        readBackVerified: true,
        reconciled: true,
      },
    };
  }

  const providedSections = input.sections ? normalizeResumeSections(input.sections) : null;
  const parsed = providedSections
    ? {
        sections: providedSections,
        chunks: chunkResumeText(rawText).map((chunk) => ({ ...chunk, sections: providedSections })),
      }
    : await parseResumeTextInChunks(rawText, signal);
  const integrity = buildResumeIntegrityEvidence(rawText, parsed.sections, parsed.chunks.length, {
    verificationMode: input.verificationMode,
  });
  const cvRow = await repositories.cv.get(principal.userId);
  const intake = createResumeIntake({
    userId: principal.userId,
    existingCvData: parseCvData(cvRow?.data_json),
    sections: parsed.sections,
    rawText,
    sourceType: input.sourceType,
    filename: input.filename,
    mimeType: input.mimeType,
    originalBase64: input.originalBase64,
    extraction: input.extraction,
    chunks: parsed.chunks,
    integrity,
  });
  const document = await repositories.resumeDocuments.createIntake(intake, principal.userId);
  const [documentReadBack, artifactReadBack, chunkReadBack, cvReadBack] = await Promise.all([
    repositories.resumeDocuments.get(document.id, principal.userId),
    repositories.resumeDocuments.getArtifact(document.id, principal.userId),
    repositories.resumeDocuments.listChunks(document.id, principal.userId),
    repositories.cv.get(principal.userId),
  ]);
  const cvData = parseCvData(cvReadBack?.data_json);
  if (
    !documentReadBack
    || artifactReadBack?.source_hash !== integrity.sourceHash
    || chunkReadBack.length !== parsed.chunks.length
    || !cvData.versions[document.version_id]
    || documentReadBack.content_hash !== document.content_hash
  ) {
    throw new Error("简历摄取完成后读回校验失败");
  }
  return {
    sections: parsed.sections,
    extraction: input.extraction,
    integrity,
    persisted: {
      documentId: document.id,
      versionId: document.version_id,
      status: document.status,
      cvData,
      readBackVerified: true,
    },
  };
}

async function parseResumeChunk(text: string, signal?: AbortSignal): Promise<ResumeSections> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
    model: process.env.DEEPSEEK_RESUME_PARSE_MODEL?.trim() || "deepseek-v4-flash",
    messages: [
      {
        role: "system",
        content: `你是精确的简历重新分栏器。逐字保留输入内容，不增不减不改，把内容归入 personal、summary、experience、projects、skills、education。具体项目块必须放入 projects，并保留公司/岗位/时间上下文。严格返回 JSON：{"personal":"","summary":"","experience":"","projects":"","skills":"","education":""}`,
      },
      { role: "user", content: text },
    ],
    temperature: 0,
    max_tokens: 16000,
    response_format: { type: "json_object" },
    retries: 2,
    fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
    signal,
    timeout: 120_000,
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseModelJson(payload.choices?.[0]?.message?.content || "{}");
  return normalizeResumeSections({
    summary: [formatField(parsed.personal), formatField(parsed.summary)].filter(Boolean).join("\n\n"),
    experience: formatField(parsed.experience),
    projects: formatField(parsed.projects),
    skills: formatField(parsed.skills),
    education: formatField(parsed.education),
  });
}

async function parseResumeImage(dataUri: string, signal?: AbortSignal): Promise<ResumeSections> {
  const apiKey = process.env.ZHIPU_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 ZHIPU_API_KEY");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("智谱识别超时")), 30_000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ZHIPU_VISION_MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUri } },
            { type: "text", text: "阅读这份简历图片，按 summary、experience、projects、skills、education 原样归类，缺失字段返回空字符串，只输出 JSON。" },
          ],
        }],
        max_tokens: 8000,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`智谱识别失败: ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseModelJson(payload.choices?.[0]?.message?.content || "{}");
    return normalizeResumeSections({
      summary: formatField(parsed.summary) || formatField(parsed.personal_info),
      experience: formatField(parsed.experience) || formatField(parsed.work_experience),
      projects: formatField(parsed.projects) || formatField(parsed.project_experience),
      skills: formatField(parsed.skills),
      education: formatField(parsed.education),
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abort);
  }
}

function formatField(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(formatField).filter(Boolean).join("\n\n");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(formatField).filter(Boolean).join("\n");
  }
  return value == null ? "" : String(value);
}

function parseModelJson(value: string): Record<string, unknown> {
  const normalized = value.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return parseObject(JSON.parse(normalized)); } catch {
    const match = normalized.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return parseObject(JSON.parse(match[0])); } catch { return {}; }
  }
}

function parseCvData(value: unknown): CVData {
  const parsed = parseObject(value);
  const versions = parseObject(parsed.versions) as CVData["versions"];
  return { activeVersion: String(parsed.activeVersion || "v1"), versions };
}

function sectionsFromDocument(value: unknown): ResumeSections {
  const result: Partial<ResumeSections> = {};
  for (const item of parseArray(value)) {
    const section = parseObject(item);
    const id = String(section.id || "") as keyof ResumeSections;
    if (id in normalizeResumeSections({})) result[id] = String(section.content || "");
  }
  return normalizeResumeSections(result);
}

function parseIntegrity(value: unknown): ReturnType<typeof buildResumeIntegrityEvidence> {
  return parseObject(value) as unknown as ReturnType<typeof buildResumeIntegrityEvidence>;
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function parseArray(value: unknown): unknown[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function normalizeSourceText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
