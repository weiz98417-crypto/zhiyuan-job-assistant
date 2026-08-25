import { isIP } from "node:net";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import { getAgentReadService } from "@/lib/agent/runtime/agent-read-service";
import { assembleAgentMemoryContext } from "@/lib/agent/memory-context";
import { inspectDocumentImages } from "@/lib/server-image-intake";
import {
  evaluateJobDescription,
  type JDEvaluationInput as ModelEvaluationInput,
  type JDEvaluationResult,
} from "@/lib/server/jd-evaluation-service";
import {
  persistJDEvaluation,
  type PersistJDEvaluationInput,
  type PersistJDEvaluationResult,
} from "@/lib/server/jd-evaluation-persistence";
import { scanJDRisks, type JDRiskSignal } from "@/lib/server/jd-risk-service";

export interface DurableJDEvaluationInput {
  jdText?: string;
  jdUrl?: string;
  cvText?: string;
  targetCompany?: string;
  images?: string[];
  allowWebSearch?: boolean;
  language?: "zh" | "en";
}

export interface DurableJDImageResult {
  jdText: string;
  company: string;
  role: string;
  errors: string[];
}

export interface DurableJDEvaluationAdapters {
  getLatestJd(principal: ExecutionPrincipal): Promise<{ body: string; company: string; role: string } | null>;
  inspectImages(images: string[], signal?: AbortSignal): Promise<DurableJDImageResult>;
  fetchJdUrl(url: string, signal?: AbortSignal): Promise<string>;
  getResumeText(principal: ExecutionPrincipal): Promise<string>;
  getMemoryContext(principal: ExecutionPrincipal, query: string): Promise<string>;
  evaluate(input: ModelEvaluationInput): Promise<JDEvaluationResult>;
  scanRisks(jdText: string): Promise<JDRiskSignal[]>;
  persist(principal: ExecutionPrincipal, input: PersistJDEvaluationInput): Promise<PersistJDEvaluationResult>;
}

export interface DurableJDEvaluationResult extends Omit<JDEvaluationResult, "blocks">, PersistJDEvaluationResult {
  inputSource: "text" | "image" | "url" | "latest_saved_jd";
  jdText: string;
  risks: JDRiskSignal[];
  riskSignals: JDRiskSignal[];
  blocks: Record<string, { content: string; score: number }>;
}

export class DurableJDEvaluationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableJDEvaluationInputError";
  }
}

export async function runDurableJDEvaluation(
  principal: ExecutionPrincipal,
  input: DurableJDEvaluationInput,
  options: { adapters?: DurableJDEvaluationAdapters; signal?: AbortSignal } = {},
): Promise<DurableJDEvaluationResult> {
  const adapters = options.adapters || defaultAdapters;
  const resolved = await resolveJDInput(principal, input, adapters, options.signal);
  if (resolved.jdText.trim().length < 50) {
    throw new DurableJDEvaluationInputError("JD 文本太短，请提供至少 50 字的完整职位描述");
  }
  const [resumeText, memoryContext, risks] = await Promise.all([
    input.cvText?.trim()
      ? Promise.resolve(input.cvText.trim())
      : adapters.getResumeText(principal).catch(() => ""),
    adapters.getMemoryContext(principal, `${resolved.company}\n${resolved.jdText.slice(0, 1200)}`).catch(() => ""),
    adapters.scanRisks(resolved.jdText).catch(() => []),
  ]);
  const cvText = [
    resumeText,
    memoryContext ? `Long-term memory context:\n${memoryContext}` : "",
  ].filter(Boolean).join("\n\n");
  const evaluation = await adapters.evaluate({
    jdText: resolved.jdText,
    cvText,
    targetCompany: input.targetCompany?.trim() || resolved.company,
    language: input.language,
    riskContext: formatRiskContext(risks),
    signal: options.signal,
  });
  const blocks = toPersistedBlocks(evaluation);
  const persistence = await adapters.persist(principal, {
    company: evaluation.company,
    role: evaluation.role,
    overallScore: evaluation.overallScore,
    date: evaluation.date,
    archetype: evaluation.archetype,
    legitimacy: evaluation.legitimacy,
    blocks,
    keywords: evaluation.keywords,
    jdText: resolved.jdText,
  });
  if (!persistence.reportReadBackVerified || !persistence.jdReadBackVerified) {
    throw new Error("JD 评估持久化未通过读回校验");
  }
  return {
    ...evaluation,
    ...persistence,
    blocks,
    inputSource: resolved.source,
    jdText: resolved.jdText,
    risks,
    riskSignals: risks,
  };
}

async function resolveJDInput(
  principal: ExecutionPrincipal,
  input: DurableJDEvaluationInput,
  adapters: DurableJDEvaluationAdapters,
  signal?: AbortSignal,
): Promise<{
  jdText: string;
  company: string;
  role: string;
  source: DurableJDEvaluationResult["inputSource"];
}> {
  if (input.jdText?.trim()) {
    return { jdText: input.jdText.trim(), company: input.targetCompany?.trim() || "", role: "", source: "text" };
  }
  const images = Array.isArray(input.images) ? input.images.filter(Boolean).slice(0, 5) : [];
  if (images.length > 0) {
    const extracted = await adapters.inspectImages(images, signal);
    if (!extracted.jdText.trim()) {
      const details = extracted.errors.slice(0, 2).join("；");
      throw new DurableJDEvaluationInputError(
        `未能从截图中提取到有效 JD 文本${details ? `（${details}）` : ""}`,
      );
    }
    return {
      jdText: extracted.jdText.trim(),
      company: input.targetCompany?.trim() || extracted.company,
      role: extracted.role,
      source: "image",
    };
  }
  if (input.jdUrl?.trim()) {
    return {
      jdText: await adapters.fetchJdUrl(input.jdUrl.trim(), signal),
      company: input.targetCompany?.trim() || "",
      role: "",
      source: "url",
    };
  }
  const latest = await adapters.getLatestJd(principal);
  if (!latest?.body.trim()) {
    throw new DurableJDEvaluationInputError("缺少 JD 文本、链接或截图，也没有找到最近保存的 JD");
  }
  return {
    jdText: latest.body.trim(),
    company: input.targetCompany?.trim() || latest.company,
    role: latest.role,
    source: "latest_saved_jd",
  };
}

const defaultAdapters: DurableJDEvaluationAdapters = {
  async getLatestJd(principal) {
    const latest = (await getAgentReadService().listJds(principal))[0];
    return latest ? { body: latest.body, company: latest.company, role: latest.role } : null;
  },
  async inspectImages(images) {
    const result = await inspectDocumentImages(images, { preferredDocumentType: "jd" });
    const structured = result.structured && typeof result.structured === "object"
      ? result.structured as Record<string, unknown>
      : {};
    const jdText = usableOCRBody(structured.body || result.extractedText);
    const looksLikeJD = result.documentType === "jd"
      || (result.documentType === "unknown" && /(岗位|职位|职责|任职|要求|招聘|JD|job description)/i.test(jdText));
    return {
      jdText: looksLikeJD ? jdText : "",
      company: stringValue(structured.company || structured.target_company),
      role: stringValue(structured.role),
      errors: result.errors || (result.reason ? [result.reason] : []),
    };
  },
  fetchJdUrl: fetchJDTextFromUrl,
  async getResumeText(principal) {
    const resume = await getAgentReadService().getCurrentResume(principal);
    const versions = objectValue(resume.versions);
    const active = objectValue(versions[stringValue(resume.activeVersion)]);
    return arrayValue(active.sections)
      .flatMap((section) => {
        const item = objectValue(section);
        const content = stringValue(item.content);
        return content ? [`【${stringValue(item.title) || stringValue(item.id)}】\n${content}`] : [];
      })
      .join("\n\n");
  },
  async getMemoryContext(principal, query) {
    const context = await assembleAgentMemoryContext({
      userId: principal.userId,
      task: "jd_evaluation",
      agentId: "evaluate",
      query,
      budgetChars: 1200,
      semanticTopK: 5,
    });
    return context.llmSummary || "";
  },
  evaluate: evaluateJobDescription,
  async scanRisks(jdText) {
    return scanJDRisks(jdText);
  },
  persist: persistJDEvaluation,
};

export async function fetchJDTextFromUrl(rawUrl: string, signal?: AbortSignal): Promise<string> {
  const url = assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("JD URL 抓取超时")), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZhiyuanBot/1.0)" },
    });
    if (!response.ok) throw new Error(`无法获取 JD 内容: HTTP ${response.status}`);
    const html = await response.text();
    const cheerio = await import("cheerio");
    const document = cheerio.load(html);
    document("script, style, nav, footer, header").remove();
    const text = document("body").text().replace(/\s+/g, " ").trim().slice(0, 15_000);
    if (text.length < 50) throw new Error("JD URL 未返回足够的职位正文");
    return `URL: ${url.toString()}\n\n${text}`;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function assertPublicHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DurableJDEvaluationInputError("JD 链接必须使用 http 或 https");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateAddress(hostname)) {
    throw new DurableJDEvaluationInputError("JD 链接不能指向本机或内网地址");
  }
  return url;
}

function isPrivateAddress(hostname: string): boolean {
  if (isIP(hostname) === 4) {
    return /^10\.|^127\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  }
  if (isIP(hostname) === 6) {
    return hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");
  }
  return false;
}

function usableOCRBody(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/【缺失】/g, "").trim();
  if (text.length < 40) return "";
  return /达到处理上限|重新提问|上传了\s*JD\s*截图|马上帮你评估|评估过程遇到/.test(text) ? "" : text;
}

function toPersistedBlocks(evaluation: JDEvaluationResult): Record<string, { content: string; score: number }> {
  return Object.fromEntries(
    Object.entries(evaluation.blocks).map(([key, content]) => [
      key,
      {
        content,
        score: key === "g" ? 0 : numberValue(evaluation.scores[key as keyof JDEvaluationResult["scores"]]),
      },
    ]),
  );
}

function formatRiskContext(risks: JDRiskSignal[]): string {
  return risks.map((risk) => `- [${risk.severity}] ${risk.signal}: ${risk.excerpt}`).join("\n");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
