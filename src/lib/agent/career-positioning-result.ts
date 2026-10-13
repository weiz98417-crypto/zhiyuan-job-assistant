import type { AgentMessage } from "@/types";
import { stableContentHash } from "@/lib/agent/verified-action";

type PositioningMessage = Pick<AgentMessage, "role" | "content"> & Partial<Pick<AgentMessage, "itemId">>;

export type CareerPositioningEvidence = {
  evidenceId: string;
  category: "user_stated";
  topic: string;
  claim: string;
  sourceQuote: string;
  sourceTurnId?: string;
  contextQuote?: string;
};

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
  sourceEvidence: CareerPositioningEvidence[];
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

function latestUserMessage(messages: Pick<AgentMessage, "role" | "content">[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return compact(messages[index].content);
  }
  return "";
}

function hasReactFrontendSignal(text: string): boolean {
  return /(?:我|本人).{0,6}(?:精通|熟练掌握|熟练使用|掌握|会|做过|用过)\s*React/i.test(text)
    && !/不|没|学习|在学|示例|假设|朋友|同事|[“”"]/.test(text);
}

function hasNo996Constraint(text: string): boolean {
  return /996/.test(text) && /(?:不接受|不能接受|不考虑|不要|拒绝|排斥|坚决不去)/.test(text);
}

function shouldForceCareerPositioningClose(messages: Pick<AgentMessage, "role" | "content">[]): boolean {
  const latest = latestUserMessage(messages);
  return /(?:不想聊了|先这样|就到这|结束|收口|不用继续问|阶段性结论|阶段性结果)/.test(latest) ||
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

function isSelfPositioningFrameworkLoaded(toolResult?: CareerPositioningToolResult | null): boolean {
  return toolResult?.name === "self_positioning" && toolResult.success !== false;
}

function buildCareerPositioningOpeningQuestion(): string {
  return [
    "好，我们从第一阶段开始，先对齐你的期望。",
    "",
    "这次自我定位结束时，你最希望得到什么？",
    "",
    "1. 明确一个或几个目标岗位",
    "2. 排除明显不适合的方向",
    "3. 形成未来一个月的求职行动方案",
    "4. 其他目标（请直接说）",
    "",
    "你可以选一项，也可以按优先级排序。",
  ].join("\n");
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
    const parsed: unknown = JSON.parse(value);
    return isCareerPositioningArtifact(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isCareerPositioningArtifact(value: unknown): value is CareerPositioningArtifact {
  const isRecord = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item));
  const isText = (item: unknown): item is string => typeof item === "string" && item.trim().length > 0;
  const isTextList = (item: unknown): item is string[] => Array.isArray(item) && item.length > 0 && item.every(isText);
  if (!isRecord(value) || value.kind !== "career_positioning") return false;
  if (!Array.isArray(value.targetRoles) || value.targetRoles.length === 0 || !value.targetRoles.every((item) => isRecord(item) && isText(item.role) && isText(item.level))) return false;
  if (!isText(value.positioningSummary) || !isText(value.targetScenario) || !isText(value.mvp) || !isTextList(value.evidence) || !isTextList(value.nextActions)) return false;
  if (!Array.isArray(value.sourceEvidence) || value.sourceEvidence.length === 0 || !value.sourceEvidence.every((item) =>
    isRecord(item) && item.category === "user_stated" && isText(item.evidenceId) && /^cp-[a-f0-9]{8}$/.test(item.evidenceId)
    && isText(item.topic) && isText(item.claim) && isText(item.sourceQuote)
    && (item.sourceTurnId === undefined || isText(item.sourceTurnId))
    && (item.contextQuote === undefined || isText(item.contextQuote))
  )) return false;
  if (!isRecord(value.roleSignal) || !isText(value.roleSignal.role) || !isText(value.roleSignal.reason) || !isText(value.roleSignal.evidence)
    || typeof value.roleSignal.confidence !== "number" || !Number.isFinite(value.roleSignal.confidence)
    || value.roleSignal.confidence < 0 || value.roleSignal.confidence > 1) return false;
  return isRecord(value.historyEntry) && isText(value.historyEntry.timestamp) && isText(value.historyEntry.event) && isTextList(value.historyEntry.changes);
}

export function buildCareerPositioningArtifact(
  messages: PositioningMessage[],
): CareerPositioningArtifact | null {
  if (messages.filter((message) => message.role === "user" && compact(message.content)).length < 3) return null;
  const facts = collectUserPositioningEvidence(messages);
  const sourceEvidence = [...facts.values()];
  const reactEvidence = facts.get("skill:React");
  const hasReactSkill = Boolean(reactEvidence && !/学习|尚未掌握|未确认/.test(reactEvidence.claim));
  const wantsAiProduct = facts.get("goal:ai_product")?.claim === "目标方向：AI 产品";
  const hasGrillFishDomain = facts.get("domain:catering")?.claim === "自述餐饮/烧烤领域经历";
  const hasFormulaStrength = hasGrillFishDomain && facts.has("strength:formula");
  const hasTeachingPain = hasGrillFishDomain && facts.has("experience:teaching");
  const rejects996 = facts.get("constraint:996")?.claim === "不接受 996";
  const needsBuildPath = facts.has("gap:implementation");
  const primaryRole = wantsAiProduct && hasGrillFishDomain
    ? "AI 产品经理（餐饮智能化/自动烧烤软件方向）"
    : wantsAiProduct ? "AI 产品经理"
      : hasReactSkill ? `React 前端工程师${rejects996 ? "（非 996 环境优先）" : ""}`
        : "职业方向探索（待验证）";
  const positioning = wantsAiProduct && hasGrillFishDomain
    ? `[推断] ${hasFormulaStrength ? "烤鱼经验公式化的 AI 产品方向" : "餐饮场景的 AI 产品方向"}可作为待验证假设，基于用户目标与自述领域经历，尚需验证岗位和交付能力。`
    : wantsAiProduct ? "[推断] AI 产品经理可作为阶段性目标；兴趣和学习经历不能证明已具备岗位要求的能力，需要用真实项目及 JD 验证。"
      : hasReactSkill ? "[推断] React 前端工程师可作为候选方向，依据是用户自述的技能；熟练程度和职级需要通过项目与 JD 验证。"
        : "[推断] 目前个人技能和经历证据不足，暂不确认具体职业方向；需要先核对目标岗位与真实项目经历。";
  const buyer = facts.has("scenario:training_school") && hasGrillFishDomain
    ? "[假设] 用户提出餐饮培训学校作为目标场景，付费意愿需要访谈验证。"
    : hasTeachingPain ? "[假设] 可验证餐饮新人培训场景，目标用户与付费意愿尚未确认。"
      : hasReactSkill ? `[假设] 用真实 React 前端岗位验证技术栈和职级${rejects996 ? "，筛选时排除 996" : ""}。`
        : "[假设] 先选一个真实目标岗位，核对工作内容、能力要求和个人偏好。";
  const mvp = hasFormulaStrength
    ? "[建议] MVP 先做烤鱼参数表与提醒流程，用真实试用结果验证规则，暂不假设已有商业成果。"
    : "[建议] 先整理一段真实项目经历和一个目标 JD，列出已具备、正在学习和待验证的能力。";
  const nextActions = hasGrillFishDomain && wantsAiProduct ? [
    "[建议] 访谈目标场景用户，核对具体需求与付费意愿。",
    "[建议] 用本人提供的真实参数做最小规则演示，不补造参数或成果。",
    "[建议] 用真实 JD 验证产品方向与当前能力的差距。",
  ] : [
    "[建议] 补充一个本人真实项目，区分个人贡献与团队成果。",
    "[建议] 将正在学习的技能保留为学习状态，不当作已掌握技能。",
    "[建议] 用一个目标 JD 验证方向、职级与工作方式。",
  ];
  const evidence = sourceEvidence.map((item) => `[用户陈述 ${item.evidenceId}] ${item.claim}`);
  const targetRoles = [{ role: primaryRole, level: needsBuildPath ? "探索/转型" : "待验证" }];

  return {
    kind: "career_positioning",
    targetRoles,
    positioningSummary: positioning,
    evidence,
    sourceEvidence,
    targetScenario: buyer,
    mvp,
    nextActions,
    roleSignal: {
      role: primaryRole,
      reason: positioning,
      evidence: evidence.join(" "),
      confidence: sourceEvidence.length >= 3 ? 0.65 : 0.35,
    },
    historyEntry: {
      timestamp: new Date().toISOString(),
      event: "阶段性职业定位假设",
      changes: [
        `候选目标方向：${primaryRole}`,
        buyer,
        mvp,
        "职级与岗位能力需要真实证据验证，未经用户批准不写入画像。",
      ],
    },
  };
}

function collectUserPositioningEvidence(messages: PositioningMessage[]): Map<string, CareerPositioningEvidence> {
  const facts = new Map<string, CareerPositioningEvidence>();
  messages.forEach((message, index) => {
    if (message.role !== "user") return;
    const sourceQuote = message.content.trim();
    const withdrawsPreviousTurn = /(?:刚才|上一条|前面).{0,12}(?:示例|引用|假设|虚构|不是我的)/.test(sourceQuote);
    if (withdrawsPreviousTurn) {
      const previousUserTurn = messages.slice(0, index).reverse().find((item) => item.role === "user");
      for (const [topic, fact] of facts) {
        if (previousUserTurn && fact.sourceQuote === previousUserTurn.content.trim()) facts.delete(topic);
      }
    }
    const statements = sourceQuote.replace(/[“「"]([^”」"]*)[”」"]/g, "").split(/[，,。；;！!？?\n]/);
    const record = (topic: string, claim: string) => facts.set(topic, {
      evidenceId: `cp-${stableContentHash(`${message.itemId || index}:${topic}:${sourceQuote}`).split(":")[1]}`,
      category: "user_stated",
      topic,
      claim,
      sourceQuote,
      sourceTurnId: message.itemId,
    });
    if (/^\d+$/.test(sourceQuote)) {
      const question = messages[index - 1];
      if (question?.role === "assistant" && /(?:目标用户|买单方|服务对象|目标场景)/.test(question.content)) {
        const option = question.content.match(new RegExp(`(?:^|\\n)\\s*${sourceQuote}[.、．)]\\s*([^\\n]+)`))?.[1]?.trim();
        if (option === "餐饮培训学校") {
          record("scenario:training_school", "选择餐饮培训学校作为待验证目标场景");
          const selection = facts.get("scenario:training_school")!;
          selection.contextQuote = question.content;
        }
      }
      return;
    }
    let nonPersonalScope = false;
    for (const rawStatement of statements) {
      const statement = rawStatement.trim();
      if (/(?:示例|举个例子|假设|虚构|引用|参考简历|简历原文|朋友|同事|他人|对方|别人|他|她|你说|你提到)/.test(statement)) {
        nonPersonalScope = true;
        continue;
      }
      if (/^(?:但|不过|而)?(?:我(?:其实|实际|现在|本人)|本人(?:其实|实际|现在))/.test(statement)) nonPersonalScope = false;
      if (nonPersonalScope) continue;
      const isAspirational = /(?:希望|计划|打算|准备|未来|将来|想(?:学|用|掌握|精通|会|做|经营)|如果|假如)/.test(statement);
      for (const skill of ["React", "SQL", "Python"]) {
        if (!new RegExp(skill, "i").test(statement)) continue;
        if (new RegExp(`(?:不(?:是|算)?精通|没(?:有)?精通|并非精通|谈不上精通)[^，。]{0,8}${skill}|${skill}[^，。]{0,8}(?:不精通|不算精通)`, "i").test(statement)) {
          record(`skill:${skill}`, `${skill} 熟练程度未确认`);
        } else if (new RegExp(`(?:不(?:会|熟悉|熟练|掌握)|尚未掌握|没(?:有)?(?:用过|做过|学过|学会|掌握))[^，。]{0,8}${skill}|${skill}[^，。]{0,8}(?:不会|不熟悉|不熟练|没掌握)`, "i").test(statement)) {
          record(`skill:${skill}`, `${skill} 尚未掌握`);
        } else if (isAspirational) {
          record(`skill:${skill}`, `${skill} 学习/使用意向（掌握程度未确认）`);
        } else if (new RegExp(`(?:在学|学习|开始学)[^，。]{0,8}${skill}|${skill}[^，。]{0,8}(?:在学|学习|入门|新手)`, "i").test(statement)) {
          record(`skill:${skill}`, `${skill} 正在学习`);
        } else if (new RegExp(`(?:我|本人)[^，。]{0,6}(?:精通|熟练掌握|熟练使用|擅长|掌握|会|做过|用过|用)[^，。]{0,4}${skill}`, "i").test(statement)) {
          const proficiency = statement.match(/精通|熟练掌握|熟练使用|擅长|掌握|会|做过|用过|用/)?.[0] || "使用";
          record(`skill:${skill}`, `自述${proficiency} ${skill}`);
        }
      }
      if (/(?:我|本人).{0,8}(?:想|希望|目标|转).{0,8}(?:AI\s*产品|人工智能产品)/i.test(statement)) record("goal:ai_product", "目标方向：AI 产品");
      if (/(?:不想|不考虑|不做).{0,8}(?:AI\s*产品|人工智能产品)/i.test(statement)) record("goal:ai_product", "不选择 AI 产品方向");
      const deniesCateringExperience = /(?:没有|没(?:有)?(?:做过|经营过|从事过|学过)|不是|不做).{0,12}(?:烤鱼|烧烤|餐饮|小龙虾|卖鱼)/.test(statement);
      if (!isAspirational && !deniesCateringExperience && /(?:我|本人).{0,12}(?:做过|之前|从事|学的是|经营|经验).{0,12}(?:烤鱼|烧烤|餐饮|小龙虾|卖鱼)|(?:我|本人).{0,12}(?:烤鱼|烧烤|餐饮|小龙虾|卖鱼).{0,12}(?:经验|专业|工作|经历)/.test(statement)) record("domain:catering", "自述餐饮/烧烤领域经历");
      if (deniesCateringExperience) {
        record("domain:catering", "未确认餐饮领域经历");
        facts.delete("strength:formula");
        facts.delete("experience:teaching");
        facts.delete("scenario:training_school");
      }
      if (!isAspirational && !deniesCateringExperience && !/(?:没有|不会|没做过)/.test(statement) && /(?:我|本人).{0,10}(?:经验公式|鱼种|厚度|火力|对应表)/.test(statement)) record("strength:formula", "自述将领域经验整理为参数规则");
      if (!isAspirational && !/(?:没|不)/.test(statement) && /(?:我|本人|带).{0,8}(?:徒弟|培训新人|教人)/.test(statement)) record("experience:teaching", "自述新人教学经历与痛点");
      if (/(?:我|本人).{0,8}(?:不清楚|不知道|找技术|合伙人)/.test(statement)) record("gap:implementation", "技术实现路径待确认");
      if (/餐饮培训学校.{0,8}(?:会买单|目标|用户)|(?:我|本人).{0,8}(?:选择|选|目标).{0,8}餐饮培训学校/.test(statement)) record("scenario:training_school", "提出餐饮培训学校作为待验证目标场景");
      if (hasNo996Constraint(statement)) record("constraint:996", "不接受 996");
      else if (/(?:我|本人).{0,8}(?:接受|可以).{0,6}996/.test(statement)) record("constraint:996", "接受 996");
    }
  });
  return facts;
}

export function buildCareerPositioningFallback(params: {
  messages: PositioningMessage[];
  assistantText?: string;
  toolResult?: CareerPositioningToolResult | null;
}): string | null {
  if (
    isSelfPositioningFrameworkLoaded(params.toolResult) &&
    isGenericCareerPositioningCompletion(params.assistantText || "")
  ) {
    return buildCareerPositioningOpeningQuestion();
  }
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
    "这些方向需要你确认并用真实材料验证，个人事实以用户原始陈述为准；未经批准不写入求职画像。",
    "",
    "**来源证据**",
    ...artifact.sourceEvidence.flatMap((item) => [
      `- ${item.evidenceId} · 用户陈述 · ${item.claim}`,
      `  > ${compact(item.sourceQuote)}`,
      ...(item.contextQuote ? [`  > 选项上下文：${compact(item.contextQuote)}`] : []),
    ]),
  ].join("\n");
}
