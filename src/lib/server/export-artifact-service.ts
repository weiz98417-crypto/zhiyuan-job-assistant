import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { markdownToSafeHtml } from "@/lib/server-markdown";

export type ExportArtifactFormat = "md" | "html" | "txt" | "pdf";

export interface CreateExportArtifactInput {
  content: string;
  filename: string;
  format?: string;
}

export interface CreateBinaryExportArtifactInput {
  bytes: Buffer | Uint8Array;
  filename: string;
  format: "pdf";
  contentType: "application/pdf";
}

export interface ExportArtifactRecord {
  artifactId: string;
  userId: string;
  filename: string;
  format: ExportArtifactFormat;
  contentType: string;
  size: number;
  sha256: string;
  readBackVerified: boolean;
  downloadUrl: string;
  createdAt: string;
}

export interface ReadExportArtifactResult {
  record: ExportArtifactRecord;
  bytes: Buffer;
}

export async function createExportArtifact(
  principal: ExecutionPrincipal,
  input: CreateExportArtifactInput,
  options: { rootDir?: string } = {},
): Promise<ExportArtifactRecord> {
  const content = input.content;
  if (!content.trim()) throw new Error("content is required");
  const baseName = sanitizeFilename(input.filename);
  if (!baseName) throw new Error("filename is invalid");
  const format = normalizeFormat(input.format);
  const rendered = format === "html"
    ? wrapHtml(baseName, markdownToSafeHtml(content))
    : content;
  const bytes = Buffer.from(rendered, "utf8");
  const filename = `${baseName}.${format}`;
  return persistExportArtifact(principal, {
    bytes,
    filename,
    format,
    contentType: contentType(format),
  }, options);
}

export async function createBinaryExportArtifact(
  principal: ExecutionPrincipal,
  input: CreateBinaryExportArtifactInput,
  options: { rootDir?: string } = {},
): Promise<ExportArtifactRecord> {
  const bytes = Buffer.from(input.bytes);
  const filename = sanitizeFilename(input.filename);
  if (!filename) throw new Error("filename is invalid");
  if (bytes.length <= 4 || bytes.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Error("PDF artifact verification failed");
  }
  return persistExportArtifact(principal, {
    bytes,
    filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
    format: input.format,
    contentType: input.contentType,
  }, options);
}

async function persistExportArtifact(
  principal: ExecutionPrincipal,
  input: {
    bytes: Buffer;
    filename: string;
    format: ExportArtifactFormat;
    contentType: string;
  },
  options: { rootDir?: string },
): Promise<ExportArtifactRecord> {
  const artifactId = randomUUID();
  const rootDir = artifactRoot(options.rootDir);
  await mkdir(rootDir, { recursive: true });
  const record: ExportArtifactRecord = {
    artifactId,
    userId: principal.userId,
    filename: input.filename,
    format: input.format,
    contentType: input.contentType,
    size: input.bytes.length,
    sha256: hash(input.bytes),
    readBackVerified: false,
    downloadUrl: `/api/agent/artifacts/${artifactId}`,
    createdAt: new Date().toISOString(),
  };
  const contentPath = artifactContentPath(rootDir, artifactId, input.format);
  const metadataPath = artifactMetadataPath(rootDir, artifactId);
  const temporaryContent = `${contentPath}.tmp`;
  const temporaryMetadata = `${metadataPath}.tmp`;
  await writeFile(temporaryContent, input.bytes);
  await writeFile(temporaryMetadata, JSON.stringify(record), "utf8");
  await rename(temporaryContent, contentPath);
  await rename(temporaryMetadata, metadataPath);
  const readBack = await readExportArtifact(principal, artifactId, { rootDir });
  if (!readBack || readBack.record.sha256 !== hash(readBack.bytes) || readBack.bytes.length !== input.bytes.length) {
    throw new Error("export artifact read-back verification failed");
  }
  record.readBackVerified = true;
  await writeFile(metadataPath, JSON.stringify(record), "utf8");
  return record;
}

export async function readExportArtifact(
  principal: ExecutionPrincipal,
  artifactId: string,
  options: { rootDir?: string } = {},
): Promise<ReadExportArtifactResult | null> {
  if (!/^[a-f0-9-]{36}$/i.test(artifactId)) return null;
  const rootDir = artifactRoot(options.rootDir);
  try {
    const record = JSON.parse(await readFile(artifactMetadataPath(rootDir, artifactId), "utf8")) as ExportArtifactRecord;
    if (record.artifactId !== artifactId || record.userId !== principal.userId) return null;
    const bytes = await readFile(artifactContentPath(rootDir, artifactId, record.format));
    if (bytes.length !== record.size || hash(bytes) !== record.sha256) return null;
    return { record, bytes };
  } catch {
    return null;
  }
}

function artifactRoot(override?: string): string {
  return path.resolve(override || process.env.AGENT_ARTIFACT_DIR || path.join(process.cwd(), "data", "agent-artifacts"));
}

function artifactContentPath(rootDir: string, artifactId: string, format: ExportArtifactFormat): string {
  return path.join(rootDir, `${artifactId}.${format}`);
}

function artifactMetadataPath(rootDir: string, artifactId: string): string {
  return path.join(rootDir, `${artifactId}.json`);
}

function normalizeFormat(value?: string): ExportArtifactFormat {
  return value === "html" || value === "txt" ? value : "md";
}

function sanitizeFilename(value: string): string {
  return String(value || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\.\./g, "").trim().slice(0, 120);
}

function contentType(format: ExportArtifactFormat): string {
  if (format === "pdf") return "application/pdf";
  if (format === "html") return "text/html;charset=utf-8";
  if (format === "txt") return "text/plain;charset=utf-8";
  return "text/markdown;charset=utf-8";
}

function hash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wrapHtml(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
