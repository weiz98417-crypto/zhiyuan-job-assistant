import type { ToolDefinition, ToolResult } from "../types";

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const id = params.id || params.referenceId;
  try {
    const res = await fetch(`/api/cv/references/${id}`);
    const json = await res.json();
    if (!json.success) return { success: false, data: null, error: json.error || "查询失败" };
    const d = json.data as Record<string, unknown>;
    return { success: true, data: d };
  } catch (err) {
    return { success: false, data: null, error: `${err instanceof Error ? err.message : "unknown"}` };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `查询失败: ${result.error}`;
  const d = result.data as Record<string, unknown> | null;
  if (!d) return "参考简历为空";

  // Parse sections_json for structured display
  let sections: Record<string, string> = {};
  try {
    sections = typeof d.sections_json === "string"
      ? JSON.parse(d.sections_json)
      : (d.sections_json as Record<string, string>) || {};
  } catch { /* use raw_text fallback */ }

  const parts: string[] = [];
  parts.push(`## ${d.name || "未命名简历"}`);
  parts.push(`来源: ${d.source || "unknown"}`);

  const labels: Record<string, string> = {
    summary: "个人概述", experience: "工作经历", projects: "项目经验",
    education: "教育背景", skills: "技能",
  };

  if (Object.keys(sections).length > 0) {
    let totalLen = 0;
    const MAX_TOTAL = 2000;
    for (const [key, label] of Object.entries(labels)) {
      if (sections[key]?.trim() && totalLen < MAX_TOTAL) {
        const capped = sections[key].length > 500
          ? sections[key].slice(0, 500) + "...(已截断)"
          : sections[key];
        parts.push(`### ${label}`);
        parts.push(capped);
        totalLen += capped.length;
      }
    }
  } else if (d.raw_text) {
    parts.push((d.raw_text as string).slice(0, 1500));
  }

  return parts.join("\n\n");
}

export const getReferenceDetail: ToolDefinition = {
  name: "get_reference_detail",
  description: "读取参考简历库中的简历全文。id 为参考简历编号",
  parameters: { id: { type: "number", required: true, description: "参考简历 ID" } },
  category: "query",
  handler,
  formatResult,
};
