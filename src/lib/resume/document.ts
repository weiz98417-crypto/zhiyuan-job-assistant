import { createHash, randomUUID } from "crypto";
import type { CVData, CVSection } from "@/types";

export const RESUME_SECTION_ORDER = ["summary", "experience", "projects", "education", "skills"] as const;
export type ResumeSectionId = (typeof RESUME_SECTION_ORDER)[number];
export type ResumeSections = Record<ResumeSectionId, string>;
export type ResumeDocumentStatus = "pending" | "active" | "archived";
export type ResumeIntegrityStatus = "valid" | "needs_review";

export interface ResumeTextChunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface ParsedResumeChunk extends ResumeTextChunk {
  sections: ResumeSections;
}

export interface ResumeIntegrityEvidence {
  status: ResumeIntegrityStatus;
  verificationMode: "source_text" | "model_reconstructed";
  warnings: string[];
  sourceLength: number;
  structuredLength: number;
  sourceHash: string;
  structuredHash: string;
  chunkCount: number;
  coveredSourceUnits: number;
  totalSourceUnits: number;
  coverageRatio: number;
  numericCoverageRatio: number;
  missingSourceUnits: string[];
}

export interface ResumeDocumentRecord {
  id: string;
  user_id?: string;
  version_id: string;
  label: string;
  status: ResumeDocumentStatus;
  source_type: string;
  source_artifact_id: string;
  content_hash: string;
  sections_json: string;
  integrity_json: string;
  created_at?: string;
  activated_at?: string | null;
  updated_at?: string;
}

export interface ResumeSourceArtifactRecord {
  id: string;
  user_id?: string;
  document_id: string;
  source_type: string;
  filename: string;
  mime_type: string;
  raw_text: string;
  original_base64: string;
  extraction_json: string;
  source_hash: string;
  created_at?: string;
}

export interface ResumeChunkRecord {
  id: string;
  user_id?: string;
  document_id: string;
  chunk_index: number;
  start_offset: number;
  end_offset: number;
  content: string;
  sections_json: string;
  content_hash: string;
  created_at?: string;
}

export interface ResumeDraftRecord {
  id: string;
  user_id?: string;
  document_id?: string | null;
  artifact_id: string;
  variant_id: string;
  title: string;
  status: "draft" | "selected" | "applied" | "discarded";
  base_version: string;
  base_hash: string;
  patches_json: string;
  content_json: string;
  integrity_json: string;
  created_at?: string;
  updated_at?: string;
}

export interface ResumeIntakeInput {
  document: ResumeDocumentRecord;
  artifact: ResumeSourceArtifactRecord;
  chunks: ResumeChunkRecord[];
  cvData: CVData;
  activate: boolean;
}

export interface ResumeDocumentProjection {
  versionId: string;
  sectionsJson: string;
  contentHash: string;
}

const SECTION_TITLES: Record<ResumeSectionId, string> = {
  summary: "个人概述",
  experience: "工作经历",
  projects: "项目经验",
  education: "教育背景",
  skills: "技能",
};

export function stableResumeHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function emptyResumeSections(): ResumeSections {
  return { summary: "", experience: "", projects: "", education: "", skills: "" };
}

export function normalizeResumeSections(input: Partial<Record<ResumeSectionId, string>>): ResumeSections {
  const sections = emptyResumeSections();
  for (const sectionId of RESUME_SECTION_ORDER) {
    sections[sectionId] = cleanText(input[sectionId] || "");
  }
  return sections;
}

export function resumeSectionsToText(sections: ResumeSections): string {
  return RESUME_SECTION_ORDER
    .filter((sectionId) => sections[sectionId].trim())
    .map((sectionId) => `【${SECTION_TITLES[sectionId]}】\n${sections[sectionId]}`)
    .join("\n\n");
}

export function resumeSectionsToCvSections(sections: ResumeSections): CVSection[] {
  return RESUME_SECTION_ORDER.map((sectionId) => ({
    id: sectionId,
    title: SECTION_TITLES[sectionId],
    content: sections[sectionId],
  }));
}

export function chunkResumeText(rawText: string, maxChars = 6000, overlapChars = 240): ResumeTextChunk[] {
  const text = cleanText(rawText);
  if (!text) return [];
  if (text.length <= maxChars) return [{ index: 0, start: 0, end: text.length, text }];

  const chunks: ResumeTextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(start + maxChars, text.length);
    let end = hardEnd;
    if (hardEnd < text.length) {
      const windowStart = Math.max(start + Math.floor(maxChars * 0.6), start);
      const boundary = Math.max(
        text.lastIndexOf("\n\n", hardEnd),
        text.lastIndexOf("\n", hardEnd),
        text.lastIndexOf("。", hardEnd),
      );
      if (boundary >= windowStart) end = boundary + (text[boundary] === "。" ? 1 : 0);
    }
    if (end <= start) end = hardEnd;
    chunks.push({ index: chunks.length, start, end, text: text.slice(start, end) });
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

export function mergeParsedResumeChunks(chunks: ParsedResumeChunk[]): ResumeSections {
  const merged = emptyResumeSections();
  for (const chunk of chunks.sort((left, right) => left.index - right.index)) {
    for (const sectionId of RESUME_SECTION_ORDER) {
      merged[sectionId] = mergeSectionText(merged[sectionId], chunk.sections[sectionId]);
    }
  }
  return normalizeResumeSections(merged);
}

export function buildResumeIntegrityEvidence(
  rawText: string,
  sections: ResumeSections,
  chunkCount: number,
  options: { verificationMode?: ResumeIntegrityEvidence["verificationMode"] } = {},
): ResumeIntegrityEvidence {
  const source = cleanText(rawText);
  const structured = resumeSectionsToText(sections);
  const sourceUnits = splitEvidenceUnits(source);
  const structuredComparable = normalizeComparable(structured);
  const covered = sourceUnits.filter((unit) => isUnitCovered(unit, structuredComparable));
  const sourceNumbers = Array.from(new Set(source.match(/\d+(?:[.,]\d+)?%?/g) || []));
  const coveredNumbers = sourceNumbers.filter((number) => structured.includes(number));
  const coverageRatio = sourceUnits.length ? covered.length / sourceUnits.length : structured.length > 0 ? 1 : 0;
  const numericCoverageRatio = sourceNumbers.length ? coveredNumbers.length / sourceNumbers.length : 1;
  const verificationMode = options.verificationMode || "source_text";
  const warnings = verificationMode === "model_reconstructed"
    ? ["图片识别没有独立 OCR 原文可交叉校验，必须由用户确认后才能激活。"]
    : [];
  const status: ResumeIntegrityStatus = verificationMode === "source_text" && structured.length > 0 && coverageRatio >= 0.98 && numericCoverageRatio === 1
    ? "valid"
    : "needs_review";

  return {
    status,
    verificationMode,
    warnings,
    sourceLength: source.length,
    structuredLength: structured.length,
    sourceHash: stableResumeHash(source),
    structuredHash: stableResumeHash(structured),
    chunkCount,
    coveredSourceUnits: covered.length,
    totalSourceUnits: sourceUnits.length,
    coverageRatio: Number(coverageRatio.toFixed(4)),
    numericCoverageRatio: Number(numericCoverageRatio.toFixed(4)),
    missingSourceUnits: sourceUnits.filter((unit) => !covered.includes(unit)),
  };
}

export function createResumeIntake(input: {
  userId: string;
  existingCvData: CVData;
  sections: ResumeSections;
  rawText: string;
  sourceType: string;
  filename?: string;
  mimeType?: string;
  originalBase64?: string;
  extraction?: unknown;
  chunks: ParsedResumeChunk[];
  integrity: ResumeIntegrityEvidence;
  label?: string;
}): ResumeIntakeInput {
  const now = new Date().toISOString();
  const documentId = `resume_${randomUUID()}`;
  const artifactId = `source_${randomUUID()}`;
  const versionId = nextVersionId(input.existingCvData);
  const activate = input.integrity.status === "valid";
  const version = {
    id: versionId,
    label: input.label || `导入版本 ${Object.keys(input.existingCvData.versions || {}).length + 1}`,
    createdAt: now,
    sections: resumeSectionsToCvSections(input.sections),
    source: "imported" as const,
    documentId,
    integrityStatus: input.integrity.status,
  };
  const cvData = cloneCvData(input.existingCvData);
  cvData.versions[versionId] = version;
  if (activate) cvData.activeVersion = versionId;

  const document: ResumeDocumentRecord = {
    id: documentId,
    version_id: versionId,
    label: version.label,
    status: activate ? "active" : "pending",
    source_type: input.sourceType,
    source_artifact_id: artifactId,
    content_hash: stableResumeHash(JSON.stringify(version.sections)),
    sections_json: JSON.stringify(version.sections),
    integrity_json: JSON.stringify(input.integrity),
    activated_at: activate ? now : null,
  };
  const artifact: ResumeSourceArtifactRecord = {
    id: artifactId,
    document_id: documentId,
    source_type: input.sourceType,
    filename: input.filename || "",
    mime_type: input.mimeType || "text/plain",
    raw_text: cleanText(input.rawText),
    original_base64: input.originalBase64 || "",
    extraction_json: JSON.stringify(input.extraction || {}),
    source_hash: input.integrity.sourceHash,
  };
  const chunkRecords = input.chunks.map((chunk) => ({
    id: `chunk_${randomUUID()}`,
    document_id: documentId,
    chunk_index: chunk.index,
    start_offset: chunk.start,
    end_offset: chunk.end,
    content: chunk.text,
    sections_json: JSON.stringify(resumeSectionsToCvSections(chunk.sections)),
    content_hash: stableResumeHash(chunk.text),
  }));
  return { document, artifact, chunks: chunkRecords, cvData, activate };
}

export function resumeDocumentProjectionFromCvData(value: unknown): ResumeDocumentProjection | null {
  const cvData = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const versionId = typeof cvData.activeVersion === "string" ? cvData.activeVersion : "";
  const versions = cvData.versions && typeof cvData.versions === "object" && !Array.isArray(cvData.versions)
    ? cvData.versions as Record<string, { sections?: unknown[] }>
    : {};
  const sections = versionId && Array.isArray(versions[versionId]?.sections) ? versions[versionId].sections! : null;
  if (!versionId || !sections) return null;
  const sectionsJson = JSON.stringify(sections);
  return { versionId, sectionsJson, contentHash: stableResumeHash(sectionsJson) };
}

export function invalidateResumeIntegrityEvidence(
  value: unknown,
  previousContentHash: string,
  currentContentHash: string,
): string {
  let evidence: Record<string, unknown> = {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) evidence = parsed as Record<string, unknown>;
  } catch { /* keep empty evidence */ }
  const warnings = Array.isArray(evidence.warnings)
    ? evidence.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const invalidationWarning = "简历内容已在摄取后修改，原完整性证据不再适用于当前正文。";
  return JSON.stringify({
    ...evidence,
    status: "needs_review",
    warnings: Array.from(new Set([...warnings, invalidationWarning])),
    invalidationReason: "content_changed_since_intake",
    evidenceContentHash: previousContentHash,
    currentContentHash,
    invalidatedAt: new Date().toISOString(),
  });
}

function nextVersionId(cvData: CVData): string {
  const max = Object.keys(cvData.versions || {})
    .map((key) => Number(key.replace(/^v/, "")))
    .filter(Number.isFinite)
    .reduce((current, value) => Math.max(current, value), 0);
  return `v${max + 1}`;
}

function cloneCvData(cvData: CVData): CVData {
  const versions = cvData?.versions && typeof cvData.versions === "object" ? cvData.versions : {};
  return JSON.parse(JSON.stringify({ activeVersion: cvData?.activeVersion || "", versions })) as CVData;
}

function mergeSectionText(existingValue: string, additionValue: string): string {
  const existing = cleanText(existingValue);
  const addition = cleanText(additionValue);
  if (!addition) return existing;
  if (!existing) return addition;
  const comparableExisting = normalizeComparable(existing);
  const comparableAddition = normalizeComparable(addition);
  if (comparableExisting.includes(comparableAddition)) return existing;
  if (comparableAddition.includes(comparableExisting)) return addition;

  const existingLines = existing.split("\n");
  const additionLines = addition.split("\n");
  let overlap = 0;
  const maxOverlap = Math.min(existingLines.length, additionLines.length, 12);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const tail = normalizeComparable(existingLines.slice(-size).join("\n"));
    const head = normalizeComparable(additionLines.slice(0, size).join("\n"));
    if (tail && tail === head) { overlap = size; break; }
  }
  const separator = overlap > 0 ? "\n" : "\n\n";
  return cleanText(`${existing}${separator}${additionLines.slice(overlap).join("\n")}`);
}

function splitEvidenceUnits(value: string): string[] {
  return value
    .split(/\n+|(?<=[。！？!?；;])\s*/)
    .map((unit) => cleanText(unit).replace(/^[-•*\d.、)）\s]+/, ""))
    .filter((unit) => unit.length >= 4);
}

function isUnitCovered(unit: string, structuredComparable: string): boolean {
  const comparable = normalizeComparable(unit);
  if (!comparable) return true;
  if (structuredComparable.includes(comparable)) return true;
  const tokens = comparable.match(/[a-z0-9%]+|[\u4e00-\u9fff]{2,}/g) || [];
  if (!tokens.length) return false;
  const covered = tokens.filter((token) => structuredComparable.includes(token));
  return covered.length / tokens.length >= 0.8;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function cleanText(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
