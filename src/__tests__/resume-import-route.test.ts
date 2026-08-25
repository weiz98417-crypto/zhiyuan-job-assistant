import { beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  importResumeDocumentForAgent: vi.fn(),
  importResumeTextForAgent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: boundaries.getCurrentUser }));
vi.mock("@/lib/server/resume-import-service", () => ({
  importResumeDocumentForAgent: boundaries.importResumeDocumentForAgent,
  importResumeTextForAgent: boundaries.importResumeTextForAgent,
  ResumeImportInputError: class extends Error { status = 400; },
}));

import { POST } from "@/app/api/cv/import/route";

describe("resume import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundaries.getCurrentUser.mockResolvedValue({ userId: "user-1" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("route must not call model directly"));
  });

  it("delegates text intake to the shared principal-scoped service", async () => {
    boundaries.importResumeTextForAgent.mockResolvedValue({
      sections: { summary: "概述", experience: "", projects: "", skills: "", education: "" },
      integrity: { status: "valid" },
      persisted: { documentId: "resume-1", versionId: "v1", status: "active", cvData: {}, readBackVerified: true },
    });
    const request = new Request("http://localhost/api/cv/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "完整简历", source: "paste" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { persisted: { readBackVerified: true } } });
    expect(boundaries.importResumeTextForAgent).toHaveBeenCalledWith(
      { userId: "user-1" },
      { text: "完整简历", source: "paste", originalImages: [] },
      { signal: request.signal },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
