import { isGarbledText } from "@/lib/agent/loop/text-quality";
import { extractDocxText as defaultExtractDocxText } from "./docx-text";
import { runMinerU as defaultRunMinerU, getMinerUTimeoutMs } from "./mineru";
import { extractPdfText as defaultExtractPdfText, normalizeExtractedText } from "./pdf-text";
import {
  DocumentExtractionError,
  type DocumentExtractionDeps,
  type DocumentExtractionErrorCode,
  type DocumentExtractionResult,
  type LegacyDocConversionResult,
} from "./types";

const MIN_USABLE_TEXT_LENGTH = 40;

export interface ExtractResumeDocumentInput {
  buffer: Buffer;
  filename: string;
  ext?: string;
  deps?: DocumentExtractionDeps;
}

export async function extractResumeDocument(input: ExtractResumeDocumentInput): Promise<DocumentExtractionResult> {
  const ext = normalizeExt(input.ext || input.filename);
  const deps = input.deps || {};

  if (ext === "txt" || ext === "md") {
    const text = normalizeExtractedText(new TextDecoder().decode(input.buffer));
    ensureUsableText(text, ext, input.buffer.length);
    return result("text", text, ext, input.buffer.length, false);
  }

  if (ext === "pdf") {
    const extractPdfText = deps.extractPdfText || defaultExtractPdfText;
    const text = normalizeExtractedText(await extractPdfText(input.buffer).catch(() => ""));
    const unusableReason = getUnusableReason(text);
    if (!unusableReason) {
      return result("pdf_text", text, ext, input.buffer.length, false);
    }
    return extractViaMinerU(input, ext, unusableReason, deps);
  }

  if (ext === "docx") {
    const extractDocxText = deps.extractDocxText || defaultExtractDocxText;
    const text = normalizeExtractedText(await extractDocxText(input.buffer).catch(() => ""));
    const unusableReason = getUnusableReason(text);
    if (!unusableReason) {
      return result("docx_text", text, ext, input.buffer.length, false);
    }
    return extractViaMinerU(input, ext, unusableReason, deps);
  }

  if (ext === "doc") {
    const converted = await convertLegacyDocIfAvailable(input.buffer, input.filename, deps);
    if (!converted) {
      throw new DocumentExtractionError({
        code: "doc_conversion_unavailable",
        message: "Legacy .doc conversion is not configured",
        diagnostics: { fileType: ext, bytes: input.buffer.length, mineruUsed: false },
      });
    }
    const convertedResult = await extractResumeDocument({
      buffer: converted.buffer,
      filename: converted.filename,
      ext: converted.ext,
      deps,
    });
    return {
      ...convertedResult,
      method: "doc_conversion",
      diagnostics: {
        ...convertedResult.diagnostics,
        fileType: ext,
      },
    };
  }

  throw new DocumentExtractionError({
    code: "unsupported_file_type",
    message: `Unsupported document extension: ${ext || "unknown"}`,
    diagnostics: { fileType: ext, bytes: input.buffer.length, mineruUsed: false },
  });
}

async function extractViaMinerU(
  input: ExtractResumeDocumentInput,
  ext: string,
  fallbackReason: DocumentExtractionErrorCode,
  deps: DocumentExtractionDeps,
): Promise<DocumentExtractionResult> {
  const runMinerU = deps.runMinerU || defaultRunMinerU;
  try {
    const text = normalizeExtractedText(await runMinerU({
      buffer: input.buffer,
      filename: input.filename,
      ext,
      fallbackReason,
    }));
    ensureUsableText(text, ext, input.buffer.length, true, fallbackReason);
    return result("mineru", text, ext, input.buffer.length, true, fallbackReason);
  } catch (err) {
    if (err instanceof DocumentExtractionError) throw err;
    if (isTimeoutLike(err)) {
      throw new DocumentExtractionError({
        code: "mineru_timeout",
        message: "MinerU timed out",
        diagnostics: {
          fileType: ext,
          bytes: input.buffer.length,
          mineruUsed: true,
          fallbackReason,
          timeoutMs: getMinerUTimeoutMs(),
        },
        cause: err,
      });
    }
    throw new DocumentExtractionError({
      code: "mineru_failed",
      message: err instanceof Error ? err.message : "MinerU failed",
      diagnostics: { fileType: ext, bytes: input.buffer.length, mineruUsed: true, fallbackReason },
      cause: err,
    });
  }
}

async function convertLegacyDocIfAvailable(
  buffer: Buffer,
  filename: string,
  deps: DocumentExtractionDeps,
): Promise<LegacyDocConversionResult | null> {
  if (!deps.convertLegacyDoc) return null;
  return deps.convertLegacyDoc(buffer, filename);
}

function result(
  method: DocumentExtractionResult["method"],
  text: string,
  ext: string,
  bytes: number,
  mineruUsed: boolean,
  fallbackReason?: DocumentExtractionErrorCode,
): DocumentExtractionResult {
  return {
    text,
    method,
    warnings: fallbackReason ? [`fallback:${fallbackReason}`] : [],
    fallbackReason,
    diagnostics: {
      fileType: ext,
      bytes,
      textLength: text.length,
      mineruUsed,
      fallbackReason,
      timeoutMs: mineruUsed ? getMinerUTimeoutMs() : undefined,
    },
  };
}

function ensureUsableText(
  text: string,
  ext: string,
  bytes: number,
  mineruUsed = false,
  fallbackReason?: DocumentExtractionErrorCode,
): void {
  const reason = getUnusableReason(text);
  if (!reason) return;
  throw new DocumentExtractionError({
    code: reason,
    message: `Extracted text is not usable: ${reason}`,
    diagnostics: {
      fileType: ext,
      bytes,
      textLength: text.length,
      mineruUsed,
      fallbackReason,
    },
  });
}

function getUnusableReason(text: string): DocumentExtractionErrorCode | null {
  const trimmed = text.trim();
  if (trimmed.length < MIN_USABLE_TEXT_LENGTH) return "document_text_empty";
  if (isGarbledText(trimmed)) return "document_text_garbled";
  return null;
}

function normalizeExt(value: string): string {
  const suffix = value.includes(".") ? value.split(".").pop() : value;
  return (suffix || "").toLowerCase().replace(/^\./, "");
}

function isTimeoutLike(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || /timed?\s*out|timeout/i.test(err.message);
}
