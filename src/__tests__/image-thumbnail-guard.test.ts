import { describe, expect, it } from "vitest";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";
import { routeImageIntake } from "@/lib/agent/image-intake-router";

describe("image thumbnail guard", () => {
  it("blocks chat-window thumbnail screenshots before JD evaluation", () => {
    const intake: ImageIntakeResult = {
      documentType: "chat_screenshot",
      confidence: 0.9,
      quality: "unreadable",
      extractedText: "I can see a chat window with a tiny embedded JD preview, but the preview text is unreadable.",
      reason: "chat screenshot with embedded thumbnail preview",
    };

    const decision = routeImageIntake("help me evaluate this JD", intake);
    expect(decision.route).toBe("retry_image");
    expect(decision.reason).toContain("聊天");
    expect(decision.retryHint).toContain("原图");
  });

  it("does not evaluate high-confidence thumbnail hallucinations", () => {
    const intake: ImageIntakeResult = {
      documentType: "jd",
      confidence: 0.91,
      quality: "thumbnail",
      extractedText: "岗位职责：负责产品设计。经验要求：5年以上。",
      reason: "text came from a small thumbnail preview",
    };

    const decision = routeImageIntake("evaluate this JD", intake);
    expect(decision.route).toBe("retry_image");
  });
});
