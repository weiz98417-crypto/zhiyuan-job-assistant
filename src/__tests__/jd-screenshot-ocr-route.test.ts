import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/server-image-intake");
});

describe("JD screenshot OCR route", () => {
  it("returns extracted JD text from the shared image intake", async () => {
    const inspectDocumentImages = vi.fn(async () => ({
      documentType: "jd",
      confidence: 0.9,
      extractedText: "岗位职责：负责产品规划和跨团队交付。",
      structured: { company: "示例公司", role: "产品经理", body: "岗位职责：负责产品规划和跨团队交付。" },
    }));
    vi.doMock("@/lib/server-image-intake", () => ({
      inspectDocumentImages,
      mapImageIntakeToJDLegacy: (result: { extractedText: string }) => ({
        company: "示例公司",
        role: "产品经理",
        location: "",
        salary: "",
        skills: [],
        body: result.extractedText,
        isJD: true,
      }),
    }));
    const { POST } = await import("@/app/api/ocr/jd-screenshot/route");

    const response = await POST(new Request("http://localhost/api/ocr/jd-screenshot", {
      method: "POST",
      body: JSON.stringify({ image: "data:image/png;base64,AAAA" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.body).toContain("岗位职责");
    expect(json.data.location).toBe("【缺失】");
    expect(inspectDocumentImages).toHaveBeenCalledWith(
      ["data:image/png;base64,AAAA"],
      expect.objectContaining({ preferredDocumentType: "jd", signal: expect.any(AbortSignal) }),
    );
  });

  it("offers pasted text when recognition times out", async () => {
    vi.doMock("@/lib/server-image-intake", () => ({
      inspectDocumentImages: async () => ({
        documentType: "unknown",
        confidence: 0,
        extractedText: "",
        reason: "OCR 服务处理图片超时",
        errors: ["ocr_timeout"],
      }),
      mapImageIntakeToJDLegacy: () => ({ body: "", isJD: false }),
    }));
    const { POST } = await import("@/app/api/ocr/jd-screenshot/route");

    const response = await POST(new Request("http://localhost/api/ocr/jd-screenshot", {
      method: "POST",
      body: JSON.stringify({ image: "data:image/png;base64,AAAA" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error).toContain("粘贴 JD 文字");
    expect(json.error).not.toContain("落库");
  });
});
