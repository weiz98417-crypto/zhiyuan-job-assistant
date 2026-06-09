import { getDatabaseDriver, isPostgresConfigured, withPostgresClient } from "@/lib/postgres";
import {
  addMemoryEvidence,
  createMemoryItem,
  type MemoryItemRecord,
} from "@/lib/memory/postgres-memory";
import type { ReferenceResumeSection, ReferenceResumeVisibility } from "@/lib/reference-resume-vector";

export const EXCELLENT_RESUME_PATTERN_MEMORY_TYPE = "excellent_resume_pattern";

export interface ExcellentResumePattern {
  canonicalText: string;
  quote: string;
  sectionId: string;
  sectionTitle: string;
  patternKey: string;
  confidence: number;
  importance: number;
  metadata: Record<string, unknown>;
}

export interface PersistExcellentResumePatternResult {
  status: "skipped" | "persisted" | "failed";
  extracted: number;
  persisted: number;
  reason?: string;
}

export interface ExcellentResumePatternMemory {
  id: number;
  canonicalText: string;
  confidence: number;
  importance: number;
  metadata: Record<string, unknown>;
  status?: string;
  feedbackTrustScore?: number;
}

const PATTERN_RULES: Array<{
  key: string;
  section?: RegExp;
  match: RegExp;
  text: string;
  importance: number;
}> = [
  {
    key: "ai_product_technical_loop",
    match: /(RAG|Agent|大模型|LLM|Prompt|提示词|多模态|模型|评测|召回|知识库)/i,
    text: "AI产品经历要写成“业务目标 -> 技术链路 -> 评测/反馈 -> 产品结果”的闭环，而不是只堆技术名词。",
    importance: 0.86,
  },
  {
    key: "metric_result_framing",
    match: /(\d+%|\d+\s*(人|天|周|月|万|次|个)|提升|增长|降低|节省|转化|准确率|效率|留存|月活|DAU|MAU)/i,
    text: "每段经历用可验证指标收束结果，把动作和影响绑定起来，避免只有职责描述没有业务结果。",
    importance: 0.84,
  },
  {
    key: "zero_to_one_delivery",
    match: /(从0到1|0到1|上线|落地|灰度|发布|闭环|端到端|全流程|推进)/i,
    text: "产品落地经历按“从0到1/阶段推进/上线闭环”展开，体现候选人能把方案推进到真实使用。",
    importance: 0.8,
  },
  {
    key: "cross_functional_delivery",
    match: /(跨部门|协作|研发|设计|运营|销售|客户|UAT|PRD|评审|对齐|沟通)/i,
    text: "跨团队项目要写清协作对象、关键交付物和推进机制，让读者看到产品经理的组织推动能力。",
    importance: 0.76,
  },
  {
    key: "data_product_framing",
    match: /(数据产品|BI|指标|看板|SQL|数据分析|数仓|主数据|埋点|画像|经营分析)/i,
    text: "数据产品经历要把数据源、指标体系、分析场景和决策价值连起来，而不是只写做了看板或取数。",
    importance: 0.78,
  },
  {
    key: "project_story_structure",
    section: /(project|项目)/i,
    match: /(.|\n){80,}/,
    text: "项目经历优先采用“背景/目标 -> 关键动作 -> 难点取舍 -> 结果指标”的结构，提升可追问性。",
    importance: 0.72,
  },
  {
    key: "summary_positioning",
    section: /(summary|profile|个人|概述)/i,
    match: /(.|\n){40,}/,
    text: "个人概述用目标岗位定位开头，再压缩呈现能力栈、行业/场景经验和最强成果证据。",
    importance: 0.68,
  },
  {
    key: "skills_grouping",
    section: /(skill|技能)/i,
    match: /(SQL|Python|产品|数据|AI|RAG|Prompt|用户研究|A\/B|Figma|原型)/i,
    text: "技能区按岗位能力簇分组，优先呈现能支撑目标岗位的工具、方法和业务能力。",
    importance: 0.62,
  },
];

const GENERIC_PATTERN_RE = /^(业务|技术|能力|沟通|负责|参与|优秀|灵性|API)$/i;

export function extractExcellentResumePatterns(input: {
  sections: ReferenceResumeSection[];
  rawText?: string;
  roleCategory?: string;
  visibility?: ReferenceResumeVisibility;
  referenceResumeId?: number;
}): ExcellentResumePattern[] {
  const sections = input.sections.length
    ? input.sections
    : [{ id: "raw", title: "Raw resume", content: input.rawText || "" }];
  const patterns = new Map<string, ExcellentResumePattern>();

  for (const section of sections) {
    const content = normalizeText(section.content || "");
    if (content.length < 40) continue;
    const sectionLabel = `${section.id || ""} ${section.title || ""}`;
    for (const rule of PATTERN_RULES) {
      if (rule.section && !rule.section.test(sectionLabel)) continue;
      if (!rule.match.test(content)) continue;
      if (patterns.has(rule.key)) continue;

      const quote = pickEvidenceQuote(content, rule.match);
      if (!passesPatternQualityGate(rule.text, quote)) continue;
      patterns.set(rule.key, {
        canonicalText: rule.text,
        quote,
        sectionId: section.id || "",
        sectionTitle: section.title || section.id || "",
        patternKey: rule.key,
        confidence: quote.length > 80 ? 0.78 : 0.68,
        importance: rule.importance,
        metadata: {
          roleCategory: input.roleCategory || "general",
          visibility: input.visibility || "private",
          referenceResumeId: input.referenceResumeId,
          sectionId: section.id || "",
          sectionTitle: section.title || section.id || "",
          patternKey: rule.key,
        },
      });
    }
  }

  return Array.from(patterns.values())
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8);
}

export async function persistExcellentResumePatternsBestEffort(input: {
  userId: string;
  referenceResumeId: number;
  sections: ReferenceResumeSection[];
  rawText: string;
  roleCategory: string;
  visibility: ReferenceResumeVisibility;
}): Promise<PersistExcellentResumePatternResult> {
  const patterns = extractExcellentResumePatterns({
    sections: input.sections,
    rawText: input.rawText,
    roleCategory: input.roleCategory,
    visibility: input.visibility,
    referenceResumeId: input.referenceResumeId,
  });

  if (patterns.length === 0) {
    return { status: "skipped", extracted: 0, persisted: 0, reason: "No high-quality patterns extracted" };
  }
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) {
    return { status: "skipped", extracted: patterns.length, persisted: 0, reason: "PostgreSQL is not configured" };
  }

  try {
    let persisted = 0;
    for (const pattern of patterns) {
      const id = await createMemoryItem({
        userId: input.userId,
        memoryType: EXCELLENT_RESUME_PATTERN_MEMORY_TYPE,
        canonicalText: pattern.canonicalText,
        status: "candidate",
        confidence: pattern.confidence,
        importance: pattern.importance,
        sourceCount: 1,
        metadata: pattern.metadata,
      });
      await addMemoryEvidence({
        userId: input.userId,
        memoryItemId: id,
        sourceType: "reference_resume",
        sourceId: input.referenceResumeId,
        quote: pattern.quote,
        extractionMethod: "excellent_resume_pattern_rules_v1",
        confidence: pattern.confidence,
        metadata: pattern.metadata,
      });
      persisted += 1;
    }
    return { status: "persisted", extracted: patterns.length, persisted };
  } catch (error) {
    return {
      status: "failed",
      extracted: patterns.length,
      persisted: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function retrieveExcellentResumePatternMemory(input: {
  userId: string;
  roleCategory?: string;
  limit?: number;
}): Promise<ExcellentResumePatternMemory[]> {
  if (getDatabaseDriver() !== "postgres" || !isPostgresConfigured()) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 6, 12));
  const roleCategory = normalizeText(input.roleCategory || "");
  const result = await withPostgresClient(async (client) => client.query(`
    SELECT id, canonical_text, status, confidence, importance, metadata_json
    FROM memory_items
    WHERE memory_type = $1
      AND status = ANY($2::text[])
      AND (user_id = $3 OR metadata_json->>'visibility' = 'team')
      AND (
        $4 = ''
        OR metadata_json->>'roleCategory' = $4
        OR metadata_json->>'roleCategory' = 'general'
        OR COALESCE(metadata_json->>'roleCategory', '') = ''
      )
    ORDER BY importance DESC, confidence DESC, last_seen_at DESC
    LIMIT $5
  `, [EXCELLENT_RESUME_PATTERN_MEMORY_TYPE, ["active"], input.userId, roleCategory, Math.min(limit * 3, 30)]));

  return (result.rows as MemoryItemRecord[])
    .map((row) => {
      const metadata = parseMetadata(row.metadata_json);
      const feedbackTrustScore = readFeedbackTrustScore(metadata);
      return {
        id: Number(row.id),
        canonicalText: String(row.canonical_text || ""),
        status: String(row.status || "candidate"),
        confidence: Number(row.confidence || 0),
        importance: Number(row.importance || 0),
        feedbackTrustScore,
        metadata: {
          ...metadata,
          ranking: {
            confidence: Number(row.confidence || 0),
            importance: Number(row.importance || 0),
            feedbackTrustScore,
          },
        },
      };
    })
    .filter((row) => row.status === "active")
    .filter((row) => row.confidence >= 0.65)
    .filter((row) => row.importance >= 0.55)
    .sort((a, b) => patternRank(b) - patternRank(a))
    .slice(0, limit);
}

function passesPatternQualityGate(pattern: string, quote: string): boolean {
  const normalizedPattern = normalizeText(pattern);
  const normalizedQuote = normalizeText(quote);
  if (normalizedPattern.length < 32 || normalizedQuote.length < 20) return false;
  if (GENERIC_PATTERN_RE.test(normalizedPattern)) return false;
  if (!/[，。；:：,.;]/.test(normalizedPattern)) return false;
  return true;
}

function pickEvidenceQuote(content: string, match: RegExp): string {
  const sentences = content
    .split(/(?<=[。；;.!！?？])|\n+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const picked = sentences.find((sentence) => match.test(sentence) && sentence.length >= 20)
    || sentences.find((sentence) => sentence.length >= 20)
    || content;
  return picked.slice(0, 260);
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function readFeedbackTrustScore(metadata: Record<string, unknown>): number {
  const raw = Number(metadata.feedbackTrustScore);
  if (Number.isFinite(raw)) return Math.max(0, Math.min(1, raw));
  const stats = metadata.feedbackStats && typeof metadata.feedbackStats === "object"
    ? metadata.feedbackStats as Record<string, unknown>
    : {};
  const positive = Math.max(0, Number(stats.positive || 0));
  const negative = Math.max(0, Number(stats.negative || 0));
  const total = positive + negative;
  return total > 0 ? Number(((positive + 1) / (total + 2)).toFixed(4)) : 0.5;
}

function patternRank(pattern: Pick<ExcellentResumePatternMemory, "confidence" | "importance" | "feedbackTrustScore">): number {
  return (pattern.importance * 0.48)
    + (pattern.confidence * 0.38)
    + ((pattern.feedbackTrustScore ?? 0.5) * 0.14);
}
