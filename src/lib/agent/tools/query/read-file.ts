/**
 * Native read_file agent tool.
 *
 * Triple-pipe: returns llmSummary (for LLM), uiPayload (for UI), and rawData.
 * Routes: reference resumes → DB, "我的简历" → CV sections, file paths → server-side read.
 */
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

function isCurrentResumeResource(path: string): boolean {
  const normalized = path.trim().replace(/[“”"'`]/g, "");
  if (/我的简历|当前简历|上传的简历|个人画像|我的\s*CV/i.test(normalized)) return true;
  return /^(?!.*参考)(?:[\p{Script=Han}A-Za-z·•\s]{2,30})的(?:个人)?简历$/u.test(normalized);
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const rawPath = String(params.path || params.file || "");
  const offset = Number(params.offset) || 0;
  const limit = Number(params.limit) || 0;
  const sectionFilter = String(params.section || "").trim();
  const projection = String(params.projection || params.view || "structured").toLowerCase();

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
      const refs = context
        ? await getAgentReadService().listReferenceResumes(context.principal)
        : await fetch("/api/cv/references")
          .then((response) => response.ok ? response.json() : null)
          .then((json) => (json?.data || []) as Array<{ id: number; name: string }>);
      if (refs.length) hint += "; 参考简历: " + refs.map((reference) => `#${reference.id} ${reference.name}`).join(", ");
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
      const refs = context
        ? await getAgentReadService().listReferenceResumes(context.principal)
        : await fetch("/api/cv/references")
          .then((response) => response.json())
          .then((json) => json.success && Array.isArray(json.data) ? json.data as Array<{ id: number; name: string }> : []);
      if (refs.length > 0) {
        const nameMatch = p.match(/参考简历[/\s]*[：:]*\s*(.+)/);
        const targetName = nameMatch ? nameMatch[1].trim() : "";
        const found = targetName
          ? refs.find(r => r.name.includes(targetName) || targetName.includes(r.name))
          : refs[0];

        if (found) {
          const detail = context
            ? await getAgentReadService().getReferenceResume(context.principal, found.id)
            : await fetch(`/api/cv/references/${found.id}`)
              .then((response) => response.json())
              .then((json) => json.success ? json.data : null);
          if (detail) {
            const sections = detail.sections || [] as Array<{ id: string; title: string; content: string }>;
            const parts: string[] = [];
            let total = 0;
            for (const s of sections) {
              if (s.content?.trim()) {
                parts.push(`### ${s.title || s.id}\n${s.content}`);
                total += s.content.length;
              }
            }
            const content = parts.join("\n\n");
            const llmText = `参考简历: ${detail.name}\n来源: ${detail.source || "upload"}\n\n${content}`;

            return {
              success: true,
              errorCategory: "ok",
              llmSummary: sliceWithIndicator(llmText),
              uiPayload: {
                type: "reference_resume",
                name: detail.name,
                source: detail.source,
                sections: sections.map((s: { id: string; title: string; content: string }) => ({ title: s.title || s.id, content: s.content, preview: s.content?.slice(0, 500) || "" })),
              },
              rawData: detail,
              data: { content, truncated: false, source: "db", totalChars: total },
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
  if (isCurrentResumeResource(p)) {
    try {
      const includeSource = projection === "source" || projection === "raw" || projection === "原文";
      const cvRes = context
        ? null
        : await fetch(includeSource ? "/api/cv/data?includeSource=1" : "/api/cv/data");
      const cvJson = context
        ? { success: true, data: await getAgentReadService().getCurrentResume(context.principal, { includeSource }) }
        : await cvRes!.json().catch(() => ({}));
      if (cvRes && (!cvRes.ok || cvJson?.success === false)) {
        return {
          success: false,
          data: null,
          error: cvJson?.error || `简历数据读取失败: HTTP ${cvRes.status}`,
          errorCategory: cvRes.status === 401 ? "need_user_input" : cvRes.status >= 500 ? "transient" : "permanent",
        };
      }
      if (cvJson?.data?.versions) {
        const cv = cvJson.data as Record<string, unknown>;
        const resumeDocument = cv.resumeDocument && typeof cv.resumeDocument === "object"
          ? cv.resumeDocument as Record<string, unknown>
          : null;
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
        if (includeSource && typeof resumeDocument?.sourceText === "string") {
          parts.push(resumeDocument.sourceText || "（没有可读取的原文工件）");
        } else {
          for (const s of effectiveSections) {
            cvSections[s.id] = s.content?.trim() || "";
            if (s.content?.trim()) {
              parts.push(`### ${s.title}\n${s.content}`);
            }
          }
        }
        if (parts.length === 0) parts.push("（简历尚未填写）");
        const fullContent = parts.join("\n\n");
        const pageSize = limit > 0 ? limit : 16000;
        const pageStart = Math.min(offset, fullContent.length);
        const pageEnd = Math.min(pageStart + pageSize, fullContent.length);
        const page = fullContent.slice(pageStart, pageEnd);
        const content = offset > 0 || limit > 0 || fullContent.length > pageSize
          ? `[第 ${pageStart + 1}-${pageEnd} 字，共 ${fullContent.length} 字]\n\n${page}`
          : page;
        const nextOffset = pageEnd;
        const hasMore = nextOffset < fullContent.length;
        const continuation = hasMore
          ? `\n\n[继续读取: read_file(path='我的简历', offset=${nextOffset}, limit=${limit || 8000})]`
          : "";
        const llmContent = `${content}${continuation}`;

        return {
          success: true,
          errorCategory: "ok",
          llmSummary: llmContent,
          uiPayload: {
            type: "resume_document",
            path: p,
            truncated: hasMore,
            source: "cv",
            activeVersion: activeVer,
            section: sectionFilter || "",
            projection: includeSource ? "source" : "structured",
            integrity: resumeDocument?.integrity || null,
            totalChars: fullContent.length,
            nextOffset: hasMore ? nextOffset : null,
          },
          rawData: { cvSections, content: fullContent, resumeDocument },
          data: { truncated: hasMore, source: "cv", projection: includeSource ? "source" : "structured", activeVersion: activeVer, totalChars: fullContent.length, nextOffset: hasMore ? nextOffset : null },
        };
      }
      return {
        success: true,
        errorCategory: "ok",
        llmSummary: "简历尚未填写，请先上传或填写简历。",
        uiPayload: { type: "file_content", path: p, content: "（简历尚未填写）", truncated: false, source: "cv" },
        data: { content: "（简历尚未填写）", truncated: false, source: "cv" },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `简历数据读取失败: ${error instanceof Error ? error.message : "未知错误"}`,
        errorCategory: "transient",
      };
    }
  }

  // ── Route 3: File path → server-side read ──
  try {
    const response = context
      ? null
      : await fetch(`/api/agent/read-file?path=${encodeURIComponent(p)}`);
    const json = context
      ? { success: true, data: await getAgentReadService().readProjectFile(p), errorCategory: "ok" }
      : await response!.json();
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
      const refs = context
        ? await getAgentReadService().listReferenceResumes(context.principal)
        : await fetch("/api/cv/references")
          .then((referenceResponse) => referenceResponse.ok ? referenceResponse.json() : null)
          .then((refsJson) => (refsJson?.data || []) as Array<{ id: number; name: string }>);
      const hints: string[] = ["read_file(path='我的简历')"];
      if (refs.length) hints.push("参考简历: " + refs.map((reference) => `read_file(path='参考简历/${reference.name}')`).join(", "));
      hints.push("项目文件: cv.md, config/profile.yml");
      errMsg += `。可用资源: ${hints.join("; ")}`;
    } catch { /* non-blocking */ }
    return {
      success: false, data: null,
      error: errMsg,
      errorCategory: (json.errorCategory as ToolResult["errorCategory"]) || "permanent",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    const permanent = /不支持|不存在|编码异常/.test(message);
    return {
      success: false, data: null,
      error: `读取请求失败: ${message}`,
      errorCategory: permanent ? "permanent" : "transient",
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
  const data = result.data as { source?: string; totalChars?: number } | null;
  if (data?.source === "cv") return `已读取当前简历，共 ${data.totalChars || 0} 字。完整内容请查看简历卡片。`;
  return result.llmSummary || "文件为空";
}

export const readFile: ToolDefinition = {
  name: "read_file",
  description:
    "读取项目文件或数据资源。路由: 含'参考简历'→参考简历库; '我的简历'→完整简历文本;" +
    " 文件路径→服务端读取。支持 offset/limit 续读和 section 定向读。",
  matchHints: ["简历", "我的简历", "参考简历", "上传的简历", "参考", "文件", "cv", "打开", "读"],
  category: "query",
  toolCtxCap: 30000,
  parameters: {
    path: { type: "string", required: true, description: "文件路径或资源名，如 'cv.md'、'参考简历/张雯茜'、'我的简历'" },
    offset: { type: "number", required: false, description: "起始位置。读简历时=字符位置(0-based)，读文件时=行号(1-based)。续读时使用" },
    limit: { type: "number", required: false, description: "读取上限。读简历时=字符数，读文件时=行数。不传则读全部" },
    section: { type: "string", required: false, description: "仅对'我的简历'路径生效。指定板块: summary/experience/projects/education/skills 或中文名" },
    projection: { type: "string", required: false, description: "structured=结构化简历；source=原文工件。完整性待确认或需要核对遗漏时读取 source" },
  },
  handler,
  formatResult,
};
