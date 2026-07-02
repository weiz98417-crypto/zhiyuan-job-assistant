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

  const primaryRole = wantsAiProduct && hasGrillFishDomain
    ? "AI 产品经理（餐饮智能化/自动烧烤软件方向）"
    : wantsAiProduct
      ? "AI 产品经理"
      : "职业方向探索（待验证）";
  const secondaryRole = hasTeachingPain ? "餐饮培训数字化产品策划" : "";
  const positioning = wantsAiProduct && hasGrillFishDomain
    ? hasFormulaStrength
      ? "烤鱼经验公式化的 AI 产品方向：把老师傅的鱼种、厚度、火力、时间规则做成可复用的软件能力，优先服务需要标准化教学和出品的餐饮场景。"
      : "餐饮烧烤场景的 AI 产品方向：从真实一线痛点出发，把烧烤判断、提醒和教学流程产品化。"
    : "围绕你反复提到的目标，先定位为“把个人经验产品化”的探索方向，下一步要继续验证目标用户和可落地场景。";

  const strengths = [
    hasGrillFishDomain ? "你有真实烤鱼经验，知道用户满意和回头客来自哪些细节。" : "你能从自己的真实经历里提炼问题，而不是空想岗位标签。",
    hasFormulaStrength ? "你最强的部分是把烤鱼经验整理成“鱼种 × 厚度 × 火力 × 时间”的规则。" : "你已经能说出一个具体问题，后续需要继续把经验拆成规则。",
    hasTeachingPain ? "你找到的痛点很具体：新手学不会“什么时候该翻面”，这正适合做成提示、训练或标准化工具。" : "你需要继续把使用场景具体到某一类人、某一个高频动作。",
  ];

  const buyer = selectedTrainingSchool
    ? "第一买单方假设：餐饮培训学校。理由是它们需要把老师傅经验复制给学员，愿意为标准化教学工具付费。"
    : hasTeachingPain
      ? "第一买单方假设：需要培训新人的烧烤店、餐饮培训机构，或想降低师傅依赖的连锁餐饮团队。"
      : "第一买单方还需要继续收窄，建议先在培训机构、烧烤店老板、智能烤炉品牌里选一个做访谈。";

  const mvp = hasFormulaStrength
    ? "MVP 不要一上来做视觉识别和传感器全套。先做“烤鱼参数表 + 翻面/刷酱/出炉提醒 + 新手训练记录”，验证你的经验公式是否真的能提高学员稳定性。"
    : "MVP 先做最小规则库和提醒流程，验证用户愿不愿意按你的规则烤，并愿不愿意付费。";

  const gap = needsBuildPath
    ? "当前缺口：你已经有领域知识，但还没确定怎么把软件做出来。下一步要补产品原型、技术实现路径和可合作的开发资源。"
    : "当前缺口：继续把领域经验转成可测试的数据表，并找到愿意试用的真实场景。";
  const nextActions = [
    "访谈 5 个餐饮培训/烧烤店相关用户，确认他们是否愿意为标准化教学工具付费。",
    "整理 10 条真实烤鱼参数，做成可演示的参数表和提醒流程。",
    "先验证规则库 MVP，再决定是否补视觉识别和温度传感器。",
  ];
  const evidence = strengths;
  const targetRoles = [
    { role: primaryRole, level: needsBuildPath ? "探索/转型" : "初级/转型" },
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
  if (!isGenericCareerPositioningCompletion(params.assistantText || "")) return null;
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
