/**
 * IntentEnvelope — M2 结构化意图路由（ADR：UPGRADE-PLAN 决策 #11）
 *
 * 一次结构化 LLM 调用把用户消息解析为 { primaryTask, constraints,
 * referencedMaterials, confidence }。正则只保留零歧义快路径（"换一批"类）；
 * LLM 低置信 → 返回精确追问，永不正则猜测；LLM 不可用/超时 → 带审计标记的
 * 正则兜底（保证 keyless 环境可用，兜底永远留痕）。
 */
import { complete, getThinkModelChain } from "@/lib/ai/model-gateway";
import type { AgentTaskType } from "@/lib/agent/task-contract";
import type { ImageDocumentType, ImageIntakeResult } from "@/lib/agent/image-intake";
import {
  detectNegatedWriteIntent,
  hasProfileWriteIntent,
  hasReferenceResumeSaveIntent,
  hasResumeWriteIntent,
} from "@/lib/agent/write-intent";
import { inferRequestedTaskFromText } from "@/lib/agent/guided-session-state";

export type IntentWritePolicy = "forbidden" | "proposal_only" | "allowed";

export interface IntentConstraints {
  writePolicy: IntentWritePolicy;
  noProfileWrite: boolean;
  noResumeWrite: boolean;
  noReferenceResumeWrite: boolean;
}

export interface ReferencedMaterial {
  kind: "jd" | "resume" | "offer" | "report" | "profile";
  /** How the user referred to it: "刚才那个" / "JD要求" / explicit id. */
  reference: "explicit" | "anaphoric";
}

export interface IntentEnvelope {
  primaryTask: AgentTaskType | null;
  constraints: IntentConstraints;
  referencedMaterials: ReferencedMaterial[];
  confidence: "high" | "medium" | "low";
  audit: string[];
}

export interface IntentEnvelopeDecision {
  /** Ready to route: use envelope as resolved. */
  kind: "resolved";
  envelope: IntentEnvelope;
  /** LLM answered; regex only supplied fast paths. */
  source: "llm" | "fast_path" | "regex_fallback";
  /** Ask this one precise question instead of routing. */
  clarification?: never;
}

export interface IntentClarification {
  kind: "clarify";
  question: string;
  envelope: IntentEnvelope;
  source: "llm_low_confidence";
}

export type IntentEnvelopeResolution = IntentEnvelopeDecision | IntentClarification;

const TASK_ENUM: readonly AgentTaskType[] = [
  "general_chat",
  "career_positioning_guidance",
  "resume_query",
  "resume_edit",
  "jd_evaluation",
  "offer_evaluation",
  "interview_coaching",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "job_search",
];

const TASK_LABELS: Record<AgentTaskType, string> = {
  general_chat: "通用求职咨询",
  career_positioning_guidance: "职业定位辅导",
  resume_query: "查看/读取简历",
  resume_edit: "修改简历（需提案+批准）",
  jd_evaluation: "JD 评估",
  offer_evaluation: "Offer 评估",
  interview_coaching: "模拟面试",
  profile_update: "更新求职画像",
  reference_resume_save: "保存优秀简历样本",
  file_export: "导出文件",
  job_search: "岗位发现/扫描",
};

/** Zero-ambiguity fast paths. Everything else must go through the LLM envelope. */
interface FastPath {
  name: string;
  test: (content: string) => boolean;
  task: AgentTaskType | null;
}

const FAST_PATHS: FastPath[] = [
  {
    name: "next_batch",
    test: (t) => /(换一批|再来一批|下一批|换几个|换一组)/i.test(t),
    task: "job_search",
  },
];

function emptyConstraints(): IntentConstraints {
  return {
    writePolicy: "allowed",
    noProfileWrite: false,
    noResumeWrite: false,
    noReferenceResumeWrite: false,
  };
}

/** Derive constraints locally — negation detection is deterministic and cheap;
 * the LLM only needs to confirm the primary task. This keeps the PE2E-ROUTE
 * family (constraint-overrides-intent) safe even if the model misses it. */
function deriveConstraints(content: string): IntentConstraints {
  const constraints = emptyConstraints();
  const negated = detectNegatedWriteIntent(content);
  if (negated === "profile") constraints.noProfileWrite = true;
  if (negated === "resume") constraints.noResumeWrite = true;
  if (negated === "reference_resume") constraints.noReferenceResumeWrite = true;
  if (constraints.noProfileWrite || constraints.noResumeWrite || constraints.noReferenceResumeWrite) {
    constraints.writePolicy = hasResumeWriteIntent(content) || hasProfileWriteIntent(content)
      ? "proposal_only"
      : "forbidden";
  }
  return constraints;
}

function deriveMaterials(content: string, imageIntake: ImageIntakeResult | null | undefined): ReferencedMaterial[] {
  const materials: ReferencedMaterial[] = [];
  const documentType = imageIntake?.documentType;
  if (documentType === "jd" || documentType === "offer" || documentType === "resume") {
    materials.push({ kind: documentType, reference: "explicit" });
  }
  if (/(JD|jd|职位|岗位).{0,8}(要求|要求里|提到)/.test(content)) materials.push({ kind: "jd", reference: "anaphoric" });
  if (/(我的|当前|现在|已有).{0,6}(简历|履历|resume|cv)/i.test(content)) materials.push({ kind: "resume", reference: "anaphoric" });
  if (/(刚才|上一个|之前).{0,8}(报告|评估|JD|jd)/.test(content)) materials.push({ kind: "report", reference: "anaphoric" });
  return materials;
}

function buildClassifierPrompt(content: string): string {
  const taskList = TASK_ENUM.map((task) => `- ${task}：${TASK_LABELS[task]}`).join("\n");
  return `你是求职助手的意图解析器。判断用户消息的主任务。只输出 JSON，不要输出其他字符。

## 任务枚举
${taskList}

## 判断规则
- 先找用户想完成的主任务。"不要/不用 X" 是执行约束，不是主任务：用户说"不要更新画像，帮我做职业定位"→ primaryTask 是 career_positioning_guidance，画像写入约束由系统单独处理。
- 引用材料里的词不是主任务："这个JD需要考代码吗"发生在面试里 → primaryTask 仍是 interview_coaching，JD 只是材料。
- 看简历内容 → resume_query；要改简历 → resume_edit；评估岗位 → jd_evaluation；比较/分析录用条件 → offer_evaluation；找新岗位 → job_search；更新画像内容 → profile_update；保存别人的简历做参考 → reference_resume_save；导出/下载 → file_export；都不是 → general_chat。
- 只在两个以上任务都可能且无法排序时才用 low；一般情况用 high 或 medium。

## 用户消息
"${content.replace(/"/g, "'")}"

输出格式：
{"primaryTask":"<枚举值>","confidence":"high|medium|low"}`;
}

interface RawIntent {
  primaryTask?: unknown;
  confidence?: unknown;
}

function parseRawIntent(raw: string): { primaryTask: AgentTaskType | null; confidence: "high" | "medium" | "low" } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as RawIntent;
    const task = typeof parsed.primaryTask === "string" && (TASK_ENUM as readonly string[]).includes(parsed.primaryTask)
      ? parsed.primaryTask as AgentTaskType
      : null;
    const confidence = parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
      ? parsed.confidence
      : "low";
    return { primaryTask: task, confidence };
  } catch {
    return null;
  }
}

const CLARIFY_QUESTION = "你想让我帮你做哪一件事？（比如：评估这个 JD / 修改简历 / 模拟面试 / 找岗位）";

/**
 * Resolve the intent envelope for a user turn.
 * - Zero-ambiguity fast paths answer immediately.
 * - Otherwise one structured LLM call decides the primary task.
 * - Low confidence (model unsure) → clarification, never a regex guess.
 * - LLM unavailable/timeout → audited regex fallback so keyless environments
 *   keep working (fallback is always recorded in the audit trail).
 */
export async function resolveIntentEnvelope(input: {
  content: string;
  agentId?: string;
  imageIntake?: ImageIntakeResult | null;
  preferredDocumentType?: ImageDocumentType;
  forcedAgentId?: string;
}): Promise<IntentEnvelopeResolution> {
  const { content } = input;
  const audit: string[] = [];

  for (const fast of FAST_PATHS) {
    if (fast.test(content)) {
      audit.push(`envelope.fast_path:${fast.name}`);
      return {
        kind: "resolved",
        source: "fast_path",
        envelope: {
          primaryTask: fast.task,
          constraints: deriveConstraints(content),
          referencedMaterials: deriveMaterials(content, input.imageIntake),
          confidence: "high",
          audit,
        },
      };
    }
  }

  let llmTask: AgentTaskType | null = null;
  let llmConfidence: "high" | "medium" | "low" | null = null;
  try {
    const result = await complete({
      messages: [{ role: "user", content: buildClassifierPrompt(content) }],
      temperature: 0.1,
      maxTokens: 512,
      stream: false,
      chain: getThinkModelChain(),
      timeoutMs: 8_000,
    });
    const parsed = parseRawIntent(result.text);
    if (parsed) {
      llmTask = parsed.primaryTask;
      llmConfidence = parsed.confidence;
      audit.push(`envelope.llm:${parsed.primaryTask}:${parsed.confidence}:model=${result.modelUsed}`);
    } else {
      audit.push("envelope.llm_unparseable");
    }
  } catch (err) {
    audit.push(`envelope.llm_unavailable:${err instanceof Error ? err.message.slice(0, 60) : "error"}`);
  }

  if (llmConfidence === "low" || (llmConfidence !== null && !llmTask)) {
    return {
      kind: "clarify",
      question: CLARIFY_QUESTION,
      source: "llm_low_confidence",
      envelope: {
        primaryTask: null,
        constraints: deriveConstraints(content),
        referencedMaterials: deriveMaterials(content, input.imageIntake),
        confidence: "low",
        audit,
      },
    };
  }

  if (llmTask) {
    return {
      kind: "resolved",
      source: "llm",
      envelope: {
        primaryTask: llmTask,
        constraints: deriveConstraints(content),
        referencedMaterials: deriveMaterials(content, input.imageIntake),
        confidence: llmConfidence === "medium" ? "medium" : "high",
        audit,
      },
    };
  }

  // LLM unavailable → audited deterministic fallback.
  const fallbackTask = fallbackIntent(content, input);
  audit.push(`envelope.regex_fallback:${fallbackTask || "null"}`);
  return {
    kind: "resolved",
    source: "regex_fallback",
    envelope: {
      primaryTask: fallbackTask,
      constraints: deriveConstraints(content),
      referencedMaterials: deriveMaterials(content, input.imageIntake),
      confidence: "medium",
      audit,
    },
  };
}

/** Deterministic fallback: the audited regex chain, constraint-aware. */
function fallbackIntent(
  content: string,
  input: { agentId?: string; imageIntake?: ImageIntakeResult | null; preferredDocumentType?: ImageDocumentType; forcedAgentId?: string },
): AgentTaskType | null {
  const constraints = deriveConstraints(content);
  const documentType = input.imageIntake?.documentType || input.preferredDocumentType;

  if (constraints.noProfileWrite || constraints.noResumeWrite || constraints.noReferenceResumeWrite) {
    // Negated-write turns: keep the user's primary goal, never flip to a write task.
    const requested = inferRequestedTaskFromText(content);
    if (requested && !taskIsWriteTask(requested, constraints)) return requested;
    if (/(定位|方向|迷茫|适合做什么)/.test(content)) return "career_positioning_guidance";
    if (constraints.noResumeWrite) return "resume_query";
    if (constraints.noProfileWrite) return "career_positioning_guidance";
    return "general_chat";
  }

  if (hasReferenceResumeSaveIntent(content)) return "reference_resume_save";
  const requested = inferRequestedTaskFromText(content);
  if (requested) return requested;
  if (/(岗位发现|职位搜索|找岗位|找职位|搜岗位|找工作|推荐岗位)/i.test(content)) return "job_search";
  if (input.agentId === "evaluate" || documentType === "jd") return "jd_evaluation";
  if (input.agentId === "offer" || documentType === "offer") return "offer_evaluation";
  if (input.agentId === "interview") return "interview_coaching";
  if (input.agentId === "resume" || documentType === "resume") {
    if (/\b(pdf|download|export|markdown|md|导出|下载)\b/i.test(content)) return "file_export";
    return hasResumeWriteIntent(content) ? "resume_edit" : "resume_query";
  }
  if (input.agentId === "profile") return hasProfileWriteIntent(content) ? "profile_update" : "general_chat";
  return "general_chat";
}

function taskIsWriteTask(task: AgentTaskType, constraints: IntentConstraints): boolean {
  if (task === "profile_update" && constraints.noProfileWrite) return true;
  if (task === "resume_edit" && constraints.noResumeWrite) return true;
  if (task === "reference_resume_save" && constraints.noReferenceResumeWrite) return true;
  return false;
}
