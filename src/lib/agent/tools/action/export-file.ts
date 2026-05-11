import type { ToolDefinition, ToolResult } from "../types";

const MIME: Record<string, string> = {
  md: "text/markdown",
  html: "text/html",
  txt: "text/plain",
};

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const { content, filename, format } = params;
  if (typeof content !== "string" || content.length === 0) {
    return { success: false, data: null, error: "content is required (non-empty string)" };
  }
  if (typeof filename !== "string" || filename.length === 0) {
    return { success: false, data: null, error: "filename is required (non-empty string)" };
  }

  const ext = (typeof format === "string" && MIME[format] ? format : "md") as string;
  const mime = MIME[ext] || MIME.md;
  const fullName = `${filename}.${ext}`;

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fullName;
  a.click();
  URL.revokeObjectURL(url);

  return { success: true, data: { filename: fullName, size: content.length } };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `导出失败: ${result.error}`;
  const d = result.data as { filename?: string; size?: number } | null;
  return d ? `已下载: ${d.filename} (${d.size} 字符)` : "已下载";
}

export const exportFile: ToolDefinition = {
  name: "export_file",
  description: "导出内容为文件并触发浏览器下载。支持 md / html / txt 格式。",
  parameters: {
    content: { type: "string", required: true, description: "文件内容" },
    filename: { type: "string", required: true, description: "文件名（不含扩展名）" },
    format: { type: "string", required: false, description: "md / html / txt，默认 md" },
  },
  category: "action",
  handler,
  formatResult,
};
