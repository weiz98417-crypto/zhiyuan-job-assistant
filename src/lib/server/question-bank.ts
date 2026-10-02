/**
 * 面试题库与出题引擎（Spec 27 / ADR-0044）。
 *
 * 深接口：composeInterview(岗位族×轮次×难度 + 简历/JD 上下文) → 带出处标签的题目卡。
 * 内部 = SQL 过滤 → pgvector 语义召回（可用时）→ LLM 定制改写。
 * 调用方（面试教练、JD 评估 B 板块、岗位精选点评）只见这一个接口。
 * Postgres-only（2026-10-03 决策）：SQLite 模式不建表、不降级，调用方回落 LLM 直出。
 * 出题协议（出题顺序/项目深挖七层等完整问题地图）留待题库有真实使用数据后迭代。
 */
import { loadRegistryText } from "@/lib/agent/knowledge/registry/loader";

export interface QuestionCard extends ComposedQuestion {
  category: string;
  context: string;
  storyHint: string;
}

export interface ComposedQuestion {
  question: string;
  source: "bank" | "jd" | "weakness" | "general";
  provenance: string;
}

export interface BankQuestionRow {
  id: number;
  question: string;
  topic: string;
  family: string;
  phase: string;
  difficulty: string;
  provenance: string;
  provenanceDetail: string;
  answerPoints: string;
}

export interface BankQuery {
  family?: string;
  phase?: string;
  difficulty?: string;
  limit?: number;
  excludeQuestions?: string[];
}

export interface QuestionBankStore {
  queryCandidates(query: BankQuery): Promise<BankQuestionRow[]>;
  /** 可用性探针：pgvector/表就绪才返回 true；SQLite/未初始化返回 false。 */
  isAvailable(): Promise<boolean>;
}

export interface ComposeInterviewInput {
  family?: string;
  phase?: string;
  difficulty?: string;
  count?: number;
  company?: string;
  role?: string;
  jdText?: string;
  cvText?: string;
  memorySummary?: string;
  recentQuestions?: string[];
  signal?: AbortSignal;
}

export interface ComposeInterviewResult {
  questions: ComposedQuestion[];
  bankUsed: number;
  bankUnavailable?: string;
}

/** 出题协议 LLM 注入点（与 model-gateway complete 同形）。 */
export type BankCompletion = (request: {
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}) => Promise<{ text: string }>;

/** Postgres 题库 store：SQL 过滤（family×phase×difficulty + 去重）。向量召回列已建，召回排序随种子规模开启。 */
export function createPostgresQuestionBankStore(): QuestionBankStore {
  return {
    async isAvailable() {
      try {
        const { getDatabaseDriver, isPostgresConfigured } = await import("@/lib/postgres");
        if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return false;
        const pool = getPool();
        const result = await pool.query("SELECT 1 FROM interview_questions LIMIT 1");
        return result.rowCount !== null;
      } catch {
        return false;
      }
    },
    async queryCandidates(query) {
      const pool = getPool();
      const params: unknown[] = [];
      const conditions: string[] = [];
      if (query.family) { params.push(query.family); conditions.push(`family = $${params.length}`); }
      if (query.phase) { params.push(query.phase); conditions.push(`phase = $${params.length}`); }
      if (query.difficulty) { params.push(query.difficulty); conditions.push(`difficulty = $${params.length}`); }
      const excluded = (query.excludeQuestions || []).filter(Boolean);
      if (excluded.length > 0) {
        params.push(excluded);
        conditions.push(`question <> ALL($${params.length})`);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(Math.max(1, Math.min(query.limit || 8, 24)));
      const result = await pool.query(
        `SELECT id, question, topic, family, phase, difficulty, provenance, provenance_detail, answer_points
         FROM interview_questions ${whereClause}
         ORDER BY random() LIMIT $${params.length}`,
        params,
      );
      return result.rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        question: String(row.question),
        topic: String(row.topic || ""),
        family: String(row.family || ""),
        phase: String(row.phase || ""),
        difficulty: String(row.difficulty || ""),
        provenance: String(row.provenance || "generated_seed"),
        provenanceDetail: String(row.provenance_detail || ""),
        answerPoints: String(row.answer_points || ""),
      }));
    },
  };
}

import type { Pool } from "pg";
let poolOverride: Pool | null = null;
function getPool(): Pool {
  if (poolOverride) return poolOverride;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = require("@/lib/postgres") as typeof import("@/lib/postgres");
  return postgres.getPostgresPool();
}

/** 测试专用：注入 pool。 */
export function setQuestionBankPoolForTests(pool: Pool | null): void {
  poolOverride = pool;
}

function buildBankSection(candidates: BankQuestionRow[]): string {
  if (candidates.length === 0) return "题库暂无命中（可出通用题）。";
  const lines = candidates.map((row, index) =>
    `${index + 1}. [${row.provenance}${row.provenanceDetail ? `:${row.provenanceDetail}` : ""}] ${row.question}\n   考查点：${row.topic}${row.answerPoints ? `\n   答案要点：${row.answerPoints.slice(0, 200)}` : ""}`);
  return `候选题目材料（题库命中，改编优先、保真出处）：\n${lines.join("\n")}`;
}

function parseComposeJson(text: string): Record<string, unknown> {
  const normalized = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const parsed = JSON.parse(normalized) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    const match = normalized.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
}

/**
 * 出题引擎深接口。题库可用时：SQL 过滤候选 → LLM 改写（出处标签透传）；
 * 题库不可用/为空：返回空 questions，调用方回落 LLM 直出路径（generateInterviewQuestionsForAgent）。
 */
export async function composeInterview(
  input: ComposeInterviewInput,
  options: { store?: QuestionBankStore; completion?: BankCompletion } = {},
): Promise<ComposeInterviewResult> {
  const store = options.store || createPostgresQuestionBankStore();
  let available = false;
  let bankUnavailable: string | undefined;
  try {
    available = await store.isAvailable();
    if (!available) bankUnavailable = "postgres_unavailable";
  } catch (error) {
    bankUnavailable = error instanceof Error ? error.message : String(error);
  }
  if (!available) return { questions: [], bankUsed: 0, bankUnavailable };

  const candidates = await store.queryCandidates({
    family: input.family,
    phase: input.phase,
    difficulty: input.difficulty,
    limit: Math.max((input.count || 1) * 3, 6),
    excludeQuestions: input.recentQuestions,
  });
  if (candidates.length === 0) return { questions: [], bankUsed: 0, bankUnavailable: "bank_empty" };

  const systemPrompt = loadRegistryText("prompt.interview-question-generation")
    .replace("{{MODE_LABEL}}", "模拟面试")
    .replace("{{MODE_STRUCTURE}}", "题目 → 追问 → 评分")
    .replace("{{COUNT}}", String(input.count || 1))
    .replace("{{CATEGORY_RULE}}", "")
    .replace("{{BANK_SECTION}}", buildBankSection(candidates));

  const userContent = [
    input.company ? `公司：${input.company}` : "",
    input.role ? `岗位：${input.role}` : "",
    input.jdText ? `JD：${input.jdText.slice(0, 2000)}` : "",
    input.cvText ? `简历：${input.cvText.slice(0, 1500)}` : "",
    input.memorySummary ? `长期记忆：${input.memorySummary}` : "",
    input.recentQuestions?.length ? `已出题目（勿重复）：\n${input.recentQuestions.slice(-6).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  let parsed: Record<string, unknown> = {};
  try {
    if (options.completion) {
      const result = await options.completion({ messages: [{ role: "user", content: userContent }], systemPrompt, temperature: 0.7, maxTokens: 1800 });
      parsed = parseComposeJson(result.text);
    } else {
      const { llmRetry } = await import("@/lib/llm-retry");
      const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
      const response = await llmRetry("https://api.deepseek.com/chat/completions", apiKey, {
        model: "deepseek-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        retries: 2,
        fallbackModel: "deepseek-flash",
        signal: input.signal,
      });
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      parsed = parseComposeJson(payload.choices?.[0]?.message?.content || "{}");
    }
  } catch {
    return { questions: [], bankUsed: 0, bankUnavailable: "rewrite_llm_failed" };
  }

  // 出处标签保真：LLM 输出必须携带 provenance；缺失的题按 general 兜底（无标签不入结果集的题库语义在此收口）
  const questions: ComposedQuestion[] = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .flatMap((value) => {
      const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
      const question = typeof item.question === "string" ? item.question.trim() : "";
      if (!question) return [];
      const source = ["bank", "jd", "weakness", "general"].includes(String(item.source)) ? String(item.source) as ComposedQuestion["source"] : "general";
      const provenance = typeof item.provenance === "string" && item.provenance.trim() ? item.provenance.trim() : source === "bank" ? findProvenance(question, candidates) : source;
      return [{ question, source, provenance }];
    });
  return { questions, bankUsed: questions.filter((q) => q.source === "bank").length };
}

function findProvenance(question: string, candidates: BankQuestionRow[]): string {
  const hit = candidates.find((row) => row.question === question);
  // 改写题无法回指命中原题时如实标注未验证——宁可诚实标注也不冒充精确出处
  return hit ? hit.provenance : "bank_unverified";
}

/** 题库岗位族 → 现有 CoachMode/phase 的映射辅助：出题引擎消费方使用。 */
export function familyForRole(role?: string): string {
  const lower = (role || "").toLowerCase();
  if (/算法|模型|机器学习|ml|nlp|cv|大模型|llm/.test(lower)) return "ai_algorithm";
  if (/产品|pm|product/.test(lower)) return "ai_product";
  if (/运营|售前|解决方案|solution|pre-?sales|operations/.test(lower)) return "ai_business";
  if (/工程师|开发|后端|前端|架构|software|engineer|dev/.test(lower)) return "tech_general";
  return "general";
}
