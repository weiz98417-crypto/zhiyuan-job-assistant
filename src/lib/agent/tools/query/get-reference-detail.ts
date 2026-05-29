import type { ToolDefinition, ToolResult } from "../types";
import { isGarbledText } from "../../loop/text-quality";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const id = params.id || params.referenceId;
  try {
    const res = await fetch(`/api/cv/references/${id}`);
    const json = await res.json();
    if (!json.success) {
      // Build helpful error with available references
      let errMsg = json.error || "查询失败";
      try {
        const listRes = await fetch("/api/cv/references");
        const listJson = await listRes.json();
        if (listJson.success && Array.isArray(listJson.data)) {
          const refs = listJson.data as Array<{ id: number; name: string }>;
          if (refs.length) {
            errMsg += `。可用参考简历: ${refs.map(r => `#${r.id} ${r.name}`).join(", ")}。使用 get_reference_detail(id=N) 查询`;
          }
        }
      } catch { /* non-blocking */ }
      return { success: false, data: null, error: errMsg, errorCategory: "permanent" };
    }
    const d = json.data as Record<string, unknown>;

    // Parse sections
    let sections: Record<string, string> = {};
    try {
      const raw = typeof d.sections_json === "string"
        ? JSON.parse(d.sections_json)
        : (d.sections_json as unknown);
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item.id && item.content?.trim()) sections[item.id] = item.content;
        }
      } else if (raw && typeof raw === "object") {
        sections = raw as Record<string, string>;
      }
    } catch { /* use raw_text fallback */ }

    // Check garbled
    const labels: Record<string, string> = {
      summary: "个人概述", experience: "工作经历", projects: "项目经验",
      education: "教育背景", skills: "技能",
    };
    const garbledSections: string[] = [];
    for (const [key, label] of Object.entries(labels)) {
      if (sections[key]?.trim() && isGarbledText(sections[key])) garbledSections.push(label);
    }

    // Build llmSummary
    let llmSummary: string;
    if (garbledSections.length > 0) {
      llmSummary = `参考简历 "${d.name || "未命名"}" 的以下栏位存在编码异常: ${garbledSections.join("、")}。请引导用户重新上传。`;
    } else {
      const parts: string[] = [`参考简历: ${d.name || "未命名"}\n来源: ${d.source || "unknown"}`];
      const hasSections = Object.values(sections).some(v => v?.trim());
      if (hasSections) {
        let total = 0;
        for (const [key, label] of Object.entries(labels)) {
          if (sections[key]?.trim() && total < 2000) {
            const capped = sections[key].length > 1500 ? sections[key].slice(0, 1500) + "…(截断)" : sections[key];
            parts.push(`### ${label}\n${capped}`);
            total += capped.length;
          }
        }
      } else if (d.raw_text && !isGarbledText((d.raw_text as string).slice(0, 500))) {
        parts.push((d.raw_text as string).slice(0, 1500));
      }
      llmSummary = parts.join("\n\n");
    }

    return {
      success: true,
      errorCategory: "ok",
      llmSummary,
      uiPayload: {
        type: "reference_resume",
        id: d.id,
        name: d.name,
        source: d.source,
        sections: Object.entries(sections).map(([id, content]) => ({ title: labels[id] || id, content, preview: content.slice(0, 500) })),
      },
      rawData: d,
      data: d,
    };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}`, errorCategory: "permanent" };
  }
}

/** @deprecated Use llmSummary field in ToolResult instead */
function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  return result.llmSummary || "";
}

export const getReferenceDetail: ToolDefinition = {
  name: "get_reference_detail",
  description: "读取参考简历库中的简历全文。id 为参考简历编号",
  parameters: { id: { type: "number", required: true, description: "参考简历 ID" } },
  category: "query", handler, formatResult, toolCtxCap: 4000,
};
