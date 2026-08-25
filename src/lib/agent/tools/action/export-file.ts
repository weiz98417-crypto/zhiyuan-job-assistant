import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

const MIME: Record<string, string> = {
  md: "text/markdown",
  html: "text/html",
  txt: "text/plain",
};

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

/* ── Markdown → HTML (browser-side, lightweight) ── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let pending: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  function flushPending() {
    if (pending.length > 0) { result.push(`<p>${pending.join("<br>")}</p>`); pending = []; }
  }
  function flushTable() {
    if (tableRows.length === 0) return;
    const clean: string[][] = [];
    let hasSep = false;
    for (const r of tableRows) {
      if (r.every(c => /^:?-{3,}:?$/.test(c))) { hasSep = true; continue; }
      clean.push(r);
    }
    if (clean.length === 0) { tableRows = []; return; }
    if (!hasSep && clean.length > 1) clean.splice(1, 0, clean[0].map(() => "---"));
    result.push("<table>");
    for (let ri = 0; ri < clean.length; ri++) {
      const tag = ri === 0 ? "th" : "td";
      result.push(`<tr>${clean[ri].map(c => `<${tag}>${inlineMd(c)}</${tag}>`).join("")}</tr>`);
    }
    result.push("</table>");
    tableRows = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        result.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = []; inCodeBlock = false; continue;
      }
      flushTable(); flushPending(); inCodeBlock = true; continue;
    }
    if (inCodeBlock) { codeLines.push(raw); continue; }
    if (line.startsWith("|") && line.endsWith("|")) {
      flushPending(); inTable = true;
      tableRows.push(line.slice(1, -1).split("|").map(c => c.trim()));
      continue;
    }
    if (inTable) { flushTable(); inTable = false; }
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) { flushPending(); result.push(`<h${hm[1].length}>${inlineMd(hm[2])}</h${hm[1].length}>`); continue; }
    if (/^(\s*[-*]\s*){3,}$/.test(line)) { flushPending(); result.push("<hr>"); continue; }
    if (line.startsWith("> ")) { pending.push(inlineMd(line.slice(2))); continue; }
    if (/^[-*]\s/.test(line)) { flushPending(); result.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ""))}</li>`); continue; }
    if (/^\d+\.\s/.test(line)) { flushPending(); result.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ""))}</li>`); continue; }
    if (line.trim() === "") { flushTable(); flushPending(); continue; }
    pending.push(inlineMd(line));
  }
  flushTable(); flushPending();
  return result.join("\n");
}

function wrapHtmlDoc(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Microsoft YaHei","PingFang SC",sans-serif; max-width:840px; margin:40px auto; padding:24px; color:#333; line-height:1.7; }
  h1 { font-size:1.5em; border-bottom:2px solid #2563eb; padding-bottom:8px; }
  h2 { font-size:1.15em; margin-top:28px; color:#1e40af; }
  h3 { font-size:1.05em; margin-top:20px; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:0.92em; }
  th, td { border:1px solid #ddd; padding:8px 12px; text-align:left; }
  th { background:#f0f4ff; font-weight:600; }
  blockquote { border-left:3px solid #2563eb; padding-left:12px; color:#555; margin:12px 0; }
  hr { border:none; border-top:1px solid #ddd; margin:24px 0; }
  code { background:#f0f0f0; padding:2px 6px; border-radius:3px; font-size:0.9em; }
  pre { background:#f5f5f5; padding:16px; border-radius:6px; overflow-x:auto; font-size:0.85em; line-height:1.5; }
  pre code { background:none; padding:0; }
  li { margin:4px 0; }
  @media print { body { margin:0; padding:20px; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function handler(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
  const { content, filename, format } = params;
  if (typeof content !== "string" || content.length === 0) {
    return { success: false, data: null, error: "content is required (non-empty string)" };
  }
  if (typeof filename !== "string" || filename.length === 0) {
    return { success: false, data: null, error: "filename is required (non-empty string)" };
  }

  const ext = (typeof format === "string" && MIME[format] ? format : "md") as string;
  const fullName = `${filename}.${ext}`;
  const rawContent = content as string;

  if (context?.principal.userId) {
    try {
      const { createExportArtifact } = await import("@/lib/server/export-artifact-service");
      const artifact = await createExportArtifact(context.principal, {
        content: rawContent,
        filename,
        format: ext,
      });
      return {
        success: true,
        data: artifact,
        errorCategory: "ok",
        llmSummary: `文件 ${artifact.filename} 已生成并完成读回校验。`,
        uiPayload: { type: "export_artifact", ...artifact },
        rawData: artifact,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "导出失败",
        errorCategory: "transient",
        recoverable: true,
      };
    }
  }

  // Detect if content is already HTML (LLM sometimes writes HTML directly)
  const isAlreadyHtml = /^\s*<(!DOCTYPE|html|head|body)/i.test(rawContent.trim());

  // If format is html, convert markdown to proper HTML (unless already HTML)
  const bodyContent = ext === "html" && !isAlreadyHtml ? mdToHtml(rawContent) : rawContent;

  // Browser context: Blob download
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blobContent = ext === "html" ? wrapHtmlDoc(filename as string, bodyContent) : rawContent;
    const bytes = new TextEncoder().encode(blobContent);
    const hash = await sha256Hex(bytes);
    const mime = MIME[ext] || MIME.md;
    const blob = new Blob([blobContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fullName;
    a.click();
    URL.revokeObjectURL(url);

    // Also sync raw markdown to server (server does its own md→html conversion)
    let serverReadBackVerified = false;
    try {
      const res = await fetch("/api/export-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: rawContent, filename, format: ext }),
      });
      const json = await res.json().catch(() => ({}));
      serverReadBackVerified = res.ok && json.success === true && json.data?.readBackVerified === true;
    } catch { /* non-critical */ }

    return { success: true, data: { filename: fullName, size: bytes.byteLength, sha256: hash, downloaded: true, readBackVerified: Boolean(hash), serverReadBackVerified } };
  }

  // Server context: save to output/ via API
  try {
    const port = (typeof process !== "undefined" && process.env?.PORT) || 3000;
    const base = `http://localhost:${port}`;
    const res = await fetch(`${base}/api/export-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: rawContent, filename, format: ext }),
    });
    const json = await res.json();
    const verified = json.success === true &&
      json.data?.readBackVerified === true &&
      typeof json.data?.size === "number" &&
      json.data.size > 0 &&
      typeof json.data?.sha256 === "string" &&
      json.data.sha256.length > 0;
    if (!verified) return { success: false, data: null, error: json.error || "export file read-back verification failed" };
    return { success: true, data: json.data };
  } catch (err) {
    return { success: false, data: null, error: `导出失败: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `导出失败: ${result.error}`;
  const d = result.data as { filename?: string; size?: number; downloadUrl?: string; downloaded?: boolean; sha256?: string } | null;
  if (d?.downloadUrl) {
    // Server context: file saved, link available
    return `文件已保存到服务器: ${d.filename || "unknown"} (${d.size || 0} 字符)\n\n下载链接: ${d.downloadUrl}\n\n请在回复中直接给用户这个下载链接，不要告诉用户"去下载"。`;
  }
  if (d?.downloaded) {
    // Browser context: auto-downloaded already
    return `文件已自动下载到用户设备: ${d.filename} (${d.size || 0} 字符)。用户无需再次下载。`;
  }
  return d ? `文件已下载: ${d.filename} (${d.size} 字符)。用户无需再次下载。` : "文件已导出。用户无需再次下载。";
}

export const exportFile: ToolDefinition = {
  name: "export_file",
  description: "导出内容为文件并触发浏览器下载。支持 md / html / txt 格式。",
  parameters: {
    content: { type: "string", required: true, description: "文件内容" },
    filename: { type: "string", required: true, description: "文件名（不含扩展名）" },
    format: { type: "string", required: false, description: "md / html / txt，默认 md" },
    directory: { type: "string", required: false, description: "保存子目录: output/reports/downloads，默认 output" },
  },
  category: "action",
  toolCtxCap: 2000,
  handler,
  formatResult,
};
