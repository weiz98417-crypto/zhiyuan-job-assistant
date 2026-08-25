import type { ToolDefinition, ToolExecutionContext } from "@/lib/agent/tools/types";
import {
  importResumeTextForAgent,
  ResumeImportInputError,
} from "@/lib/server/resume-import-service";

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
    originalImages: {
      type: "array",
      required: false,
      description: "Agent Chat 图片简历确认链携带的原始 data URI；普通调用不要填写",
    },
  },
  async handler(params: Record<string, unknown>, context?: ToolExecutionContext) {
    const text = String(params.text || "");
    const source = String(params.source || "paste");
    const originalImages = Array.isArray(params.originalImages)
      ? params.originalImages.filter((image): image is string => typeof image === "string" && image.startsWith("data:image/"))
      : [];
    if (!text.trim()) {
      return { success: false, data: null, error: "请提供简历文本内容" };
    }
    if (context) {
      try {
        const data = await importResumeTextForAgent(context.principal, {
          text,
          source,
          originalImages,
        }, { signal: context.signal });
        const persisted = data.persisted;
        return {
          success: true,
          data,
          llmSummary: persisted.status === "pending"
            ? `简历已完整保存为待确认导入版本 ${persisted.versionId}，没有覆盖当前版本。请让用户查看完整简历卡片并到简历页确认。`
            : `简历已保存并读回验证，当前版本为 ${persisted.versionId}。`,
          uiPayload: {
            type: "resume_document",
            versionId: persisted.versionId,
            status: persisted.status,
            integrity: data.integrity,
            readBackVerified: persisted.readBackVerified,
          },
          rawData: data,
          errorCategory: "ok",
        };
      } catch (error) {
        const needsInput = error instanceof ResumeImportInputError;
        return {
          success: false,
          data: null,
          error: error instanceof Error ? error.message : "导入请求失败",
          errorCategory: needsInput ? "need_user_input" : "transient",
          recoverable: !needsInput,
        };
      }
    }
    try {
      const res = await fetch("/api/cv/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source, originalImages }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data?.persisted?.cvData) {
        return { success: false, data: null, error: data.error || "解析失败" };
      }
      const persisted = data.data.persisted as Record<string, unknown>;
      return {
        success: true,
        data: data.data,
        llmSummary: persisted.status === "pending"
          ? `简历已完整保存为待确认导入版本 ${persisted.versionId}，没有覆盖当前版本。请让用户查看完整简历卡片并到简历页确认。`
          : `简历已保存并读回验证，当前版本为 ${persisted.versionId}。`,
        uiPayload: {
          type: "resume_document",
          versionId: persisted.versionId,
          status: persisted.status,
          integrity: persisted.integrity,
        },
      };
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
