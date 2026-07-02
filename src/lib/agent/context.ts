/* ── Agent Context Assembler ── */

import { loadProfile } from "@/lib/profile-storage";
import { getRecentInteractions, getPendingDecisions, loadPreferences } from "./memory";
import { getAllTools, buildToolListForLLM } from "./tools";
import { injectKnowledge } from "./knowledge";
import type { AgentScenario, KnowledgeContext } from "./knowledge";
import type { Application, AgentInteraction, AgentDecision, AgentPreferenceModel, ZhiyuanProfile } from "@/types";
import db from "@/lib/db";
import { getDataRepositories } from "@/lib/data-repositories";

/* ── Context types ── */

export interface AssembledContext {
  systemPrompt: string;
  dynamicData: AgentDynamicData;
  assembledAt: string;
}

export interface AgentDynamicData {
  profile: ZhiyuanProfile | null;
  recentInteractions: AgentInteraction[];
  pendingDecisions: AgentDecision[];
  preferences: AgentPreferenceModel;
  pipelineSummary: PipelineSummary;
  applications: Application[];
}

export interface PipelineSummary {
  total: number;
  byStatus: Record<string, number>;
  recentActivity: number; // last 7 days
  staleCount: number;     // no activity > 14 days
  healthSignal: "green" | "yellow" | "red";
}

export interface AssembleOptions {
  scenario: AgentScenario;
  knowledgeCtx?: KnowledgeContext;
  maxApplications?: number;
  userId?: string;
}

const SERVER_DEFAULT_PREFERENCES: AgentPreferenceModel = {
  rolePreferences: {},
  companyPreferences: {
    liked: [],
    disliked: [],
    preferredSize: null,
    preferredIndustry: [],
  },
  salarySensitivity: {
    minAcceptable: 0,
    preferred: 0,
    flexibility: "unknown",
    learnedFrom: [],
  },
  behaviorPatterns: {
    evaluateToApplyDays: 0,
    preferredInterviewPrepHours: 0,
    activeHours: [],
    decisionStyle: "cautious",
  },
  lastUpdated: new Date().toISOString(),
};

/* ── Pipeline summary ── */

async function buildPipelineSummary(userId?: string): Promise<PipelineSummary> {
  const apps = userId
    ? (await getDataRepositories().applications.list({}, userId)).map(appRowToApplication)
    : await db.applications.toArray();
  const byStatus: Record<string, number> = {};
  let recentActivity = 0;
  let staleCount = 0;
  const now = new Date();

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  for (const a of apps) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    if (new Date(a.updatedAt) >= sevenDaysAgo) recentActivity++;
    if (new Date(a.updatedAt) < fourteenDaysAgo && a.status !== "offer" && a.status !== "rejected") {
      staleCount++;
    }
  }

  const total = apps.length;
  let healthSignal: PipelineSummary["healthSignal"] = "green";
  if (staleCount > total * 0.3 || staleCount > 5) healthSignal = "yellow";
  if (staleCount > total * 0.5 || staleCount > 10) healthSignal = "red";

  return { total, byStatus, recentActivity, staleCount, healthSignal };
}

/* ── Dynamic data assembler (parallel queries) ── */

async function assembleDynamicData(maxApps = 5, userId?: string): Promise<AgentDynamicData> {
  const repos = userId ? getDataRepositories() : null;
  const [profile, recentInteractions, pendingDecisions, preferences, pipelineSummary, rawApps] =
    await Promise.all([
      userId && repos ? loadServerProfile(userId) : loadProfile(),
      userId ? Promise.resolve([]) : getRecentInteractions(5),
      userId ? Promise.resolve([]) : getPendingDecisions(),
      userId ? Promise.resolve({ ...SERVER_DEFAULT_PREFERENCES }) : loadPreferences(),
      buildPipelineSummary(userId),
      userId && repos
        ? repos.applications.list({ limit: maxApps }, userId).then((rows) => rows.map(appRowToApplication))
        : db.applications.orderBy("updatedAt").reverse().limit(maxApps).toArray(),
    ]);

  const applications = userId
    ? rawApps.filter((a) => (a as Application & { userId?: string }).userId === userId)
    : rawApps;

  return {
    profile,
    recentInteractions,
    pendingDecisions,
    preferences,
    pipelineSummary,
    applications,
  };
}

function appRowToApplication(row: unknown): Application {
  const data = row as Record<string, unknown>;
  const date = String(data.date || new Date().toISOString().slice(0, 10));
  const created = new Date(String(data.created_at || date));
  const updated = new Date(String(data.updated_at || data.created_at || date));
  return {
    id: Number(data.id || data.num || 0),
    num: Number(data.num || 0),
    date,
    company: String(data.company || ""),
    role: String(data.role || ""),
    score: Number(data.score || 0),
    status: String(data.status || "Evaluated") as Application["status"],
    pdfGenerated: Boolean(data.pdf_generated),
    reportPath: String(data.report_path || ""),
    notes: String(data.notes || ""),
    createdAt: Number.isNaN(created.getTime()) ? new Date(date) : created,
    updatedAt: Number.isNaN(updated.getTime()) ? new Date(date) : updated,
  };
}

async function loadServerProfile(userId: string): Promise<ZhiyuanProfile | null> {
  const row = await getDataRepositories().profiles.get(userId);
  if (!row) return null;
  const data = JSON.parse(row.data_json || "{}");
  return {
    id: row.id,
    skills: Array.isArray(data.skills) ? data.skills : [],
    preferences: data.preferences || {
      companySize: { startup: 0, sme: 0, large: 0 },
      industry: {},
      workStyle: {},
      salaryTarget: { min: 0, max: 0 },
    },
    marketFit: data.marketFit || {
      overallScore: 0,
      topArchetypes: [],
      skillGaps: [],
    },
    goals: JSON.parse(row.goals_json || "{}"),
    history: JSON.parse(row.history_json || "[]"),
    lastUpdated: row.last_updated,
  };
}

/* ── System prompt builder ── */

const BASE_PERSONA = `你是纸鸢。一个朋友。

## 核心法则：匹配能量

对方扔过来的东西有多重，你就用多大的力接。不要加码，也不要敷衍。

### BASE 模式 — 使用时机：90% 的日常聊天
用户给的是一句话抱怨、模糊情绪、表情包、一个"唉"、一个"烦"——
你就回一句。轻的。不需要追问、不需要分析、不需要安抚。

### DEEP 模式 — 触发条件：用户主动展开叙事
用户讲了具体发生了什么——有时间、有地点、有人物、有细节——
这时候你可以往下聊。

### BASE → DEEP 切换信号
用户从一句话变成一段话 = 信号来了，可以切换。
用户从长篇大论变回"嗯"、"算了" = 信号走了，切回 BASE。

## 不要说的
- "我在"、"我懂"、"我陪你"、"我就在这儿"（做就行了，不用播报）
- "你可以XX、可以XX"（列清单）
- "不用谢"、"不用回报"、"我当没听见"（自我擦除）
- "要不要喝点热水"（过度服务）
- "我帮不上什么忙"（主动降格）
- 树洞/港湾/角落等比喻
- 情绪低落时别提工作、求职、岗位、面试、简历、JD、方向、规划、技能、经验

## 风格
念出声，不像人话就删。短。口语。贴具体的。全程中文。`;

const EXPLORE_MODE_OVERLAY = `

## 当前模式：探索

你正在和用户聊职业方向。自然对话，不做 checklist。
探索框架（自然涉及，不强制）：
- 做过什么（项目、副业、社团都算）
- 什么有劲、什么累、什么做得比别人轻松
- 不能忍的底线
- 聊聊可能的方向

当用户明显想转入行动（"帮我评估这个职位"、"看看有没有合适的岗位"），引导他们去执行模式。`;

const DINGWEI_MODE_OVERLAY = `

## 当前模式：自我定位

你是用户的求职定位助手。你的任务：帮用户找到目标岗位方向，或者帮已有方向的用户迭代画像。

### 核心原则
- **先收敛再发散** — 第一步一定是选择题，让用户立刻有参与感
- **每轮都给反馈** — 回答后立即确认/解读
- **快速出结果** — 3-5分钟给 actionable 输出

### 流程

**如果用户画像还没有目标岗位（初次定位）：**

1. 先问状态摸底题："你现在更接近哪种？A.已经在投简历/B.有方向但不具体/C.完全没方向/D.几个方向在纠结"
2. 按路径深挖 2-4 轮（每条路径有特定问题，见下）
3. 输出定位卡：目标方向 + 匹配依据 + 推荐试投岗位 + 下一步行动

路径工具箱（每轮只问一个问题，追问>新问题）：
- A（已在投）：投了哪些方向？哪个回应最多？有没有后悔的？想试但还没投的？
- B（有方向）：具体哪个细分？你有相关经验吗？最缺什么？市场需求怎样？
- C（没方向）：最不想做什么？（反向排除）做什么会忘记时间？（心流）别人找你帮什么忙？（外部视角）
- D（纠结）：列出方向，一句话说每个最吸引什么。如果只能试一个先试哪个？身边有做这些的人吗？

**如果用户画像已有目标岗位（迭代更新）：**

1. 先展示上下文："画像上次更新X天前，之后你评估了N个JD"
2. 按场景走：
   - 用户有新认知 → 深挖确认 → 更新goals
   - 系统提示偏好漂移 → 主动问用户
   - 随意聊聊 → 轻量对话，有信号才记录

### 调用工具（重要：严格按顺序，不要重复调用）
- **对话刚开始**：调用 mine_profile(action="start") 获取引导问题展示给用户。此操作只做一次。
- **用户回答后**：调用 mine_profile(action="answer", answer="用户原文") 推进阶段。
- **用户确认方向后**：调用 mine_profile(action="complete") 写入画像并结束。
- **禁止**：不要在同一个用户回合内调用两次 mine_profile。不要用 action="answer" 代替 action="start"。`;

const EXECUTE_MODE_OVERLAY = `

## 当前模式：执行

你是用户的求职顾问。你拥有数据访问能力和行业知识。

### 你的能力
- 查询用户的投递记录、评估报告、求职画像
- 评估新职位、检查 Pipeline 健康状态
- 基于用户偏好生成个性化推荐
- 获取 JD 内容并分析匹配度

### 行动原则
- 每次分析给出具体的、可执行的建议
- 推荐岗位时说明为什么适合，不要只列名字
- 如果 Pipeline 出现异常（长期无回复、某阶段堆积），主动提醒
- 用户拒绝某类推荐时，记下来，下次调整

### 输出格式
- 分析结果简洁，重点突出
- 推荐岗位附带关键匹配点和风险点
- 数据用中文呈现，不要 JSON`;

function buildSystemPrompt(
  scenario: AgentScenario,
  knowledge: string,
  tools: string,
  dynamicData: AgentDynamicData,
): string {
  const modeOverlay = scenario === "dingwei" ? DINGWEI_MODE_OVERLAY
    : scenario === "explore" ? EXPLORE_MODE_OVERLAY
    : EXECUTE_MODE_OVERLAY;

  let prompt = BASE_PERSONA + modeOverlay;

  // Inject dynamic data summary
  const { profile, preferences, pipelineSummary, recentInteractions } = dynamicData;
  const dataParts: string[] = [];

  if (profile?.goals?.targetRoles?.length) {
    const roles = profile.goals.targetRoles.map((r) => `${r.role}(${r.level})`).join("、");
    dataParts.push(`用户目标岗位: ${roles}`);
  }
  if (preferences.companyPreferences.liked.length || preferences.companyPreferences.disliked.length) {
    const parts: string[] = [];
    if (preferences.companyPreferences.liked.length) parts.push(`偏好公司: ${preferences.companyPreferences.liked.join("、")}`);
    if (preferences.companyPreferences.disliked.length) parts.push(`回避公司: ${preferences.companyPreferences.disliked.join("、")}`);
    dataParts.push(parts.join("；"));
  }
  dataParts.push(`Pipeline: ${pipelineSummary.total} 条记录（${Object.entries(pipelineSummary.byStatus).map(([k, v]) => `${k}:${v}`).join(", ")}），健康度 ${pipelineSummary.healthSignal}`);
  if (recentInteractions.length > 0) {
    const lastInteraction = recentInteractions[0];
    dataParts.push(`最近交互: ${lastInteraction.output.summary}（${lastInteraction.timestamp.toISOString()}）`);
  }

  if (dataParts.length > 0) {
    prompt += `\n\n## 当前状态\n\n${dataParts.join("\n")}`;
  }

  // Inject knowledge
  if (knowledge) {
    prompt += `\n\n## 行业知识\n\n${knowledge}`;
  }

  // Inject tools (execute mode and dingwei mode)
  if (tools && scenario !== "explore") {
    prompt += `\n${tools}`;
  }

  // For dingwei, inject profile goals context
  if (scenario === "dingwei" && profile) {
    if (profile.goals?.targetRoles?.length) {
      prompt += `\n\n## 用户当前画像\n目标岗位: ${profile.goals.targetRoles.map((r: { role: string; level: string }) => `${r.role}(${r.level})`).join("、")}`;
      prompt += `\n上次更新: ${profile.lastUpdated || "未知"}`;
      prompt += `\n\n检测到用户已有画像，请使用迭代更新流程（展示上下文 → 场景分流）。`;
    } else {
      prompt += `\n\n用户尚未设定目标岗位，请使用初次定位流程（摸底 → 深挖 → 定位卡）。`;
    }
  }

  return prompt;
}

/* ── Context cache ── */

interface CacheEntry {
  context: AssembledContext;
  expiresAt: number;
}

const contextCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCacheKey(scenario: string, pipelineHash: string): string {
  return `${scenario}:${pipelineHash}`;
}

function pipelineHash(summary: PipelineSummary): string {
  return `${summary.total}:${summary.healthSignal}:${summary.recentActivity}`;
}

/* ── Main assemble function ── */

export async function assembleContext(options: AssembleOptions): Promise<AssembledContext> {
  const { scenario, knowledgeCtx, maxApplications, userId } = options;

  // Parallel: dynamic data + knowledge + tools
  const [dynamicData, knowledge, tools] = await Promise.all([
    assembleDynamicData(maxApplications, userId),
    Promise.resolve(injectKnowledge(scenario, knowledgeCtx)),
    Promise.resolve(scenario !== "explore" ? buildToolListForLLM() : ""),
  ]);

  // Check cache
  const hash = pipelineHash(dynamicData.pipelineSummary);
  const cacheKey = getCacheKey(scenario, hash);
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context;
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(scenario, knowledge, tools, dynamicData);

  const context: AssembledContext = {
    systemPrompt,
    dynamicData,
    assembledAt: new Date().toISOString(),
  };

  // Cache
  contextCache.set(cacheKey, { context, expiresAt: Date.now() + CACHE_TTL_MS });

  return context;
}

/* ── Cache management ── */

export function clearContextCache(): void {
  contextCache.clear();
}

export function invalidateCachedContext(scenario: string, summary: PipelineSummary): void {
  const key = getCacheKey(scenario, pipelineHash(summary));
  contextCache.delete(key);
}
