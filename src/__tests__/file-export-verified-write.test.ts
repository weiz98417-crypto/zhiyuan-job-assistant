import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { exportFile } from "@/lib/agent/tools/action/export-file";
import { downloadReportPDF } from "@/lib/agent/tools/action/download-report-pdf";
import {
  createAgentTaskContract,
  evaluateTaskContractCompletion,
  inferCompletedCriteriaFromToolResult,
} from "@/lib/agent/task-contract";

const cleanupFiles: string[] = [];

function hash(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

afterEach(() => {
  for (const file of cleanupFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
  vi.restoreAllMocks();
});

describe("file export verified writes", () => {
  it("writes exported files and returns read-back size/hash evidence", async () => {
    const route = await import("@/app/api/export-file/route");
    const filename = `vitest-export-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const content = "# Export Smoke\n\n- read back\n- hash verified\n";

    const response = await route.POST(new Request("http://localhost/api/export-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, filename, format: "md" }),
    }));
    const json = await response.json();
    const data = json.data as {
      filename: string;
      sha256: string;
      htmlSha256: string;
      size: number;
      htmlSize: number;
      readBackVerified: boolean;
    };
    const exportedPath = path.join(process.cwd(), "output", data.filename);
    const htmlPath = path.join(process.cwd(), "output", `${filename}.html`);
    cleanupFiles.push(exportedPath, htmlPath);

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(data.readBackVerified).toBe(true);
    expect(data.size).toBeGreaterThan(0);
    expect(data.htmlSize).toBeGreaterThan(0);
    expect(data.sha256).toBe(hash(Buffer.from(content, "utf-8")));
    expect(data.htmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(exportedPath)).toBe(true);
    expect(hash(fs.readFileSync(exportedPath))).toBe(data.sha256);

    const getResponse = await route.GET(new Request(`http://localhost/api/export-file?file=${encodeURIComponent(data.filename)}`));
    const bytes = Buffer.from(await getResponse.arrayBuffer());

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("Content-Length")).toBe(String(bytes.length));
    expect(getResponse.headers.get("X-Content-SHA256")).toBe(hash(bytes));
  });

  it("requires file hash evidence before a file export task can claim success", async () => {
    const contract = createAgentTaskContract({
      taskType: "file_export",
      target: "report-download",
    });

    expect(contract.successCriteria).toContain("file hash verified");

    const incompleteCriteria = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "export_file",
      toolSuccess: true,
      data: {
        filename: "report.md",
        size: 120,
        readBackVerified: true,
      },
    });
    expect(evaluateTaskContractCompletion(contract, incompleteCriteria).canClaimSuccess).toBe(false);

    const completedCriteria = inferCompletedCriteriaFromToolResult(contract, {
      toolName: "export_file",
      toolSuccess: true,
      data: {
        filename: "report.md",
        size: 120,
        sha256: "a".repeat(64),
        readBackVerified: true,
      },
    });
    const gate = evaluateTaskContractCompletion(contract, completedCriteria);

    expect(gate.canClaimSuccess).toBe(true);
    expect(gate.completedCriteria).toEqual(expect.arrayContaining([
      "export generated",
      "file exists",
      "file size is non-zero",
      "file hash verified",
    ]));
  });

  it("rejects server export tool success when read-back hash evidence is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          filename: "report.md",
          size: 120,
          readBackVerified: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await exportFile.handler({
      content: "# Report",
      filename: "report",
      format: "md",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/read-back verification failed/);
  });

  it("verifies PDF bytes and SHA-256 before reporting a PDF download as ready", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "utf-8");
    const pdfHash = hash(pdf);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { company: "Acme", role: "AI PM" },
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "X-Content-SHA256": pdfHash,
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadReportPDF.handler({ reportNum: 12 });
    const data = result.data as { size: number; sha256: string; readBackVerified: boolean; downloadUrl: string };

    expect(result.success).toBe(true);
    expect(data.readBackVerified).toBe(true);
    expect(data.size).toBe(pdf.length);
    expect(data.sha256).toBe(pdfHash);
    expect(data.downloadUrl).toBe("/api/reports/12/pdf");
  });
});
