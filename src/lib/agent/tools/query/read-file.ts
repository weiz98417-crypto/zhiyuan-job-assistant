/**
 * Native read_file agent tool.
 *
 * Triple-pipe: returns llmSummary (for LLM), uiPayload (for UI), and rawData.
 * Routes: reference resumes → DB, "我的简历" → CV sections, file paths → server-side read.
 */
import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const rawPath = String(params.path || params.file || "");
  const offset = Number(params.offset) || 0;
  const limit = Number(params.limit) || 0;
  const sectionFilter = String(params.section || "").trim();

  // Helper: apply offset/limit + position indicator
  function sliceWithIndicator(text: string): string {
    const total = text.length;
    if (offset <= 0 && limit <= 0) return text;
    const start = Math.min(offset, total);
    const end = limit > 0 ? Math.min(start + limit, total) : total;
    const sliced = text.slice(start, end);
    return `[第 ${start + 1}-${end} 字，共 ${total} 字]\n\n${sliced}`;
  }
  if (!rawPath.trim()) {
    // Build available resources hint
    let hint = "可用资源: read_file(path='我的简历') 读取你的简历";
    try {
      const refsRes = await fetch("/api/cv/references");
      if (refsRes.ok) {
        const refsJson = await refsRes.json();
        const refs = (refsJson.data || []) as Array<{ id: number; name: string; tags: string[] }>;
        if (refs.length) hint += "; 参考简历: " + refs.map(r => `#${r.id} ${r.name}`).join(", ");
      }
    } catch { /* non-blocking */ }
    return {
      success: false, data: null,
      error: `请提供要读取的文件路径或资源名称。${hint}。也支持项目文件路径，如 cv.md`,
      errorCategory: "need_user_input",
    };
  }

  const p = rawPath.trim();
  const isReference = /参考简历|参考/.test(p) || /张雯茜/.test(p);

  // ── Route 1: Reference resumes ──
  if (isReference) {
    try {
      const listRes = await fetch("/api/cv/references");
      const listJson = await listRes.json();
      if (listJson.success && Array.isArray(listJson.data) && listJson.data.length > 0) {
        const refs = listJson.data as Array<{ id: number; name: string }>;
        const nameMatch = p.match(/参考简历[/\s]*[：:]*\s*(.+)/);
        const targetName = nameMatch ? nameMatch[1].trim() : "";
        const found = targetName
          ? refs.find(r => r.name.includes(targetName) || targetName.includes(r.name))
          : refs[0];

        if (found) {
          const detailRes = await fetch(`/api/cv/references/${found.id}`);
          const detailJson = await detailRes.json();
          if (detailJson.success) {
            const sections = detailJson.data.sections || [] as Array<{ id: string; title: string; content: string }>;
            const parts: string[] = [];
            let total = 0;
            const MAX_CHARS = 2000;
            for (const s of sections) {
              if (s.content?.trim() && total < MAX_CHARS) {
                const capped = s.content.length > 800 ? s.content.slice(0, 800) + "…(已截断)" : s.content;
                parts.push(`### ${s.title || s.id}\n${capped}`);
                total += capped.length;
              }
            }
            const content = parts.join("\n\n");
            const llmText = `参考简历: ${detailJson.data.name}\n来源: ${detailJson.data.source || "upload"}\n\n${content.slice(0, 1800)}`;

            return {
              success: true,
              errorCategory: "ok",
              llmSummary: sliceWithIndicator(llmText),
              uiPayload: {
                type: "reference_resume",
                name: detailJson.data.name,
                source: detailJson.data.source,
                sections: sections.map((s: { id: string; title: string; content: string }) => ({ title: s.title || s.id, content: s.content, preview: s.content?.slice(0, 500) || "" })),
              },
              rawData: detailJson.data,
              data: { content: content.slice(0, MAX_CHARS), truncated: content.length > MAX_CHARS, source: "db" },
            };
          }
        }
        // References exist but name not found
        const availableNames = refs.map(r => r.name).join("、");
        return {
          success: false, data: null,
          error: `未找到匹配的参考简历。可用: ${availableNames}。使用 read_file(path='参考简历/姓名')`,
          errorCategory: "permanent",
        };
      }
      return {
        success: false, data: null,
        error: "参考简历库为空。请先上传参考简历",
        errorCategory: "permanent",
      };
    } catch {
      return {
        success: false, data: null,
        error: "参考简历库访问失败",
        errorCategory: "transient",
      };
    }
  }

  // ── Route 2: "我的简历" → full CV sections ──
  if (/我的简历|个人画像|我的CV/.test(p)) {
    try {
      const cvRes = await fetch("/api/cv/data");
      const cvJson = await cvRes.json();
      if (cvJson?.data?.versions) {
        const cv = cvJson.data as Record<string, unknown>;
        const versions = cv.versions as Record<string, { sections?: Array<{ id: string; title: string; content: string }> }>;
        const activeVer = (cv.activeVersion as string) || Object.keys(versions)[0];
        const sections = versions[activeVer]?.sections || [];

        const cvSections: Record<string, string> = {};
        // Filter by section if specified
        const targetSections = sectionFilter
          ? sections.filter(s => s.id === sectionFilter || s.title?.includes(sectionFilter) ||
              (sectionFilter === "工作经历" && s.id === "experience") ||
              (sectionFilter === "项目经验" && s.id === "projects"))
          : sections;
        const effectiveSections = targetSections.length > 0 ? targetSections : sections;

        const parts: string[] = [];
        let total = 0;
        const MAX_CHARS = 8000;
        const PER_SECTION_CAP = 3000;
        for (const s of effectiveSections) {
          cvSections[s.id] = s.content?.trim() || "";
          if (s.content?.trim() && total < MAX_CHARS) {
            const capped = s.content.length > PER_SECTION_CAP ? s.content.slice(0, PER_SECTION_CAP) : s.content;
            parts.push(`### ${s.title}\n${capped}`);
            total += capped.length;
          }
        }
        if (parts.length === 0) parts.push("（简历尚未填写）");
        const fullContent = parts.join("\n\n");
        const content = fullContent.length > MAX_CHARS
          ? fullContent.slice(0, MAX_CHARS) + `\n\n[已截断，共 ${fullContent.length} 字。续读: read_file(path='我的简历', offset=${MAX_CHARS})]`
          : fullContent;

        return {
          success: true,
          errorCategory: "ok",
          llmSummary: sliceWithIndicator(content),
          uiPayload: {
            type: "file_content",
            path: p,
            content,
            truncated: content.length > MAX_CHARS || (offset > 0 || limit > 0),
            source: "cv",
            cvSections,
          },
          rawData: { cvSections },
          data: { content, truncated: content.length > MAX_CHARS || (offset > 0 || limit > 0), source: "cv" },
        };
      }
      return {
        success: true,
        errorCategory: "ok",
        llmSummary: "简历尚未填写，请先上传或填写简历。",
        uiPayload: { type: "file_content", path: p, content: "（简历尚未填写）", truncated: false, source: "cv" },
        data: { content: "（简历尚未填写）", truncated: false, source: "cv" },
      };
    } catch {
      // fall through to filesystem
    }
  }

  // ── Route 3: File path → server-side read ──
  try {
    const res = await fetch(`/api/agent/read-file?path=${encodeURIComponent(p)}`);
    const json = await res.json();
    if (json.success) {
      const rawContent = json.data.content as string;
      // Line-based offset/limit for file reads (like Cursor/Claude Code)
      let content: string;
      if (offset > 0 || limit > 0) {
        const lines = rawContent.split("\n");
        const startLine = Math.max(offset, 1); // 1-based
        const endLine = limit > 0 ? Math.min(startLine + limit - 1, lines.length) : lines.length;
        content = `[第 ${startLine}-${endLine} 行，共 ${lines.length} 行]\n\n${lines.slice(startLine - 1, endLine).join("\n")}`;
      } else {
        content = rawContent;
      }
      return {
        success: true,
        errorCategory: "ok",
        llmSummary: content,
        uiPayload: { type: "file_content", path: p, content, truncated: json.data.truncated || (offset > 0 || limit > 0), source: "fs" },
        data: { content, truncated: json.data.truncated, source: "fs" },
      };
    }
    // Build helpful error with available resources
    let errMsg = json.error || "读取失败";
    try {
      const refsRes = await fetch("/api/cv/references");
      if (refsRes.ok) {
        const refsJson = await refsRes.json();
        const refs = (refsJson.data || []) as Array<{ id: number; name: string }>;
        const hints: string[] = [];
        hints.push("read_file(path='我的简历')");
        if (refs.length) hints.push("参考简历: " + refs.map(r => `read_file(path='参考简历/${r.name}')`).join(", "));
        hints.push("项目文件: cv.md, config/profile.yml");
        errMsg += `。可用资源: ${hints.join("; ")}`;
      }
    } catch { /* non-blocking */ }
    return {
      success: false, data: null,
      error: errMsg,
      errorCategory: (json.errorCategory as ToolResult["errorCategory"]) || "permanent",
    };
  } catch (err) {
    return {
      success: false, data: null,
      error: `读取请求失败: ${err instanceof Error ? err.message : "未知错误"}`,
      errorCategory: "transient",
    };
  }
}

/** @deprecated Use llmSummary field in ToolResult instead */
function formatResult(result: ToolResult): string {
  if (!result.success) {
    const prefix = result.errorCategory === "need_user_input" ? "需要更多信息" :
                   result.errorCategory === "permanent" ? "读取失败(不可重试)" :
                   "读取失败(可重试)";
    return `${prefix}: ${result.error || "未知错误"}`;
  }
  return result.llmSummary || ((result.data as { content?: string })?.content) || "文件为空";
}

export const readFile: ToolDefinition = {
  name: "read_file",
  description:
    "读取项目文件或数据资源。路由: 含'参考简历'→参考简历库; '我的简历'→完整简历文本;" +
    " 文件路径→服务端读取。支持 offset/limit 续读和 section 定向读。",
  matchHints: ["简历", "我的简历", "参考简历", "上传的简历", "参考", "文件", "cv", "打开", "读"],
  category: "query",
  toolCtxCap: 8000,
  parameters: {
    path: { type: "string", required: true, description: "文件路径或资源名，如 'cv.md'、'参考简历/张雯茜'、'我的简历'" },
    offset: { type: "number", required: false, description: "起始位置。读简历时=字符位置(0-based)，读文件时=行号(1-based)。续读时使用" },
    limit: { type: "number", required: false, description: "读取上限。读简历时=字符数，读文件时=行数。不传则读全部" },
    section: { type: "string", required: false, description: "仅对'我的简历'路径生效。指定板块: summary/experience/projects/education/skills 或中文名" },
  },
  handler,
  formatResult,
};
