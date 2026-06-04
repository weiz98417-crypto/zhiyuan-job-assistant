/* ── 筝筝纸鸢 Frontend Type Definitions ── */

/* ── Application Tracker ── */

/** 8 canonical application states from templates/states.yml */
export type ApplicationStatus =
  | "evaluated"
  | "applied"
  | "responded"
  | "interview"
  | "offer"
  | "rejected"
  | "discarded"
  | "skip";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  evaluated: "已评估",
  applied: "已投递",
  responded: "已回复",
  interview: "面试中",
  offer: "已获Offer",
  rejected: "已拒绝",
  discarded: "已放弃",
  skip: "跳过",
};

export const STATUS_ORDER: ApplicationStatus[] = [
  "evaluated",
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "discarded",
  "skip",
];

export interface InterviewRound {
  round: number;
  totalRounds?: number;
  date: string;
  notes?: string;
}

export interface Application {
  id?: number;
  num: number;
  date: string;
  company: string;
  role: string;
  score: number;
  status: ApplicationStatus;
  pdfGenerated: boolean;
  reportPath?: string;
  notes?: string;
  url?: string;
  interviews?: InterviewRound[];
  createdAt: Date;
  updatedAt: Date;
}

/* ── JD Evaluation ── */

export interface EvaluationScores {
  a: number; // Role Overview
  b: number; // CV Match
  c: number; // Level & Strategy
  d: number; // Salary & Market
  e: number; // Customization Plan
  f: number; // Interview Prep
  g: string; // Legitimacy (tier, not numeric)
}

export interface KeywordCoverage {
  overall: number; // 0-100
  items: {
    keyword: string;
    status: "covered" | "missing" | "weak";
  }[];
}

export interface SkillGap {
  skill: string;
  importance: "required" | "preferred";
  substitution: string; // Chinese explanation
}

export interface LevelMatch {
  level: string; // e.g. "P6-P7"
  match: "below" | "match" | "above" | "stretch" | "unknown";
  note: string;
}

export interface DifferentiationTip {
  jdEmphasis: string;
  resumeWeakness: string;
  tip: string;
}

export interface EvaluationReport {
  id?: number;
  reportNum: number;
  company: string;
  role: string;
  date: string;
  archetype: string;
  overallScore: number;
  legitimacy: string;
  url?: string;
  scores: EvaluationScores;
  blocks: {
    a: string; // Role Overview markdown
    b: string; // CV Match markdown
    c: string; // Level & Strategy markdown
    d: string; // Salary & Market markdown
    e: string; // Customization Plan markdown
    f: string; // Interview Prep markdown
    g: string; // Legitimacy markdown
  };
  keywords: string[];
  keywordCoverage?: KeywordCoverage;
  skillGaps?: SkillGap[];
  levelMatch?: LevelMatch;
  differentiationTips?: DifferentiationTip[];
  applicationId?: number;
  createdAt: Date;
}

/* ── Offers ── */

export interface Offer {
  id?: number;
  company: string;
  role: string;
  location?: string;
  level?: string;
  monthlySalary: number;
  monthsPerYear: number;
  annualBonus?: number;
  hasSocialInsurance: boolean;
  socialInsuranceBaseType?: OfferSocialInsuranceBaseType;
  socialInsuranceBaseK?: number;
  housingFundRate: number;
  options?: string;
  probationMonths: number;
  startDate?: string;
  otherBenefits?: string;
  applicationId?: number;
  reportId?: number;
  createdAt: Date;
  employmentForm?: "direct_hire" | "dispatch" | "outsourcing" | "intern" | "contractor" | "unknown";
  employerName?: string;
  contractMonths?: number;
  overtimePolicy?: "none" | "occasional" | "common" | "intense" | "unknown";
  bonusGuarantee?: "guaranteed" | "partial" | "uncertain" | "none" | "unknown";
  equityType?: string;
  equityVesting?: string;
  commuteMinutes?: number;
  cityCostLevel?: "low" | "medium" | "high" | "very_high" | "unknown";
  jobNature?: string;
  latestReportId?: number;
  updatedAt?: string;
}

export type OfferEmploymentForm =
  | "direct_hire"
  | "dispatch"
  | "outsourcing"
  | "intern"
  | "contractor"
  | "unknown";

export type OfferVerdict =
  | "accept"
  | "accept_after_negotiation"
  | "proceed_cautiously"
  | "decline";

export type OfferRiskLevel = "low" | "medium" | "high" | "critical";

export type OfferSocialInsuranceBaseType =
  | "full_salary"
  | "minimum_base"
  | "unknown";

export interface OfferSnapshot {
  offerId?: number;
  company: string;
  role: string;
  location?: string;
  level?: string;
  monthlySalary: number;
  monthsPerYear: number;
  annualBonus?: number;
  hasSocialInsurance: boolean;
  socialInsuranceBaseType?: OfferSocialInsuranceBaseType;
  socialInsuranceBaseK?: number;
  housingFundRate: number;
  probationMonths: number;
  startDate?: string;
  otherBenefits?: string;
  options?: string;
  employmentForm?: OfferEmploymentForm;
  employerName?: string;
  contractMonths?: number;
  overtimePolicy?: "none" | "occasional" | "common" | "intense" | "unknown";
  bonusGuarantee?: "guaranteed" | "partial" | "uncertain" | "none" | "unknown";
  equityType?: string;
  equityVesting?: string;
  commuteMinutes?: number;
  cityCostLevel?: "low" | "medium" | "high" | "very_high" | "unknown";
  jobNature?: string;
  applicationId?: number;
  sourceLabel?: string;
  evaluatedAt?: string;
}

export interface OfferEvaluationModule {
  id: string;
  label: string;
  score: number; // 1-5
  weight: number; // percentage weight
  confidence: number; // 0-1
  evidence: string[];
  risks: string[];
  missingInfo: string[];
  notes: string;
}

export interface OfferEvaluationReport {
  id?: number;
  reportType: "single" | "comparison";
  modelVersion: string;
  offerId?: number;
  company: string;
  role: string;
  overallScore: number;
  verdict: OfferVerdict;
  summary: string;
  assumptions: string[];
  redFlags: string[];
  missingInfo: string[];
  negotiationLevers: string[];
  hrQuestions: string[];
  modules: OfferEvaluationModule[];
  takeHomeEstimate?: {
    monthlyNetMin: number;
    monthlyNetMax: number;
    annualNetMin: number;
    annualNetMax: number;
    assumptions: string[];
  };
  offerSnapshot: OfferSnapshot;
  createdAt: string;
  updatedAt?: string;
}

/* ── Interview Prep ── */

export interface StarStory {
  id?: number;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  tags: string[]; // "Best for questions about..."
  sourceReport?: number; // report number that spawned this story
  createdAt: Date;
}

export interface InterviewSchedule {
  id?: number;
  company: string;
  role: string;
  round: number;
  totalRounds?: number;
  date: string;
  time?: string;
  format: "phone" | "video" | "onsite";
  notes?: string;
  checklist: { item: string; done: boolean }[];
  applicationId?: number;
}

/* ── Settings / Profile ── */

export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  portfolioUrl?: string;
  targetRoles: { name: string; level: string; fit: "primary" | "secondary" | "adjacent" }[];
  headline: string;
  exitStory: string;
  superpowers: string[];
  salaryMinK: number;
  salaryMaxK: number;
  salaryFlexibility: "open" | "firm";
  /** 来自需求探索归纳 */
  narrative?: string;
  archetype?: string;
  preferences?: {
    companyType?: string;
    industry?: string;
    culture?: string;
    workStyle?: string;
  };
  constraints?: {
    salary?: string;
    location?: string;
    hours?: string;
    other?: string[];
  };
}

/* ── API ── */

/* ── CV Version Management ── */

export interface CVSection {
  id: string;
  title: string;
  content: string;
}

export interface CVersion {
  id: string;
  label: string;
  createdAt: string;
  sections: CVSection[];
  source: "manual" | "optimized";
}

export interface CVData {
  activeVersion: string;
  versions: Record<string, CVersion>;
}

export interface EvaluateRequest {
  jdText: string;
  language?: "zh" | "en";
  cvText?: string;
  userProfile?: {
    superpowers: string[];
    headline: string;
    exitStory: string;
    targetRoles: { name: string; fit: string }[];
  };
}

/* ── CV AI Optimization ── */

export type Operation = "full" | "star" | "quantify" | "keywords";

export const OPERATION_LABELS: Record<Operation, { label: string; shortLabel: string; desc: string }> = {
  full: { label: "全面优化", shortLabel: "全面", desc: "三者均衡融合，最通用的选择" },
  star: { label: "STAR 重组", shortLabel: "STAR", desc: "用 STAR 框架重写段落结构" },
  quantify: { label: "量化增强", shortLabel: "量化", desc: "注入量化维度（XX 占位）" },
  keywords: { label: "关键词注入", shortLabel: "关键词", desc: "植入 JD/行业关键词" },
};

export const ROLE_DIRECTION_OPTIONS = [
  { value: "auto", label: "自动检测（从画像推断）" },
  { value: "ai-pm", label: "AI产品经理" },
  { value: "pm", label: "产品经理" },
  { value: "backend", label: "后端工程师" },
  { value: "frontend", label: "前端工程师" },
  { value: "data-ai", label: "数据/AI工程师" },
  { value: "qa", label: "测试工程师" },
  { value: "design", label: "设计师" },
  { value: "ops", label: "运营/市场" },
  { value: "generic", label: "通用（不限定角色）" },
] as const;

export type RoleDirection = (typeof ROLE_DIRECTION_OPTIONS)[number]["value"];

export const EFFORT_LABELS: Record<number, { label: string; desc: string }> = {
  1: { label: "温和", desc: "仅润色措辞，不改结构" },
  2: { label: "保守", desc: "微调句式，标注量化机会" },
  3: { label: "适中", desc: "适度补量化占位，可微调结构" },
  4: { label: "大刀", desc: "大胆推断量化，可 STAR 重组" },
  5: { label: "重写", desc: "完全重写，最大化量化覆盖" },
};

export interface OptimizeVariant {
  label: string;
  content: string;
  approach: string;
  placeholderCount?: number;
}

export interface AskQuestion {
  id: number;
  question: string;
  type: "radio" | "text";
  options?: string[];
  required: boolean;
}

export interface AskQuestionsResponse {
  success: boolean;
  data?: {
    questions: AskQuestion[];
  };
  error?: string;
}

export interface OptimizeSectionRequest {
  sectionId: string;
  sectionContent: string;
  fullCV: Record<string, string>;
  intent?: string;
  /** @deprecated replaced by operation + effort */
  aggressiveness?: number;
  /** @deprecated replaced by operation + effort */
  keywordDensity?: number;
  operation: Operation;
  effort: number; // 1-5
  enablePlaceholders: boolean;
  enableQuestions: boolean;
  roleDirection?: string; // override role detection: "auto" | "pm" | "backend" | etc.
  questionAnswers?: { question: string; answer: string }[];
  targetJD?: {
    role: string;
    company: string;
    keywords: string[];
  };
  userProfile?: {
    headline: string;
    superpowers: string[];
    targetRoles: { name: string; fit: string }[];
  };
  referenceIds?: number[];
}

export interface OptimizeSectionResponse {
  success: boolean;
  data?: {
    variants: OptimizeVariant[];
  };
  error?: string;
}

/* ── JD Library ── */

export type JDSourceType = "paste" | "ocr" | "url" | "agent" | "discovery";

export interface JDRecord {
  id?: number;
  company: string;
  role: string;
  sourceType: JDSourceType;
  sourceUrl?: string;
  body: string;
  keywords: string[];
  reportId?: number;
  createdAt: Date;
}

/* ── V1.5: JD Smart Evaluate ── */

export interface RadarScores {
  skillMatch: number;       // 技能匹配 0-100
  experienceMatch: number;  // 经验匹配 0-100
  salaryMatch: number;      // 薪资匹配 0-100
  growthSpace: number;      // 成长空间 0-100
  riskIndex: number;        // 风险指数 0-100 (越高越危险)
}

export interface JDSignal {
  phrase: string;
  translation: string;
  severity: "info" | "warning" | "danger";
}

export interface StreamSection {
  type: "section";
  key: string;
  content: string;
}

/* ── V1.5: CV AI Tailor ── */

export interface CVScoreResult {
  overall: number;
  dimensions: {
    content: number;     // 内容完整度
    structure: number;   // 结构清晰度
    keywords: number;    // 关键词密度
    quantification: number; // 量化程度
  };
  suggestions: string[];
  atsScore?: number; // ATS 兼容性 0-100
  atsIssues?: string[];
}

export interface QuantifyResult {
  original: string;
  quantified: string;
  metric: string;
}

/* ── V1.5: Interview AI Coach ── */

export type CoachMode =
  | "project-review"    // 项目复盘 — 互联网大厂/科技公司
  | "behavioral"         // 行为问答 — 外企/咨询
  | "scenario"           // 情景应对 — 大厂交叉面/群面/管培
  | "structured-sme"     // 结构化面试 — 中小企业
  | "founder"            // 创始人对话 — 初创/微型
  | "stability";         // 稳重应答 — 国企/央企/银行

export const COACH_MODES: Record<CoachMode, {
  label: string;
  shortLabel: string;
  target: string;
  structure: string[];
}> = {
  "project-review": {
    label: "项目复盘",
    shortLabel: "大厂",
    target: "互联网大厂/科技公司",
    structure: ["背景", "角色", "难点", "思考", "方案", "结果", "反思", "数据"],
  },
  "behavioral": {
    label: "行为问答",
    shortLabel: "外企",
    target: "外企/咨询",
    structure: ["Situation", "Task", "Action", "Result", "Reflection"],
  },
  "scenario": {
    label: "情景应对",
    shortLabel: "管培",
    target: "大厂交叉面/群面/管培",
    structure: ["理解", "拆解", "方案", "风险", "反问"],
  },
  "structured-sme": {
    label: "结构化面试",
    shortLabel: "中小企业",
    target: "中小企业(50-500人)",
    structure: ["为什么来", "做过什么", "怎么做的", "结果", "能带来什么"],
  },
  "founder": {
    label: "创始人对话",
    shortLabel: "初创",
    target: "初创/微型(<50人)",
    structure: ["理解业务", "能立刻上手", "薪资期望", "创业节奏"],
  },
  "stability": {
    label: "稳重应答",
    shortLabel: "国企",
    target: "国企/央企/银行",
    structure: ["学历背景", "政治觉悟", "服从意识", "长期规划", "家庭情况"],
  },
};

export interface CoachMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CoachStreamEvent {
  type: "section";
  key: string;
  label: string;
  content: string;
}

export interface CoachFollowUpsEvent {
  type: "followUps";
  questions: { question: string; hint: string }[];
}

export interface CoachDoneEvent {
  type: "done";
}

export type CoachSSEEvent = CoachStreamEvent | CoachFollowUpsEvent | CoachDoneEvent;

export interface CoachResult {
  sections: { key: string; label: string; content: string }[];
  followUps: { question: string; hint: string }[];
  riskWarnings?: string[];  // for founder mode risk signals
}

export interface AnswerScore {
  dimensions: {
    structure: number;        // 结构完整度 1-5
    specificity: number;      // 具体程度 1-5
    highlight: number;        // 亮点突出 1-5
    timing: number;           // 时间控制 1-5
  };
  overall: number;
  suggestions: string[];
  segmentFeedback?: {
    text: string;
    rating: "good" | "expand" | "compress";
  }[];
}

export interface InterviewQuestion {
  category: "behavioral" | "technical" | "case-study" | "culture";
  question: string;
  context: string;
  storyHint: string;
  source: "jd" | "weakness" | "general";
  weaknessNote?: string;
}

/* ── Pipeline: Interview Practice ── */

export interface QuestionPracticeContext {
  question: string;
  context: string;
  storyHint: string;
  jdSummary: string;
  cvSummary: string;
}

export interface PracticeRecord {
  id?: number;
  question: string;
  questionCategory: string;
  answer: string;
  score?: number;
  jdCompany?: string;
  jdRole?: string;
  tags: string[];
  createdAt: Date;
}

/* ── V1.5: AI Job Insights ── */

export interface HealthCheck {
  status: "green" | "yellow" | "red" | "gray";
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface WeeklyReport {
  period: { start: string; end: string };
  stats: {
    totalApplications: number;
    passRate: number;
    interviewsScheduled: number;
    offersReceived: number;
  };
  trends: { direction: string; analysis: string };
  aiCommentary: string;
  encouragement: string;
}

export interface OfferPrediction {
  timeframe: string;
  confidence: number;
  basedOn: string;
}

export interface AnomalyAlert {
  type: "no_reply" | "fast_reply" | "stale" | "imbalance";
  severity: "warning" | "danger";
  title: string;
  description: string;
  affectedItems: string[];
}

/* ── V2.0: Zhiyuan Profile Engine ── */

export interface ProfileSkill {
  name: string;
  proficiency: number; // 0-100
  evidence: string[];
  source?: "auto" | "manual" | "inferred"; // 数据来源：自动提取/手动设置/推断
}

export interface CompanySizePrefs {
  startup: number; // 0-1
  sme: number;
  large: number;
}

export interface ProfilePreferences {
  companySize: CompanySizePrefs;
  industry: Record<string, number>;
  workStyle: Record<string, number>;
  salaryTarget: { min: number; max: number };
}

export interface SkillGapItem {
  skill: string;
  demand: number;   // 0-100 market demand
  myLevel: number;  // 0-100 user proficiency
  gap: number;      // demand - myLevel
}

export interface ProfileMarketFit {
  overallScore: number; // 0-100
  topArchetypes: string[];
  skillGaps: SkillGapItem[];
}

export interface ProfileHistoryEntry {
  timestamp: string;
  event: string;
  changes: string[];
}

export interface ZhiyuanProfileGoals {
  targetRoles: { role: string; level: string }[];
  salaryRange: { min: number; max: number };
  dealBreakers: string[];
  companyPrefs: {
    size: string[];
    industry: string[];
    workStyle: string[];
  };
}

export interface ZhiyuanProfile {
  id?: number;
  skills: ProfileSkill[];
  preferences: ProfilePreferences;
  marketFit: ProfileMarketFit;
  goals?: ZhiyuanProfileGoals;
  history: ProfileHistoryEntry[];
  lastUpdated: string;
  lockedFields?: Record<string, string>; // key=字段路径, value=锁定时间ISO
}

/* ── V2.1: Agent Memory ── */

export interface AgentInteraction {
  id?: number;
  timestamp: Date;
  trigger: "dashboard_load" | "evaluation_complete" | "application_submitted" | "user_query" | "feedback" | "scheduled";
  contextSnapshot: {
    profileVersion: string;
    pipelineSummary: string;
    recentActivityCount: number;
  };
  reasoning: {
    thought: string;
    toolsConsidered: string[];
    toolsUsed: string[];
  };
  output: {
    type: "recommendation" | "insight" | "alert" | "suggestion" | "answer";
    summary: string;
  };
  feedback?: {
    action: "accepted" | "dismissed" | "clicked" | "ignored" | "modified";
    timestamp: Date;
    detail?: string;
  };
}

export interface AgentDecision {
  id?: number;
  timestamp: Date;
  type: "recommend_apply" | "recommend_skip" | "warn_pipeline" | "suggest_action";
  target: {
    entityType: "jd" | "application" | "pipeline" | "profile";
    entityId: number;
    summary: string;
  };
  content: string;
  confidence: number;
  userResponse: "accepted" | "rejected" | "pending" | "expired";
  outcome?: {
    didApply?: boolean;
    gotResponse?: boolean;
    gotInterview?: boolean;
    gotOffer?: boolean;
    resultSummary?: string;
  };
}

export interface RolePreference {
  score: number; // -1 to 1
  confidence: number; // 0-1
  sampleCount: number;
  lastUpdated: string;
  source: "explore" | "manual" | "learned";
}

export interface AgentPreferenceModel {
  id?: number;
  rolePreferences: Record<string, RolePreference>;
  companyPreferences: {
    liked: string[];
    disliked: string[];
    preferredSize: "startup" | "sme" | "large" | null;
    preferredIndustry: string[];
  };
  salarySensitivity: {
    minAcceptable: number;
    preferred: number;
    flexibility: "firm" | "negotiable" | "unknown";
    learnedFrom: string[];
  };
  behaviorPatterns: {
    evaluateToApplyDays: number;
    preferredInterviewPrepHours: number;
    activeHours: string[];
    decisionStyle: "fast" | "deliberate" | "cautious";
  };
  lastUpdated: string;
}

/* ── Agent Tool ── */

export interface AgentToolParam {
  type: "string" | "number" | "boolean" | "object";
  required: boolean;
  description: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, AgentToolParam>;
  category: "query" | "action";
}

/* ── Agent Chat ── */

export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  /** Data URL attachments for user-uploaded JD screenshots or files. */
  images?: string[];
  mode?: "explore" | "execute" | "interview-coach";
  /** Which sub-agent produced this message (V2: multi-agent architecture) */
  agent_id?: string;
  toolName?: string;
  toolResult?: unknown;
  timestamp: string;
}

export interface ChatSession {
  id?: number;
  title: string;
  messages: AgentMessage[];
  memoryDigest?: string;
  interviewState?: InterviewSessionState;
  agentState?: AgentSessionState;
  pinned: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSessionState {
  offer?: OfferAgentSessionState;
  [key: string]: unknown;
}

export interface OfferAgentSessionState {
  activeOfferId?: number;
  activeOfferReportId?: number;
  activeCompareSet?: number[];
  lastUserIntent?: "evaluate" | "compare" | "negotiate" | "ask_hr" | "explain" | "edit_offer";
  lastOfferSnapshot?: OfferSnapshot;
  lastEvaluationSummary?: {
    company: string;
    role: string;
    overallScore: number;
    verdict: OfferVerdict;
    summary: string;
  };
  missingInfo?: string[];
  redFlags?: string[];
  userPriorities?: {
    salary?: number;
    stability?: number;
    growth?: number;
    workLifeBalance?: number;
    cityPreference?: string[];
  };
  staleReportReason?: string;
  updatedAt?: string;
}

export type InterviewSessionStatus = "active" | "paused" | "completed" | "abandoned";

export type InterviewQuestionKind = "main" | "follow_up" | "probe" | "clarification" | "reverse_question";

export interface InterviewPlanSnapshot {
  snapshotId: string;
  source: {
    jdId?: number;
    resumeId?: string;
  };
  jdSnapshot?: {
    company?: string;
    role?: string;
    body?: string;
  };
  resumeSnapshot?: {
    title?: string;
    body?: string;
  };
  mode: string;
  difficulty: "normal" | "hard" | "pressure";
  focusAreas: string[];
  allowFollowUps: boolean;
  createdAt: string;
}

export interface InterviewTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  questionNodeId?: string;
  createdAt: string;
}

export interface InterviewQuestionNode {
  id: string;
  kind: InterviewQuestionKind;
  parentId?: string;
  reason?: string;
  question: string;
  answerTurnIds: string[];
  score?: InterviewScore;
  createdAt: string;
}

export interface InterviewScore {
  overall: number;
  dimensions?: Record<string, number>;
  feedback?: string;
}

export interface InterviewScoreArtifact {
  id: string;
  questionNodeId?: string;
  answerTurnIds: string[];
  score: InterviewScore;
  sourceTool?: string;
  createdAt: string;
}

export interface InterviewRecap {
  generatedAt: string;
  overallVerdict: string;
  strengths: string[];
  weaknesses: string[];
  nextPracticePlan: string[];
  questionFeedback?: {
    questionNodeId?: string;
    question: string;
    kind?: InterviewQuestionKind;
    parentQuestion?: string;
    answerExcerpt?: string;
    sourceTurnIds?: string[];
    score?: number;
    feedback?: string;
  }[];
  sourceTurnIds?: string[];
  rawText?: string;
}

export interface InterviewRebindEvent {
  from?: { jdId?: number; resumeId?: string };
  to?: { jdId?: number; resumeId?: string };
  reason: string;
  createdAt: string;
}

export interface InterviewSessionState {
  sessionId?: number;
  planSnapshot: InterviewPlanSnapshot;
  status: InterviewSessionStatus;
  currentQuestionId?: string;
  questionGraph: InterviewQuestionNode[];
  transcript: InterviewTurn[];
  scoreArtifacts?: InterviewScoreArtifact[];
  recap?: InterviewRecap;
  rebindHistory: InterviewRebindEvent[];
}

/* ── API ── */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/* ── Auth & User Management ── */

export interface JWTPayload {
  userId: string;
  username: string;
  role: 'admin' | 'member';
  tokenVersion: number;
}

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'active' | 'rejected';
  token_version: number;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  last_login_at: string | null;
}

export interface UserPublic {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
  lastLoginAt: string | null;
}

export interface TeamInsights {
  overview: {
    totalUsers: number;
    activeThisWeek: number;
    pendingApprovals: number;
  };
  weeklyActivity: Array<{ displayName: string; count: number }>;
  hotDirections: Array<{ archetype: string; count: number }>;
  weeklyTrend: Array<{ week: string; count: number }>;
}
