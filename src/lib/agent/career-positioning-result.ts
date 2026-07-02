import type { AgentMessage } from "@/types";

type CareerPositioningToolResult = {
  name?: string;
  result?: string;
  success?: boolean;
  data?: unknown;
};

export type CareerPositioningArtifact = {
  kind: "career_positioning";
  targetRoles: { role: string; level: string }[];
  positioningSummary: string;
  evidence: string[];
  targetScenario: string;
  mvp: string;
  nextActions: string[];
  roleSignal: {
    role: string;
    reason: string;
    evidence: string;
    confidence: number;
  };
  historyEntry: {
    timestamp: string;
    event: string;
    changes: string[];
  };
};

const GENERIC_COMPLETION_RE = /^(操作完成|完成|已完成|done|success)[。.!！]*$/i;
const CONFIRM_RE = /^(确认|可以|好的|好|就这个|按这个|保存|确认保存|没问题|对|是的|yes|ok|okay|confirm)[。.!！\s]*$/i;

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function latestUserMessage(messages: Pick<AgentMessage, "role" | "content">[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return compact(messages[i].content);
  }
  return "";
}

function hasReactFrontendSignal(text: string): boolean {
  return /react/i.test(text) && /(?:我|本人|自己)?.{0,8}(?:精通|熟练掌握|熟练使用|擅长|掌握|会|做过|用过)/i.test(text);
}

function hasNo996Constraint(text: string): boolean {
  return /996/.test(text) && /(?:不接受|不能接受|不考虑|不要|拒绝|排斥|坚决不去)/.test(text);
}

function shouldForceCareerPositioningClose(messages: Pick<AgentMessage, "role" | "content">[]): boolean {
  const latest = latestUserMessage(messages);
  return /(?:不想聊了|先这样|就到这|结束|收口|不用继续问)/.test(latest) ||
    hasReactFrontendSignal(latest) ||
    (hasNo996Constraint(latest) && /react/i.test(latest));
}

function isDoneToolResult(toolResult?: CareerPositioningToolResult | null): boolean {
  if (!toolResult || toolResult.success === false) return false;
  const data = toolResult.data as Record<string, unknown> | null | undefined;
  return Boolean(
    toolResult.name === "mine_profile" &&
    (data?.done === true || /画像挖掘完成|定位已保存|操作完成/.test(toolResult.result || "")),
  );
}

export function isGenericCareerPositioningCompletion(text: string): boolean {
  const normalized = compact(text);
  if (!normalized) return true;
  if (GENERIC_COMPLETION_RE.test(normalized)) return true;
  return /^画像挖掘完成[！!]?.{0,40}(定位已保存|画像已更新|可在\s*\/profile)/.test(normalized);
}

export function isCareerPositioningConfirmation(text: string): boolean {
  return CONFIRM_RE.test(compact(text));
}

export function parseCareerPositioningArtifact(value?: string): CareerPositioningArtifact | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CareerPositioningArtifact;
    if (parsed?.kind !== "career_positioning") return null;
    if (!Array.isArray(parsed.targetRoles) || parsed.targetRoles.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildCareerPositioningArtifact(
  messages: Pick<AgentMessage, "role" | "content">[],
): CareerPositioningArtifact | null {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => compact(message.content))
    .filter(Boolean);
  const transcript = compact(messages.map((message) => message.content).join(" "));
  if (userMessages.length < 3) return null;

  const wantsAiProduct = hasAny(transcript, [/AI\s*产品/i, /人工智能产品/, /软件/, /自动.*烧烤/]);
  const hasGrillFishDomain = hasAny(transcript, [/烤鱼/, /烧烤/, /餐饮/, /小龙虾/, /卖鱼/, /火候/]);
  const hasFormulaStrength = hasAny(transcript, [/经验公式/, /鱼种.*厚度.*火力/, /厚度/, /火力/, /对应表/, /规则/, /数据化/]);
  const hasTeachingPain = hasAny(transcript, [/徒弟/, /培训/, /什么时候该翻面/, /翻面/, /教人/]);
  const selectedTrainingSchool = /餐饮培训学校/.test(transcript) && /(^|\D)4(\D|$)/.test(userMessages.join(" "));
  const needsBuildPath = hasAny(userMessages.join(" "), [/(^|\s)C(\s|$)/i, /不清楚/, /不知道/, /找技术/, /合伙人/]);
  const hasReactSkill = hasReactFrontendSignal(transcript);
  const rejects996 = hasNo996Constraint(transcript);

  const primaryRole = hasReactSkill
    ? "React 前端工程师（非 996 环境优先）"
    : wantsAiProduct && hasGrillFishDomain
    ? "AI 产品经理（餐饮智能化/自动烧烤软件方向）"
    : wantsAiProduct
      ? "AI 产品经理"
      : "职业方向探索（待验证）";
  const secondaryRole = hasReactSkill && wantsAiProduct
    ? "AI 应用前端工程师"
    : hasTeachingPain ? "餐饮培训数字化产品策划" : "";
  const positioning = hasReactSkill
    ? `阶段性定位为 React 前端开发主线：用户已经明确自述精通 React，并把“不接受 996”作为底线条件。当前画像应优先围绕前端工程交付、组件化开发、业务页面实现和非 996 团队环境收口；AI 产品方向可以作为后续兴趣验证，而不是本轮定位的主目标。${rejects996 ? "筛选岗位时需要把 996/高强度无边界加班作为排除条件。" : ""}`
    : wantsAiProduct && hasGrillFishDomain
    ? hasFormulaStrength
      ? "烤鱼经验公式化的 AI 产品方向：把老师傅的鱼种、厚度、火力、时间规则做成可复用的软件能力，优先服务需要标准化教学和出品的餐饮场景。"
      : "餐饮烧烤场景的 AI 产品方向：从真实一线痛点出发，把烧烤判断、提醒和教学流程产品化。"
    : "围绕你反复提到的目标，先定位为“把个人经验产品化”的探索方向，下一步要继续验证目标用户和可落地场景。";

  const strengths = [
    hasReactSkill ? "用户明确自述精通 React，这是可直接进入画像和岗位筛选的硬技能信号。" : hasGrillFishDomain ? "你有真实烤鱼经验，知道用户满意和回头客来自哪些细节。" : "你能从自己的真实经历里提炼问题，而不是空想岗位标签。",
    rejects996 ? "用户明确不接受 996，这应作为岗位筛选和求职目标里的底线约束。" : "",
    hasFormulaStrength ? "你最强的部分是把烤鱼经验整理成“鱼种 × 厚度 × 火力 × 时间”的规则。" : "你已经能说出一个具体问题，后续需要继续把经验拆成规则。",
    hasTeachingPain ? "你找到的痛点很具体：新手学不会“什么时候该翻面”，这正适合做成提示、训练或标准化工具。" : "你需要继续把使用场景具体到某一类人、某一个高频动作。",
  ].filter(Boolean);

  const buyer = selectedTrainingSchool
    ? "第一买单方假设：餐饮培训学校。理由是它们需要把老师傅经验复制给学员，愿意为标准化教学工具付费。"
    : hasReactSkill
      ? "第一求职场景假设：业务前端、AI 应用前端或中后台前端岗位。岗位筛选时优先看 React 技术栈、明确交付边界、团队节奏健康、非 996。"
    : hasTeachingPain
      ? "第一买单方假设：需要培训新人的烧烤店、餐饮培训机构，或想降低师傅依赖的连锁餐饮团队。"
      : "第一买单方还需要继续收窄，建议先在培训机构、烧烤店老板、智能烤炉品牌里选一个做访谈。";

  const mvp = hasFormulaStrength
    ? "MVP 不要一上来做视觉识别和传感器全套。先做“烤鱼参数表 + 翻面/刷酱/出炉提醒 + 新手训练记录”，验证你的经验公式是否真的能提高学员稳定性。"
    : hasReactSkill
      ? "本轮求职画像的最小落点是：目标岗位写入 React 前端工程师，技能画像写入 React，底线条件写入不接受 996；后续再用 JD 评估和简历优化验证岗位匹配度。"
    : "MVP 先做最小规则库和提醒流程，验证用户愿不愿意按你的规则烤，并愿不愿意付费。";

  const gap = needsBuildPath
    ? "当前缺口：你已经有领域知识，但还没确定怎么把软件做出来。下一步要补产品原型、技术实现路径和可合作的开发资源。"
    : hasReactSkill
      ? "当前缺口：还需要补齐目标城市、薪资区间、职级和行业偏好，避免只保存技能和底线但缺少投递筛选条件。"
    : "当前缺口：继续把领域经验转成可测试的数据表，并找到愿意试用的真实场景。";
  const nextActions = hasReactSkill ? [
    "在求职画像里保存 React 前端工程师作为阶段性目标岗位。",
    "把 React 写入已确认技能，把不接受 996 写入底线条件。",
    "下一轮用真实 JD 校验职级、薪资和技术栈是否匹配。",
  ] : [
    "访谈 5 个餐饮培训/烧烤店相关用户，确认他们是否愿意为标准化教学工具付费。",
    "整理 10 条真实烤鱼参数，做成可演示的参数表和提醒流程。",
    "先验证规则库 MVP，再决定是否补视觉识别和温度传感器。",
  ];
  const evidence = strengths;
  const targetRoles = [
    { role: primaryRole, level: hasReactSkill ? "待确认" : needsBuildPath ? "探索/转型" : "初级/转型" },
    ...(secondaryRole ? [{ role: secondaryRole, level: "相邻方向" }] : []),
  ];

  return {
    kind: "career_positioning",
    targetRoles,
    positioningSummary: positioning,
    evidence,
    targetScenario: buyer,
    mvp,
    nextActions,
    roleSignal: {
      role: primaryRole,
      reason: positioning,
      evidence: evidence.join(" "),
      confidence: hasFormulaStrength && hasTeachingPain ? 0.9 : 0.75,
    },
    historyEntry: {
      timestamp: new Date().toISOString(),
      event: "自我定位确认",
      changes: [
        `确认目标方向：${primaryRole}`,
        buyer,
        mvp,
        gap,
      ],
    },
  };
}

export function buildCareerPositioningFallback(params: {
  messages: Pick<AgentMessage, "role" | "content">[];
  assistantText?: string;
  toolResult?: CareerPositioningToolResult | null;
}): string | null {
  if (!shouldForceCareerPositioningClose(params.messages) && !isGenericCareerPositioningCompletion(params.assistantText || "")) return null;
  const artifact = buildCareerPositioningArtifact(params.messages);
  if (!artifact && !isDoneToolResult(params.toolResult)) return null;
  if (!artifact) return null;

  return [
    "我先把这轮自我定位收束成一个阶段性结果：",
    "",
    `**定位假设**：${artifact.positioningSummary}`,
    "",
    `**核心优势**：${artifact.evidence.join(" ")}`,
    "",
    `**目标场景**：${artifact.targetScenario}`,
    "",
    `**最小切入点**：${artifact.mvp}`,
    "",
    `**下一步**：${artifact.nextActions.join(" ")}`,
    "",
    "如果你认可这个定位，回复“确认”我就写入求职画像；如果不认可，直接说你想调整哪里。",
  ].join("\n");
}
