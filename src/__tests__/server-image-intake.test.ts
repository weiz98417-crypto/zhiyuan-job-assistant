import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildOCRImageCandidates: vi.fn(),
}));

vi.mock("@/lib/server-image-variants", () => ({
  buildOCRImageCandidates: mocks.buildOCRImageCandidates,
}));

function ocrResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("server image intake", () => {
  beforeEach(() => {
    process.env.ZHIPU_API_KEY = "test-key";
    mocks.buildOCRImageCandidates.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back from a timed-out tall whole image to slice OCR and merges slice text", async () => {
    mocks.buildOCRImageCandidates.mockResolvedValue([
      { label: "whole", kind: "whole", dataUri: "data:image/jpeg;base64,whole" },
      { label: "top", kind: "tall_slice", dataUri: "data:image/jpeg;base64,top" },
      { label: "middle", kind: "tall_slice", dataUri: "data:image/jpeg;base64,middle" },
      { label: "bottom", kind: "tall_slice", dataUri: "data:image/jpeg;base64,bottom" },
    ]);

    const longTop = "JD title. Responsibilities. ".repeat(8);
    const longMiddle = "Requirements. SQL. Data warehouse. ".repeat(8);
    const longBottom = "Benefits. Industry background. ".repeat(8);

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      const content = body.messages?.[1]?.content || [];
      const imageUrl = content.find((item: { type?: string }) => item.type === "image_url")?.image_url?.url || "";

      if (imageUrl.includes("whole")) {
        throw new Error("The operation was aborted due to timeout");
      }
      if (imageUrl.includes("top")) {
        return ocrResponse({
          documentType: "jd",
          confidence: 0.91,
          quality: "clear",
          reason: "top slice ok",
          extractedText: longTop,
          structured: { role: "Data Product Manager", body: longTop },
        });
      }
      if (imageUrl.includes("middle")) {
        return ocrResponse({
          documentType: "jd",
          confidence: 0.92,
          quality: "clear",
          reason: "middle slice ok",
          extractedText: longMiddle,
          structured: { skills: ["SQL"], body: longMiddle },
        });
      }
      if (imageUrl.includes("bottom")) {
        return ocrResponse({
          documentType: "jd",
          confidence: 0.89,
          quality: "clear",
          reason: "bottom slice ok",
          extractedText: longBottom,
          structured: { body: longBottom },
        });
      }
      throw new Error("unexpected candidate");
    }));

    const { inspectDocumentImages } = await import("@/lib/server-image-intake");
    const result = await inspectDocumentImages(["data:image/jpeg;base64,input"], {
      userText: "evaluate this JD",
      preferredDocumentType: "jd",
    });

    expect(result.documentType).toBe("jd");
    expect(result.extractedText).toContain("JD title. Responsibilities.");
    expect(result.extractedText).toContain("Requirements. SQL. Data warehouse.");
    expect(result.extractedText).toContain("Benefits. Industry background.");
    expect(result.perImage?.[0]?.candidate).toContain("top");
    expect(result.perImage?.[0]?.extractedTextLength).toBeGreaterThan(longTop.length + longMiddle.length);
  });
});
