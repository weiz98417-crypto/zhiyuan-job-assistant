import { describe, expect, it, vi } from "vitest";
import {
  DocumentExtractionError,
  extractResumeDocument,
  type DocumentExtractionDeps,
} from "@/lib/server/document-extraction";

const resumeText = [
  "张三 产品经理 5年海外社交与AI应用经验",
  "曾负责求职助手、JD评估、简历解析和面试准备等产品模块。",
  "工作经历包含需求调研、MVE验证、agent编排、评分系统和安全治理。",
].join("\n");

function deps(overrides: Partial<DocumentExtractionDeps> = {}): DocumentExtractionDeps {
  return {
    extractPdfText: vi.fn(async () => resumeText),
    extractDocxText: vi.fn(async () => resumeText),
    runMinerU: vi.fn(async () => `${resumeText}\nMinerU OCR补全文本`),
    ...overrides,
  };
}

describe("resume document extraction boundary", () => {
  it("uses local PDF text extraction before MinerU when the PDF already has usable text", async () => {
    const runMinerU = vi.fn(async () => "should not be used");
    const result = await extractResumeDocument({
      buffer: Buffer.from("%PDF text resume"),
      filename: "resume.pdf",
      ext: "pdf",
      deps: deps({ runMinerU }),
    });

    expect(result.method).toBe("pdf_text");
    expect(result.text).toContain("求职助手");
    expect(runMinerU).not.toHaveBeenCalled();
  });

  it("falls back to MinerU when a PDF has no usable embedded text", async () => {
    const runMinerU = vi.fn(async () => `${resumeText}\n来自扫描件OCR`);
    const result = await extractResumeDocument({
      buffer: Buffer.from("%PDF scanned resume"),
      filename: "scan.pdf",
      ext: "pdf",
      deps: deps({
        extractPdfText: vi.fn(async () => "   "),
        runMinerU,
      }),
    });

    expect(result.method).toBe("mineru");
    expect(result.fallbackReason).toBe("document_text_empty");
    expect(result.text).toContain("扫描件OCR");
    expect(runMinerU).toHaveBeenCalledOnce();
  });

  it("maps MinerU timeout into a structured mineru_timeout error", async () => {
    const timeout = new Error("operation timed out");
    timeout.name = "TimeoutError";

    await expect(
      extractResumeDocument({
        buffer: Buffer.from("%PDF scanned resume"),
        filename: "scan.pdf",
        ext: "pdf",
        deps: deps({
          extractPdfText: vi.fn(async () => ""),
          runMinerU: vi.fn(async () => {
            throw timeout;
          }),
        }),
      }),
    ).rejects.toMatchObject({
      code: "mineru_timeout",
      status: 504,
    });
  });

  it("keeps DOCX on mammoth text extraction when mammoth returns usable text", async () => {
    const runMinerU = vi.fn(async () => "should not be used");
    const extractDocxText = vi.fn(async () => resumeText);

    const result = await extractResumeDocument({
      buffer: Buffer.from("docx bytes"),
      filename: "resume.docx",
      ext: "docx",
      deps: deps({ extractDocxText, runMinerU }),
    });

    expect(result.method).toBe("docx_text");
    expect(result.text).toContain("JD评估");
    expect(extractDocxText).toHaveBeenCalledOnce();
    expect(runMinerU).not.toHaveBeenCalled();
  });

  it("fails legacy .doc clearly when no local converter is configured", async () => {
    await expect(
      extractResumeDocument({
        buffer: Buffer.from("legacy doc bytes"),
        filename: "resume.doc",
        ext: "doc",
        deps: deps(),
      }),
    ).rejects.toBeInstanceOf(DocumentExtractionError);

    await expect(
      extractResumeDocument({
        buffer: Buffer.from("legacy doc bytes"),
        filename: "resume.doc",
        ext: "doc",
        deps: deps(),
      }),
    ).rejects.toMatchObject({
      code: "doc_conversion_unavailable",
    });
  });
});
