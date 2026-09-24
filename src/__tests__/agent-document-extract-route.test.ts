import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  extractResumeDocument: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/document-extraction", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/document-extraction")>();
  return { ...original, extractResumeDocument: mocks.extractResumeDocument };
});

import { POST } from "@/app/api/agent/document-extract/route";
import { DocumentExtractionError } from "@/lib/server/document-extraction";

function pdfRequest(bytes = "%PDF-1.7 sample", type = "application/pdf"): Request {
  const formData = new FormData();
  formData.append("file", new File([bytes], "resume.pdf", { type }));
  return new Request("http://localhost/api/agent/document-extract", { method: "POST", body: formData });
}

describe("Agent read-only PDF extraction", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ userId: "test-user" });
    mocks.extractResumeDocument.mockReset().mockResolvedValue({
      text: "五年产品经理经验，负责 JD 分析及求职助手产品。",
      method: "pdf_text",
    });
  });

  it("extracts text for this turn without invoking a CV import", async () => {
    const response = await POST(pdfRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.text).toContain("产品经理");
    expect(mocks.extractResumeDocument).toHaveBeenCalledWith(expect.objectContaining({
      filename: "resume.pdf",
      ext: "pdf",
    }));
  });

  it("rejects a mislabeled document before extraction", async () => {
    const response = await POST(pdfRequest("not really a PDF"));

    expect(response.status).toBe(400);
    expect(mocks.extractResumeDocument).not.toHaveBeenCalled();
  });

  it("keeps extraction failures recoverable by asking for pasted text", async () => {
    mocks.extractResumeDocument.mockRejectedValue(new DocumentExtractionError({
      code: "document_text_empty",
      message: "No readable text",
    }));

    const response = await POST(pdfRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("粘贴简历文本");
  });

  it("rejects an empty extraction result rather than reporting a readable PDF", async () => {
    mocks.extractResumeDocument.mockResolvedValue({ text: "  ", method: "pdf_text" });

    const response = await POST(pdfRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toContain("粘贴正文");
  });

  it("requires an authenticated session", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("Not authenticated"));

    const response = await POST(pdfRequest());

    expect(response.status).toBe(401);
    expect(mocks.extractResumeDocument).not.toHaveBeenCalled();
  });
});
