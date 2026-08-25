import { createReportPdfArtifact } from "@/lib/server/report-pdf-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

interface ReportData {
  company: string;
  role: string;
}

function apiPath(path: string): string {
  if (typeof window !== "undefined") return path;
  const port = (typeof process !== "undefined" && process.env?.PORT) || 3000;
  return `http://localhost:${port}${path}`;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) return "";
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return hex(digest);
}

function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  const reportNum = Number(params.reportNum);
  if (!reportNum) return { success: false, data: null, error: "reportNum is required" };

  try {
    if (context?.principal) {
      const artifact = await createReportPdfArtifact(context.principal, reportNum);
      return {
        success: true,
        data: artifact,
        rawData: artifact,
        errorCategory: "ok",
        llmSummary: `报告 #${reportNum} 的 PDF 下载工件已生成，并已完成文件校验。`,
        uiPayload: { type: "download", ...artifact },
      };
    }
    const res = await fetch(apiPath(`/api/data/reports/${reportNum}`));
    const json = await res.json();
    if (!json.success) return { success: false, data: null, error: json.error || "报告不存在" };

    const report = json.data as ReportData;
    const downloadUrl = `/api/reports/${reportNum}/pdf`;
    const pdfRes = await fetch(apiPath(downloadUrl));
    if (!pdfRes.ok) {
      const errorText = await pdfRes.text().catch(() => "");
      return { success: false, data: null, error: `PDF 生成失败: HTTP ${pdfRes.status} ${errorText.slice(0, 160)}` };
    }

    const contentType = pdfRes.headers.get("Content-Type") || "";
    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    const hash = await sha256Hex(bytes);
    const headerHash = pdfRes.headers.get("X-Content-SHA256") || "";
    const readBackVerified = contentType.includes("application/pdf") &&
      hasPdfMagic(bytes) &&
      bytes.byteLength > 0 &&
      Boolean(hash) &&
      (!headerHash || headerHash === hash);
    if (!readBackVerified) {
      return { success: false, data: null, error: "PDF 文件生成后回读校验失败，已阻止成功提示" };
    }

    return {
      success: true,
      errorCategory: "ok",
      data: {
        reportNum,
        company: report.company,
        role: report.role,
        filename: `report-${reportNum}.pdf`,
        downloadUrl,
        size: bytes.byteLength,
        sha256: hash,
        readBackVerified,
      },
      llmSummary: `报告 #${reportNum} 的 PDF 下载链接已生成，并已完成文件校验。`,
    };
  } catch (err) {
    return { success: false, data: null, error: `导出失败: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `PDF 导出失败: ${result.error}`;
  const d = result.data as { reportNum?: number; company?: string; role?: string; downloadUrl?: string; size?: number } | null;
  return d
    ? `报告 #${d.reportNum}（${d.company} - ${d.role}）PDF 已生成并校验：${d.downloadUrl}（${d.size || 0} bytes）`
    : "PDF 已生成并校验";
}

export const downloadReportPDF: ToolDefinition = {
  name: "download_report_pdf",
  description: "将评估报告导出为 PDF 下载文件，并在返回成功前校验 PDF 字节大小和 SHA-256。",
  parameters: {
    reportNum: { type: "number", required: true, description: "报告编号" },
  },
  category: "action",
  handler,
  formatResult,
};
