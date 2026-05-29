import type { ToolDefinition } from "@/lib/agent/tools/types";

export const importResume: ToolDefinition = {
  name: "import_resume",
  description: "导入简历文本并自动解析为结构化栏位（个人概述、工作经历、项目经验、教育背景、技能）",
  category: "action",
  parameters: {
    text: {
      type: "string",
      required: true,
      description: "简历的完整文本内容",
    },
    source: {
      type: "string",
      required: false,
      description: "来源: paste/upload/email，默认 paste",
    },
    language: {
      type: "string",
      required: false,
      description: "语言: zh/en，默认 zh",
    },
  },
  async handler(params: Record<string, unknown>) {
    const text = String(params.text || "");
    if (!text.trim()) {
      return { success: false, data: null, error: "请提供简历文本内容" };
    }
    try {
      const res = await fetch("/api/cv/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, data: null, error: data.error || "解析失败" };
      }
      return { success: true, data: data.data };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "导入请求失败",
      };
    }
  },
  formatResult(result) {
    if (!result.success) return result.error || "导入失败";
    const data = result.data as { sections: Record<string, string> };
    if (!data?.sections) return "解析完成，但未提取到内容";
    const entries = Object.entries(data.sections).filter(([, v]) => v);
    if (entries.length === 0) return "解析完成，但各栏位均为空";
    return (
      "简历解析完成，已提取以下栏位：\n" +
      entries
        .map(([k, v]) => {
          const label =
            k === "summary"
              ? "个人概述"
              : k === "experience"
                ? "工作经历"
                : k === "projects"
                  ? "项目经验"
                  : k === "education"
                    ? "教育背景"
                    : k === "skills"
                      ? "技能"
                      : k;
          return `【${label}】\n${v}`;
        })
        .join("\n\n")
    );
  },
};
