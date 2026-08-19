import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_USER = {
  userId: "user-canonical-cv",
  username: "canonical-cv-user",
  role: "member",
  tokenVersion: 0,
};

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/data-repositories");
});

describe("CV data canonical projection", () => {
  it("overlays cv_data from the active canonical document and exposes source chunks on demand", async () => {
    const sourceText = `${"完整原文经历。".repeat(1200)}TAIL-CANONICAL-SOURCE`;
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: async () => TEST_USER }));
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({
        cv: {
          get: async () => ({
            data_json: JSON.stringify({
              activeVersion: "v1",
              versions: { v1: { id: "v1", label: "旧投影", sections: [{ id: "skills", content: "过期内容" }] } },
            }),
          }),
        },
        resumeDocuments: {
          getActive: async () => ({
            id: "resume-v2",
            version_id: "v2",
            label: "Canonical V2",
            status: "active",
            source_type: "upload",
            source_artifact_id: "source-v2",
            content_hash: "sha256:canonical-v2",
            sections_json: JSON.stringify([{ id: "skills", title: "技能", content: "Canonical 完整技能" }]),
            integrity_json: JSON.stringify({ status: "valid", coverageRatio: 1 }),
          }),
          getArtifact: async () => ({
            id: "source-v2",
            document_id: "resume-v2",
            source_type: "upload",
            filename: "resume.pdf",
            mime_type: "application/pdf",
            raw_text: sourceText,
            original_base64: "",
            extraction_json: JSON.stringify({ method: "pdf_text" }),
            source_hash: "source-hash-v2",
          }),
          listChunks: async () => [{
            id: "chunk-v2-0",
            document_id: "resume-v2",
            chunk_index: 0,
            start_offset: 0,
            end_offset: sourceText.length,
            content: sourceText,
            sections_json: "[]",
            content_hash: "chunk-hash-v2-0",
          }],
        },
      }),
    }));
    const route = await import("@/app/api/cv/data/route");

    const response = await route.GET(new Request("http://localhost/api/cv/data?includeSource=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.activeVersion).toBe("v2");
    expect(body.data.versions.v2.sections[0].content).toBe("Canonical 完整技能");
    expect(body.data.resumeDocument).toMatchObject({
      id: "resume-v2",
      sourceText,
      sourceArtifact: { filename: "resume.pdf", sourceHash: "source-hash-v2" },
      chunks: [{ id: "chunk-v2-0", content: sourceText }],
    });
  });

  it("returns a conflict instead of overwriting a newer Agent edit", async () => {
    const actual = await vi.importActual<typeof import("@/lib/data-repositories")>("@/lib/data-repositories");
    const upsertIfCurrent = vi.fn(async () => {
      throw new actual.CvWriteConflictError("v8", "fnv1a32:newer");
    });
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: async () => TEST_USER }));
    vi.doMock("@/lib/data-repositories", () => ({
      ...actual,
      getDataRepositories: () => ({ cv: { upsertIfCurrent } }),
    }));
    const route = await import("@/app/api/cv/data/route");

    const response = await route.PUT(new Request("http://localhost/api/cv/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: { activeVersion: "v7", versions: {} },
        expectedActiveVersion: "v7",
        expectedBaseHash: "fnv1a32:older",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      code: "base_version_conflict",
      data: { currentVersion: "v8", currentHash: "fnv1a32:newer" },
    });
    expect(upsertIfCurrent).toHaveBeenCalledTimes(1);
  });
});
