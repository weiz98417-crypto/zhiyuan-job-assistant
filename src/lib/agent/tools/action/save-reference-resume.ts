import type { ToolDefinition, ToolResult } from "../types";
import {
  buildVerifiedActionFailure,
  buildVerifiedActionSuccess,
  type VerifiedActionCheck,
} from "@/lib/agent/verified-action";

interface SaveReferenceResumeParams {
  resume_text?: string;
  name?: string;
  role_category?: string;
  visibility?: "private" | "team";
  tags?: string[];
  notes?: string;
}

function hasSpecificRoleCategory(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !/^(general|通用|未确定|unknown|其他|other)$/.test(normalized);
}

async function handler(params: Record<string, unknown>): Promise<ToolResult> {
  const input = params as SaveReferenceResumeParams;
  const resumeText = String(input.resume_text || "").trim();
  const roleCategory = String(input.role_category || "").trim();

  if (!resumeText) {
    return {
      success: false,
      data: null,
      error: "需要先提供或提取简历文本，才能保存为优秀简历。",
      errorCategory: "need_user_input",
      recoverable: false,
      retryHint: "请让用户上传/粘贴简历，或先调用文件/图片识别工具提取简历内容。",
    };
  }

  if (!hasSpecificRoleCategory(roleCategory)) {
    return {
      success: false,
      data: null,
      error: "保存优秀简历前需要确认岗位方向，例如 AI产品经理、AI运营、AI售前、数据产品经理。",
      errorCategory: "need_user_input",
      recoverable: false,
      retryHint: "请先询问用户：这份优秀简历要保存到哪个岗位方向？",
    };
  }

  const response = await fetch("/api/cv/import-reference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: resumeText,
      name: input.name,
      roleCategory,
      visibility: input.visibility || "private",
      tags: input.tags || [],
      notes: input.notes || "",
      saveAsExcellent: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.success) {
    return {
      success: false,
      data: payload,
      error: payload.error || `保存优秀简历失败: HTTP ${response.status}`,
      errorCategory: response.status >= 500 ? "transient" : "permanent",
      recoverable: response.status >= 500,
      retryHint: "请检查简历文本是否完整，或改为私有保存后再重试。",
    };
  }

  const data = payload.data || {};
  let readBack: Record<string, unknown> | null = null;
  let readBackError = "";
  const referenceId = Number(data.id || data.referenceResumeId || 0);
  if (referenceId > 0) {
    try {
      const verifyRes = await fetch(`/api/cv/references/${referenceId}`, { cache: "no-store" });
      const verifyJson = await verifyRes.json().catch(() => ({}));
      if (verifyRes.ok && verifyJson.success && verifyJson.data) {
        readBack = verifyJson.data as Record<string, unknown>;
      } else {
        readBackError = verifyJson.error || `Reference resume #${referenceId} read-back failed`;
      }
    } catch (error) {
      readBackError = error instanceof Error ? error.message : "Reference resume read-back failed";
    }
  } else {
    readBackError = "Save API did not return a reference resume id";
  }

  const expectedProjection = {
    id: referenceId,
    roleCategory: String(data.roleCategory || roleCategory || ""),
    name: String(data.name || input.name || ""),
  };
  const readBackProjection = {
    id: Number(readBack?.id || 0),
    roleCategory: String(readBack?.roleCategory || ""),
    name: String(readBack?.name || ""),
  };
  const checks: VerifiedActionCheck[] = [
    {
      phase: "verifier",
      ok: referenceId > 0,
      code: referenceId > 0 ? "reference_resume.id_present" : "reference_resume.id_missing",
      message: "Reference resume id is present after save.",
    },
    {
      phase: "verifier",
      ok: readBackProjection.id === referenceId,
      code: readBackProjection.id === referenceId ? "reference_resume.read_back_id_match" : "reference_resume.read_back_id_mismatch",
      message: "Read-back reference resume id matches the saved id.",
    },
    {
      phase: "verifier",
      ok: readBackProjection.roleCategory === expectedProjection.roleCategory,
      code: readBackProjection.roleCategory === expectedProjection.roleCategory ? "reference_resume.role_match" : "reference_resume.role_mismatch",
      message: "Read-back role category matches the requested category.",
    },
  ];
  const verifiedAction = readBack
    ? buildVerifiedActionSuccess({
        action: "save_reference_resume",
        targetType: "reference_resume",
        targetId: referenceId,
        data,
        expectedContent: expectedProjection,
        readBackContent: readBackProjection,
        checks,
      })
    : buildVerifiedActionFailure({
        action: "save_reference_resume",
        targetType: "reference_resume",
        error: readBackError || "Reference resume read-back failed",
        checks,
        data,
      });

  if (!verifiedAction.success) {
    return {
      success: false,
      data,
      error: `保存优秀简历后读回校验失败：${verifiedAction.error || readBackError || "read-back mismatch"}`,
      errorCategory: "permanent",
      verifiedAction,
      uiPayload: { ...data, readBackVerified: false, readBackError: verifiedAction.error || readBackError },
      rawData: data,
    };
  }

  const verifiedData = { ...data, readBackVerified: true };
  return {
    success: true,
    data: verifiedData,
    llmSummary: [
      `优秀简历已保存：${data.name || input.name || "未命名"}`,
      `岗位方向：${data.roleCategory || roleCategory}`,
      `可见性：${data.visibility || input.visibility || "private"}`,
      `质量分：${typeof data.qualityScore === "number" ? data.qualityScore.toFixed(2) : "unknown"}`,
      data.indexing ? `索引：${data.indexing.status} (${data.indexing.embedded || 0}/${data.indexing.chunks || 0})` : "",
      data.patternMemory ? `模式记忆：${data.patternMemory.status} (${data.patternMemory.persisted || 0}/${data.patternMemory.extracted || 0})` : "",
    ].filter(Boolean).join("\n"),
    uiPayload: verifiedData,
    rawData: verifiedData,
    verifiedAction,
    errorCategory: "ok",
  };
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `保存优秀简历失败：${result.error}`;
  return result.llmSummary || "优秀简历已保存。";
}

export const saveReferenceResume: ToolDefinition = {
  name: "save_reference_resume",
  description: "将用户上传、粘贴或识别出的优秀简历保存到参考简历库。保存前必须确认岗位方向；可选择 private 私有或 team 局域网共享。",
  matchHints: [
    "保存优秀简历",
    "保存成参考简历",
    "沉淀简历样本",
    "优秀简历库",
    "AI产品经理优秀简历",
    "AI运营优秀简历",
    "AI售前优秀简历",
  ],
  parameters: {
    resume_text: { type: "string", required: true, description: "完整简历文本，来自用户粘贴、文件解析或图片识别结果。" },
    role_category: { type: "string", required: true, description: "岗位方向，例如 AI产品经理/AI运营/AI售前/数据产品经理。" },
    visibility: { type: "string", required: false, description: "private 或 team；team 会进入局域网共享库，非管理员默认待审核。" },
    name: { type: "string", required: false, description: "参考简历名称。" },
    tags: { type: "array", required: false, description: "补充标签。" },
    notes: { type: "string", required: false, description: "保存备注。" },
  },
  category: "action",
  handler,
  formatResult,
};
