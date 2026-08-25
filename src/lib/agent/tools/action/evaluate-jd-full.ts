import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";
import type { ImageIntakeResult } from "@/lib/agent/image-intake";
import { fetchAgentMemoryContext } from "../memory-helpers";
import {
  DurableJDEvaluationInputError,
  runDurableJDEvaluation,
} from "@/lib/server/durable-jd-evaluation";

interface EvalJDFullParams {
  jd_text?: string;
  jd_url?: string;
  cv_text?: string;
  target_company?: string;
  images?: string[];
  allow_web_search?: boolean;
  language?: "zh" | "en";
}

function apiPath(path: string): string {
  return typeof window === "undefined" ? `http://localhost:3000${path}` : path;
}

async function getLatestJDText(): Promise<string> {
  try {
    const res = await fetch(apiPath("/api/data/jds"));
    const json = await res.json();
    const latest = Array.isArray(json.data) ? json.data[0] : null;
    return typeof latest?.body === "string" ? latest.body : "";
  } catch {
    return "";
  }
}

function usableOCRBody(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/【缺失】/g, "").trim();
  if (text.length < 40) return "";
  if (/达到处理上限|重新提问|上传了\s*JD\s*截图|马上帮你评估|评估过程遇到/.test(text)) return "";
  return text;
}

function looksLikeJDText(text: string): boolean {
  return /(岗位|职位|职责|任职|要求|招聘|JD|job description)/i.test(text);
}

async function extractJDFromImages(images: string[]): Promise<{
  jdText: string;
  company: string;
  role: string;
  errors: string[];
}> {
  const bodies: string[] = [];
  const errors: string[] = [];
  let company = "";
  let role = "";

  for (let i = 0; i < Math.min(images.length, 5); i++) {
    try {
      const res = await fetch("/api/agent/image-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [images[i]], preferredDocumentType: "jd" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        errors.push(`第 ${i + 1} 张：${json.error || `image intake HTTP ${res.status}`}`);
        continue;
      }

      const data = json.data as ImageIntakeResult | undefined;
      if (!data) {
        errors.push(`第 ${i + 1} 张：image intake 返回为空`);
        continue;
      }

      const rawBody = usableOCRBody(data.structured?.body || data.extractedText);
      if (data.documentType !== "jd" && !(data.documentType === "unknown" && rawBody && looksLikeJDText(rawBody))) {
        errors.push(`第 ${i + 1} 张：${data.reason || "图片不像 JD"}`);
        continue;
      }

      const body = usableOCRBody(data.structured?.body || data.extractedText);
      if (!body) {
        errors.push(`第 ${i + 1} 张：未识别到有效 JD 正文`);
        continue;
      }

      bodies.push(body);
      const structured = (data.structured || {}) as Record<string, unknown>;
      if (!company && typeof structured.company === "string" && structured.company.trim()) company = structured.company;
      if (!company && typeof structured.target_company === "string" && structured.target_company.trim()) company = structured.target_company;
      if (!role && typeof structured.role === "string" && structured.role.trim()) role = structured.role;
    } catch (err) {
      errors.push(`第 ${i + 1} 张：${err instanceof Error ? err.message : "image intake 调用失败"}`);
    }
  }

  return { jdText: bodies.join("\n\n---\n\n"), company, role, errors };
}

async function legacyHandler(params: Record<string, unknown>): Promise<ToolResult> {
  const { jd_url, cv_text, target_company, images, allow_web_search } = params as EvalJDFullParams;
  let jdText = (params as EvalJDFullParams).jd_text || "";
  let targetCompany = target_company || "";
  let imagesForStream = Array.isArray(images) ? images : [];

  if (jdText.trim()) {
    imagesForStream = [];
  }

  if (!jdText.trim() && imagesForStream.length > 0) {
    const extracted = await extractJDFromImages(imagesForStream);
    if (extracted.jdText.trim()) {
      jdText = extracted.jdText;
      if (!targetCompany && extracted.company) targetCompany = extracted.company;
      imagesForStream = [];
    } else {
      return {
        success: false,
        data: null,
        error: `未能从截图中提取到有效 JD 文本${extracted.errors.length ? `（${extracted.errors.slice(0, 2).join("；")}）` : ""}`,
        errorCategory: "need_user_input",
        llmSummary: "截图识别没有提取到有效 JD 正文。请让用户上传更清晰的原始 JD 截图，或直接粘贴 JD 文本/链接。",
      };
    }
  }

  if (!jdText.trim() && !jd_url && imagesForStream.length === 0) {
    jdText = await getLatestJDText();
  }

  if (!jdText.trim() && !jd_url && imagesForStream.length === 0) {
    return {
      success: false,
      data: null,
      error: "缺少 JD 文本、链接或截图，也没有找到最近保存的 JD",
      errorCategory: "need_user_input",
      llmSummary: "没有可评估的 JD。请让用户粘贴 JD 正文、上传截图，或先保存一份 JD。",
    };
  }

  // Delegate to streaming evaluate API — handler returns the stream,
  // client-runner reads it and yields events through the generator
  const memoryContext = await fetchAgentMemoryContext({
    task: "jd_evaluation",
    agentId: "evaluate",
    query: `${targetCompany || ""}\n${jdText.slice(0, 1200)}`,
    budgetChars: 1200,
    semanticTopK: 5,
  });
  const cvTextWithMemory = [
    cv_text || "",
    memoryContext?.llmSummary ? `Long-term memory context:\n${memoryContext.llmSummary}` : "",
  ].filter(Boolean).join("\n\n");

  const res = await fetch("/api/evaluate/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jdText,
      jdUrl: jd_url || "",
      cvText: cvTextWithMemory,
      targetCompany,
      images: imagesForStream,
      allowWebSearch: allow_web_search === true,
      memoryContext: memoryContext?.llmSummary || "",
    }),
  });

  if (!res.ok) {
    return {
      success: false,
      data: null,
      error: `评估管道启动失败: HTTP ${res.status}`,
      recoverable: true,
      retryHint: "评估 API 暂时不可用，请稍后重试",
    };
  }

  // Stream Delegation: return the ReadableStream for client-runner to read
  return {
    success: true,
    data: { _stream: res.body },
    _streaming: true,
  };
}

async function handler(
  params: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  if (!context) return legacyHandler(params);
  const input = params as EvalJDFullParams;
  try {
    const result = await runDurableJDEvaluation(context.principal, {
      jdText: input.jd_text || "",
      jdUrl: input.jd_url || "",
      cvText: input.cv_text || "",
      targetCompany: input.target_company || "",
      images: Array.isArray(input.images) ? input.images : [],
      allowWebSearch: input.allow_web_search === true,
      language: input.language === "en" ? "en" : "zh",
    }, { signal: context.signal });
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "JD 评估失败";
    if (error instanceof DurableJDEvaluationInputError) {
      return {
        success: false,
        data: null,
        error: message,
        errorCategory: "need_user_input",
        recoverable: false,
        llmSummary: `${message}。请让用户补充完整 JD 文本、公开链接或清晰截图。`,
      };
    }
    return {
      success: false,
      data: null,
      error: message,
      errorCategory: "transient",
      recoverable: true,
      retryHint: "评估运行中断，Runtime 将根据持久化证据重试或恢复",
      rawData: { dispatchState: "unknown" },
    };
  }
}

function formatResult(result: ToolResult): string {
  if (!result.success) return `评估失败: ${result.error}`;
  const d = result.data as Record<string, unknown>;
  const risks = (d.risks as Array<{ signal: string; excerpt?: string; severity: string }>) || [];
  const riskSummary = risks.length > 0
    ? risks.slice(0, 3).map((r) => `${r.severity === "critical" ? "严重" : r.severity === "high" ? "高风险" : "中风险"}：${r.signal}`).join("；")
    : "未检测到明显风险信号";

  const blocks = (d.blocks || {}) as Record<string, { content: string; score: number }>;
  const scoreLine = Object.entries(blocks)
    .map(([k, b]) => `${k.toUpperCase()}:${b?.score || "-"}`)
    .join(" ");

  const keywordList = (d.keywords as string[])?.length
    ? (d.keywords as string[]).slice(0, 8).join("、")
    : "无";

  return `评估已完成：${d.company} - ${d.role}
总分：${d.overallScore}/5；类型：${d.archetype || "未识别"}；报告编号：${d.reportNum || "已保存"}
关键词：${keywordList}
风险摘要：${riskSummary}
板块分数：${scoreLine}

请只给用户一个聊天摘要，不要输出完整 A-G 报告正文，不要输出大表格。
摘要最多 6 行：
1. 结论：投/谨慎/不投 + 一句话原因
2. 主要风险：最多 2 条
3. 最该确认的问题：最多 2 条
4. 下一步：提示可去报告库或 JD 管理打开报告详情，也可下载 PDF。`;
}

export const evaluateJDFull: ToolDefinition = {
  name: "evaluate_jd_full",
  description: "对 JD 进行完整评估：风险信号检测 + A-G 7 维评分 + 生成结构化报告 + 写入追踪数据库。当用户说'评估这个JD''看看这个职位'时调用此工具。支持截图上传（images参数传base64数组）。",
  parameters: {
    jd_text: { type: "string", required: false, description: "JD 完整文本，至少 50 字符" },
    jd_url: { type: "string", required: false, description: "JD 链接 URL，工具会自动抓取内容" },
    cv_text: { type: "string", required: false, description: "用户简历文本。用户要求结合简历时，先用 read_file(path='我的简历') 读取后传入。" },
    target_company: { type: "string", required: false, description: "用户在对话中补充的目标公司名。即使 JD 正文没有公司名，也要传入，例如'字节跳动'。" },
    images: { type: "array", required: false, description: "JD 截图 base64 数组" },
    allow_web_search: { type: "boolean", required: false, description: "是否允许评估流程联网查薪资/公开信息。默认 false；只有用户明确要求联网查询时才设 true。" },
    language: { type: "string", required: false, description: "语言: zh/en，默认 zh" },
    archetype: { type: "string", required: false, description: "覆盖自动检测的 archetype，如 'AI产品经理'" },
  },
  category: "action",
  handler,
  formatResult,
  toolCtxCap: 900,
};
