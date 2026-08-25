import fs from "node:fs";
import path from "node:path";
import { llmRetry } from "@/lib/llm-retry";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";

export interface JDEvaluationUserProfile {
  superpowers: string[];
  headline: string;
  exitStory: string;
  targetRoles: Array<{ name: string; fit: string }>;
}

export interface JDEvaluationInput {
  jdText: string;
  language?: "zh" | "en";
  cvText?: string;
  userProfile?: JDEvaluationUserProfile;
  targetCompany?: string;
  riskContext?: string;
  signal?: AbortSignal;
}

export interface JDEvaluationResult {
  date: string;
  company: string;
  role: string;
  archetype: string;
  overallScore: number;
  legitimacy: string;
  blocks: Record<string, string>;
  scores: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    g: string;
  };
  keywords: string[];
  keywordCoverage?: { overall: number; items: Array<{ keyword: string; status: string }> };
  skillGaps?: Array<{ skill: string; importance: string; substitution: string }>;
  levelMatch?: { level: string; match: string; note: string };
  differentiationTips?: Array<{ jdEmphasis: string; resumeWeakness: string; tip: string }>;
  fullMarkdown: string;
}

export interface JDEvaluationCompletionAdapter {
  complete(input: {
    systemPrompt: string;
    userContent: string;
    signal?: AbortSignal;
  }): Promise<string>;
}

export async function evaluateJobDescription(
  input: JDEvaluationInput,
  options: { completion?: JDEvaluationCompletionAdapter } = {},
): Promise<JDEvaluationResult> {
  if (input.jdText.trim().length < 50) {
    throw new Error("JD 文本太短，请粘贴完整的职位描述（至少 50 字）");
  }
  const language = input.language === "en" ? "en" : "zh";
  const completion = options.completion || createDefaultCompletionAdapter();
  const content = await completion.complete({
    systemPrompt: buildSystemPrompt(language, input.riskContext),
    userContent: buildUserContent(input, language),
    signal: input.signal,
  });
  const parsed = parseCompletion(content);
  return normalizeEvaluation(parsed, content, input.targetCompany);
}

function createDefaultCompletionAdapter(): JDEvaluationCompletionAdapter {
  return {
    async complete(input) {
      const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY 环境变量");
      const response = await llmRetry(DEEPSEEK_API_URL, apiKey, {
        model: process.env.DEEPSEEK_EVALUATION_MODEL?.trim() || DEFAULT_MODEL,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userContent },
        ],
        temperature: 0.3,
        max_tokens: 12_000,
        response_format: { type: "json_object" },
        retries: 2,
        fallbackModel: process.env.DEEPSEEK_FALLBACK_MODEL,
        signal: input.signal,
      });
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("AI 返回为空");
      return content;
    },
  };
}

function buildSystemPrompt(language: "zh" | "en", riskContext = ""): string {
  const systemContext = loadModeContext(language);
  const schema = `{
  "company": "公司名称", "role": "岗位名称", "archetype": "岗位类型",
  "overallScore": 4.2, "legitimacy": "真实/疑似/不确定",
  "scores": { "a": 4, "b": 4, "c": 4, "d": 4, "e": 4, "f": 4, "g": "真实" },
  "blocks": { "a": "markdown", "b": "markdown", "c": "markdown", "d": "markdown", "e": "markdown", "f": "markdown", "g": "markdown" },
  "keywords": ["关键词"],
  "keywordCoverage": { "overall": 65, "items": [{ "keyword": "Python", "status": "covered/missing/weak" }] },
  "skillGaps": [{ "skill": "Kubernetes", "importance": "required", "substitution": "替代证据" }],
  "levelMatch": { "level": "P6-P7", "match": "match", "note": "说明" },
  "differentiationTips": [{ "jdEmphasis": "JD重点", "resumeWeakness": "简历弱点", "tip": "建议" }]
}`;
  const riskSection = riskContext.trim()
    ? `\n\n已检测风险信号（必须在 G 板块引用，不能凭空扩大）：\n${riskContext.trim()}`
    : "";
  if (language === "en") {
    return `You are an AI job-search evaluation engine. Follow the project rules below and return JSON only. Evaluate role overview, CV match, seniority, compensation, tailoring, interview preparation, and legitimacy. Scores A-F are numbers from 0 to 5; G is qualitative.\n\n${systemContext}${riskSection}\n\nReturn exactly this shape:\n${schema}`;
  }
  return `你是 AI 求职评估引擎。遵循以下项目规则，对职位概览、简历匹配、职级策略、薪资市场、定制方案、面试准备和职位合法性进行完整评估。只返回 JSON。A-F 为 0-5 分，G 为定性结论。\n\n${systemContext}${riskSection}\n\n严格返回以下结构：\n${schema}`;
}

function loadModeContext(language: "zh" | "en"): string {
  const modesDir = language === "en"
    ? path.join(process.cwd(), "modes")
    : path.join(process.cwd(), "modes", "zh");
  const files = [
    path.join(modesDir, "_shared.md"),
    path.join(modesDir, language === "en" ? "oferta.md" : "jianzhi.md"),
    path.join(modesDir, "_profile.md"),
  ];
  return files
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n\n");
}

function buildUserContent(input: JDEvaluationInput, language: "zh" | "en"): string {
  const profile = input.userProfile;
  const profileText = profile
    ? language === "en"
      ? `Candidate profile — Skills: ${profile.superpowers.join(", ") || "N/A"}. Headline: ${profile.headline || "N/A"}. Story: ${profile.exitStory || "N/A"}. Target roles: ${profile.targetRoles.map((role) => role.name).join(", ") || "N/A"}.`
      : `求职者信息 — 技能: ${profile.superpowers.join("、") || "未知"}。头衔: ${profile.headline || "未知"}。职业故事: ${profile.exitStory || "未知"}。目标方向: ${profile.targetRoles.map((role) => role.name).join("、") || "未知"}。`
    : "";
  const resumeText = input.cvText?.trim()
    ? language === "en"
      ? `Candidate CV:\n${input.cvText.trim()}`
      : `候选人完整简历：\n${input.cvText.trim()}`
    : language === "en"
      ? "No CV is available. Set Block B score to 0 and explain that CV evidence is required."
      : "没有简历数据。Block B 评分设为 0，并说明需要简历证据。";
  const companyText = input.targetCompany?.trim()
    ? language === "en" ? `User-confirmed company: ${input.targetCompany.trim()}` : `用户确认的目标公司：${input.targetCompany.trim()}`
    : "";
  const instruction = language === "en" ? "Evaluate this job description:" : "请评估以下职位描述：";
  return [profileText, resumeText, companyText, `${instruction}\n\n${input.jdText}`].filter(Boolean).join("\n\n");
}

function parseCompletion(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!jsonMatch) throw new Error("AI 返回格式解析失败");
    return JSON.parse(jsonMatch[1]) as Record<string, unknown>;
  }
}

function normalizeEvaluation(
  parsed: Record<string, unknown>,
  content: string,
  targetCompany?: string,
): JDEvaluationResult {
  const scores = objectValue(parsed.scores);
  const keywordCoverage = objectValue(parsed.keywordCoverage);
  const levelMatch = objectValue(parsed.levelMatch);
  return {
    date: new Date().toISOString().slice(0, 10),
    company: targetCompany?.trim() || stringValue(parsed.company, "未知公司"),
    role: stringValue(parsed.role, "未知岗位"),
    archetype: stringValue(parsed.archetype, "未检测"),
    overallScore: numberValue(parsed.overallScore),
    legitimacy: stringValue(parsed.legitimacy, "不确定"),
    blocks: stringRecord(parsed.blocks),
    scores: {
      a: numberValue(scores.a),
      b: numberValue(scores.b),
      c: numberValue(scores.c),
      d: numberValue(scores.d),
      e: numberValue(scores.e),
      f: numberValue(scores.f),
      g: stringValue(scores.g),
    },
    keywords: stringArray(parsed.keywords),
    keywordCoverage: {
      overall: numberValue(keywordCoverage.overall),
      items: recordArray(keywordCoverage.items).map((item) => ({
        keyword: stringValue(item.keyword),
        status: stringValue(item.status),
      })),
    },
    skillGaps: recordArray(parsed.skillGaps).map((item) => ({
      skill: stringValue(item.skill),
      importance: stringValue(item.importance),
      substitution: stringValue(item.substitution),
    })),
    levelMatch: {
      level: stringValue(levelMatch.level),
      match: stringValue(levelMatch.match, "unknown"),
      note: stringValue(levelMatch.note),
    },
    differentiationTips: recordArray(parsed.differentiationTips).map((item) => ({
      jdEmphasis: stringValue(item.jdEmphasis),
      resumeWeakness: stringValue(item.resumeWeakness),
      tip: stringValue(item.tip),
    })),
    fullMarkdown: content,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(objectValue) : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringRecord(value: unknown): Record<string, string> {
  const record = objectValue(value);
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, item]) => typeof item === "string" ? [[key, item]] : []),
  );
}
