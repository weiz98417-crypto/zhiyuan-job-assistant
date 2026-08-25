import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { close, getReport, launch, newPage, pdf, setContent } = vi.hoisted(() => ({
  close: vi.fn(),
  getReport: vi.fn(),
  launch: vi.fn(),
  newPage: vi.fn(),
  pdf: vi.fn(),
  setContent: vi.fn(),
}));

vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({ reports: { get: getReport } }),
}));

vi.mock("playwright", () => ({
  chromium: {
    executablePath: () => "",
    launch,
  },
}));

import { createReportPdfArtifact } from "@/lib/server/report-pdf-service";
import { readExportArtifact } from "@/lib/server/export-artifact-service";
import { downloadReportPDF } from "@/lib/agent/tools/action/download-report-pdf";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
});

describe("report PDF service", () => {
  beforeEach(() => {
    close.mockReset();
    getReport.mockReset();
    launch.mockReset();
    newPage.mockReset();
    pdf.mockReset();
    setContent.mockReset();
  });

  it("creates a verified user-scoped PDF artifact", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "zhiyuan-report-pdf-"));
    roots.push(rootDir);
    vi.stubEnv("AGENT_ARTIFACT_DIR", rootDir);
    const bytes = Buffer.from("%PDF-1.4\n%%EOF\n", "utf8");
    getReport.mockResolvedValue({
      report_num: 12,
      date: "2026-08-24",
      company: "甲公司",
      role: "AI 产品经理",
      archetype: "builder",
      overall_score: 4.5,
      legitimacy: "high",
      blocks_json: JSON.stringify({ a: { content: "职位概览", score: 4 } }),
      keywords_json: JSON.stringify(["Agent"]),
    });
    pdf.mockResolvedValue(bytes);
    newPage.mockResolvedValue({ setContent, evaluate: vi.fn(), pdf });
    launch.mockResolvedValue({ newPage, close });

    const artifact = await createReportPdfArtifact({ userId: "user-1" }, 12);
    const readBack = await readExportArtifact({ userId: "user-1" }, artifact.artifactId);

    expect(getReport).toHaveBeenCalledWith(12, "user-1");
    expect(artifact).toMatchObject({
      reportNum: 12,
      company: "甲公司",
      role: "AI 产品经理",
      readBackVerified: true,
      contentType: "application/pdf",
    });
    expect(readBack?.bytes.equals(bytes)).toBe(true);
    expect(setContent).toHaveBeenCalledWith(expect.stringContaining("职位概览"), expect.any(Object));
    expect(close).toHaveBeenCalledOnce();
  });

  it("executes report PDF export in the Worker without localhost HTTP", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "zhiyuan-worker-report-pdf-"));
    roots.push(rootDir);
    vi.stubEnv("AGENT_ARTIFACT_DIR", rootDir);
    getReport.mockResolvedValue({
      report_num: 12,
      date: "2026-08-24",
      company: "甲公司",
      role: "AI 产品经理",
      archetype: "builder",
      overall_score: 4.5,
      legitimacy: "high",
      blocks_json: "{}",
      keywords_json: "[]",
    });
    pdf.mockResolvedValue(Buffer.from("%PDF-1.4\n%%EOF\n", "utf8"));
    newPage.mockResolvedValue({ setContent, evaluate: vi.fn(), pdf });
    launch.mockResolvedValue({ newPage, close });
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Worker must not call localhost HTTP");
    }));

    const result = await downloadReportPDF.handler(
      { reportNum: 12 },
      {
        principal: { userId: "user-1" },
        runId: "run-1",
        allowlist: ["download_report_pdf"],
      },
    );

    expect(result).toMatchObject({
      success: true,
      errorCategory: "ok",
      data: {
        reportNum: 12,
        readBackVerified: true,
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
