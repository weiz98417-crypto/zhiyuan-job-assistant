import { llmRetry } from "@/lib/llm-retry";
import { loadModeDocument } from "@/lib/agent/knowledge/registry/loader";
import { computeEvaluationOverallScore } from "@/lib/evaluation-scoring";
import { isFivePointScore } from "@/lib/score-scale";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-flash";

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
  matchResume?: boolean;
  userProfile?: JDEvaluationUserProfile;
  targetCompany?: string;
  targetCity?: string;
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
  /** Spec 28：D 板块引用的薪资数据来源标注（静态参考/实时聚合·N 条样本）。 */
  salaryDataSource?: string;
  /** Spec 27：题库命中的针对性练习题（带出处标签），已同时附进 F 板块正文。 */
  interviewQuestions?: Array<{ question: string; provenance: string }>;
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
  // Spec 28（ADR-0043）：D 板块薪资对比必须引用带来源标注的市场数据；估算不得当作事实
  let salaryContext = "";
  let salaryDataSource = "";
  try {
    const { lookupBenchmark, detectLevelBand } = await import("@/lib/server/salary-benchmarks-store");
    const { familyForRole } = await import("@/lib/server/question-bank");
    const city = input.targetCity || guessCityFromJD(input.jdText);
    const family = familyForRole(input.userProfile?.targetRoles?.[0]?.name || input.targetCompany || "");
    const levelBand = detectLevelBand(input.jdText);
    const benchmark = await lookupBenchmark(city || undefined, family, levelBand);
    if (benchmark) {
      salaryDataSource = benchmark.sourceLabel;
      const band = benchmark.p50 !== null
        ? `${benchmark.p25 ?? "?"} - ${benchmark.p75 ?? "?"} 元/月（中位 ${benchmark.p50}）`
        : "无数据";
      // Spec 30 / WP4：seed 超 9 个月 → isStale → 只谈量级不谈具体谈判数字
      const staleInstruction = benchmark.isStale
        ? "⚠ 此数据已过时效，仅作方向参考：不得给出具体谈判数字，只讨论量级区间。"
        : "D 板块薪酬对比必须引用上述来源标注；不得将估算值表述为事实；无匹配数据时明确写「静态参考/数据不足」。";
      salaryContext = [
        `市场薪资参考（来源标注：${benchmark.sourceLabel}）：`,
        `城市 ${benchmark.city}，岗位族 ${benchmark.family}${benchmark.levelBand ? `，层级 ${benchmark.levelBand}` : ""}：${band} ${benchmark.unit}。`,
        staleInstruction,
      ].join("\n");
    }
  } catch { /* 薪资参考不可用不阻塞评估 */ }
  const content = await completion.complete({
    systemPrompt: buildSystemPrompt(language, input.riskContext, input.matchResume !== false, salaryContext),
    userContent: buildUserContent(input, language),
    signal: input.signal,
  });
  const parsed = parseCompletion(content);
  const result = normalizeEvaluation(parsed, input.targetCompany, input.matchResume !== false);
  if (salaryDataSource) {
    result.salaryDataSource = salaryDataSource;
    // 落库：来源标注写进 D 板块正文尾注（持久化的是 blocks 文本，单独字段会丢）
    result.blocks.d = `${result.blocks.d || ""}\n\n*市场薪资数据来源：${salaryDataSource}*`.trim();
  }
  // Spec 27：JD 评估接题库——评估完成后从 composeInterview 取 3 道贴合 JD/岗位族的题
  // 附进 F 板块（面试准备），带出处标签。Postgres-only 且非阻塞（题库不可用时 F 板块原样）。
  try {
    const { composeInterview, familyForRole } = await import("@/lib/server/question-bank");
    const composed = await composeInterview({
      family: familyForRole(input.userProfile?.targetRoles?.[0]?.name || result.role),
      phase: "tech",
      role: result.role,
      company: result.company,
      jdText: input.jdText,
      cvText: input.cvText,
      count: 3,
      signal: input.signal,
    });
    if (composed.questions.length > 0) {
      const questionLines = composed.questions.map((question, index) =>
        `${index + 1}. ${question.question}（出处：${question.provenance}）`);
      result.interviewQuestions = composed.questions.map((question) => ({
        question: question.question,
        provenance: question.provenance,
      }));
      result.blocks.f = `${result.blocks.f || ""}\n\n### 题库命中的针对性练习题\n${questionLines.join("\n")}`.trim();
    }
  } catch { /* 题库不可用不阻塞评估（F 板块保持 LLM 原文） */ }
  return result;
}

/** 从 JD 文本猜城市（仅用于选择基准条目；猜不出则用全国/北京兜底由 store 处理）。 */
function guessCityFromJD(jdText: string): string | undefined {
  const cities = ["北京", "上海", "深圳", "广州", "杭州", "成都", "武汉", "南京", "苏州", "西安", "长沙", "天津", "重庆", "郑州", "东莞", "青岛", "沈阳", "宁波", "昆明"];
  return cities.find((city) => (jdText || "").includes(city));
}

function createDefaultCompletionAdapter(): JDEvaluationCompletionAdapter {
  return {
    async complete(input) {
      const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY 环境变量");
      const response = await llmRetry(DEEPSEEK_API_URL, apiKey, {
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userContent },
        ],
        temperature: 0.3,
        max_tokens: 12_000,
        response_format: { type: "json_object" },
        retries: 2,
        fallbackModel: "deepseek-flash",
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

function buildSystemPrompt(language: "zh" | "en", riskContext = "", matchResume = true, salaryContext = ""): string {
  const systemContext = loadModeContext(language);
  const salarySection = salaryContext.trim()
    ? `\n\n${salaryContext.trim()}`
    : "";
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
  const matchingScope = matchResume
    ? ""
    : language === "en"
      ? "\n\nThe user explicitly forbids comparison with their CV. Evaluate this job description on its own merits. Do not infer candidate fit, personal skill gaps, seniority fit, or resume improvements. Block B must say CV matching was intentionally excluded and score 0; calculate the overall recommendation from JD-only dimensions."
      : "\n\n用户明确禁止对照其简历。本次只评估 JD 本身的职位内容、薪资、风险和面试信息；不得推断候选人匹配度、个人技能缺口、职级匹配或简历改进建议。B 板块明确写“按用户要求未进行简历匹配”，评分为 0；总体建议仅依据 JD 本身。";
  if (language === "en") {
    return `You are an AI job-search evaluation engine. Follow the project rules below and return JSON only. Evaluate role overview, CV match, seniority, compensation, tailoring, interview preparation, and legitimacy. Scores A-F are numbers from 0 to 5; G is qualitative.${salarySection}\n\n${systemContext}${riskSection}${matchingScope}\n\nReturn exactly this shape:\n${schema}`;
  }
  return `你是 AI 求职评估引擎。遵循以下项目规则，对职位概览、简历匹配、职级策略、薪资市场、定制方案、面试准备和职位合法性进行完整评估。只返回 JSON。A-F 为 0-5 分，G 为定性结论。${salarySection}\n\n${systemContext}${riskSection}${matchingScope}\n\n严格返回以下结构：\n${schema}`;
}

function loadModeContext(language: "zh" | "en"): string {
  // Spec 25：modes 统一经注册表加载器读取（内容与旧 fs 路径逐字节等价；en 无 _profile 属既有事实）
  const read = (name: string) => loadModeDocument(language, name) ?? "";
  return [
    read("_shared"),
    read(language === "en" ? "oferta" : "jianzhi"),
    language === "zh" ? read("_profile") : "",
  ].filter(Boolean).join("\n\n");
}

function buildUserContent(input: JDEvaluationInput, language: "zh" | "en"): string {
  const profile = input.matchResume === false ? undefined : input.userProfile;
  const profileText = profile
    ? language === "en"
      ? `Candidate profile — Skills: ${profile.superpowers.join(", ") || "N/A"}. Headline: ${profile.headline || "N/A"}. Story: ${profile.exitStory || "N/A"}. Target roles: ${profile.targetRoles.map((role) => role.name).join(", ") || "N/A"}.`
      : `求职者信息 — 技能: ${profile.superpowers.join("、") || "未知"}。头衔: ${profile.headline || "未知"}。职业故事: ${profile.exitStory || "未知"}。目标方向: ${profile.targetRoles.map((role) => role.name).join("、") || "未知"}。`
    : "";
  const resumeText = input.matchResume === false
    ? language === "en" ? "CV comparison was excluded at the user's request." : "按用户要求，本次不匹配简历。"
    : input.cvText?.trim()
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
  targetCompany?: string,
  matchResume = true,
): JDEvaluationResult {
  const scores = objectValue(parsed.scores);
  const keywordCoverage = objectValue(parsed.keywordCoverage);
  const levelMatch = objectValue(parsed.levelMatch);
  const blockScores = {
    a: normalizedBlockScore(scores.a),
    b: matchResume ? normalizedBlockScore(scores.b) : 0,
    c: normalizedBlockScore(scores.c),
    d: normalizedBlockScore(scores.d),
    e: normalizedBlockScore(scores.e),
    f: normalizedBlockScore(scores.f),
  };
  const modelOverallScore = numberValue(parsed.overallScore, Number.NaN);
  const expectedDimensionKeys = ["a", "b", "c", "d", "e", "f"].filter((key) => matchResume || key !== "b");
  const validDimensions = expectedDimensionKeys
    .map((key) => numberValue(scores[key], Number.NaN))
    .filter(isFivePointScore);
  const hasPositiveDimension = validDimensions.some((score) => score > 0);
  if (!validDimensions.length || (!hasPositiveDimension && (
    modelOverallScore !== 0 || validDimensions.length !== expectedDimensionKeys.length
  ))) {
    throw new Error("AI 评分缺少有效的 0–5 分项，请重新评估");
  }
  const overallScore = isFivePointScore(modelOverallScore)
    ? modelOverallScore
    : computeEvaluationOverallScore(Object.fromEntries(
        Object.entries(blockScores).map(([key, score]) => [key, { score }]),
      ));
  const normalizedBlocks = {
    ...stringRecord(parsed.blocks),
    ...(matchResume ? {} : { b: "按用户要求，本次未进行简历匹配。" }),
  };
  const normalizedScores = { ...blockScores, g: stringValue(scores.g) };
  return {
    date: new Date().toISOString().slice(0, 10),
    company: targetCompany?.trim() || stringValue(parsed.company, "未知公司"),
    role: stringValue(parsed.role, "未知岗位"),
    archetype: stringValue(parsed.archetype, "未检测"),
    overallScore,
    legitimacy: stringValue(parsed.legitimacy, "不确定"),
    blocks: normalizedBlocks,
    scores: normalizedScores,
    keywords: stringArray(parsed.keywords),
    keywordCoverage: matchResume ? {
      overall: numberValue(keywordCoverage.overall),
      items: recordArray(keywordCoverage.items).map((item) => ({
        keyword: stringValue(item.keyword),
        status: stringValue(item.status),
      })),
    } : undefined,
    skillGaps: matchResume ? recordArray(parsed.skillGaps).map((item) => ({
      skill: stringValue(item.skill),
      importance: stringValue(item.importance),
      substitution: stringValue(item.substitution),
    })) : undefined,
    levelMatch: matchResume ? {
      level: stringValue(levelMatch.level),
      match: stringValue(levelMatch.match, "unknown"),
      note: stringValue(levelMatch.note),
    } : undefined,
    differentiationTips: matchResume ? recordArray(parsed.differentiationTips).map((item) => ({
      jdEmphasis: stringValue(item.jdEmphasis),
      resumeWeakness: stringValue(item.resumeWeakness),
      tip: stringValue(item.tip),
    })) : undefined,
    fullMarkdown: JSON.stringify({
      ...parsed,
      overallScore,
      blocks: normalizedBlocks,
      scores: normalizedScores,
      ...(matchResume ? {} : {
        keywordCoverage: undefined,
        skillGaps: undefined,
        levelMatch: undefined,
        differentiationTips: undefined,
      }),
    }),
  };
}

function normalizedBlockScore(value: unknown): number {
  const score = numberValue(value, Number.NaN);
  return isFivePointScore(score) ? score : 0;
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
