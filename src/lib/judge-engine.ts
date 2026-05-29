/* ── CV Optimize Judge Engine ──
   Four-dimension priority model: Operation > JD ≈ Reference > Effort */

import type { Operation } from "@/types";
import { getReferenceResume, getRecentPreferences } from "@/lib/server-db";
import { injectRoleWritingGuide } from "@/lib/agent/knowledge/role-writing-guides";

interface TargetJD {
  role: string;
  company: string;
  keywords: string[];
}

interface PreferenceRow {
  section_id: string;
  variant_type: string;
  action: string;
  created_at: string;
  operation?: string;
}

/* ── Temperature by Effort ── */

export function getTemperatureByEffort(effort: number): number {
  if (effort <= 2) return 0.3;
  if (effort === 3) return 0.7;
  return 0.9; // effort 4-5
}

/* ── Effort Prompt ── */

export function buildEffortPrompt(effort: number, enablePlaceholders = true): string {
  switch (effort) {
    case 1:
      return `改写强度 1/5（温和）：仅润色措辞，修正语法错误，改进动词选择。不添加新内容，不改变原文结构和信息顺序。`;
    case 2:
      return enablePlaceholders
        ? `改写强度 2/5（保守）：优化动词和句式，让表达更专业。可以在段落末尾用注释形式标注「💡此处可补充量化数据」，但不要写入正文。`
        : `改写强度 2/5（保守）：优化动词和句式，让表达更专业。可以补充自然语言描述的量化信息，但不要添加 [XX] 占位符。`;
    case 3:
      return enablePlaceholders
        ? `改写强度 3/5（适中）：适度调整句式结构，补充量化描述（用 XX 占位符标注推断值），优化动词选择，可微调段落信息顺序。每段可包含 1-2 个 XX 占位符。`
        : `改写强度 3/5（适中）：适度调整句式结构，补充 1-2 个量化数据点（用自然语言描述，如"提升约30%""服务超过10万用户"），优化动词选择，可微调段落信息顺序。`;
    case 4:
      return enablePlaceholders
        ? `改写强度 4/5（大刀）：大幅重构段落，可使用 STAR 格式重新组织信息。大胆推断量化维度，每段至少补充 3-4 个 XX 占位符。可改变信息呈现方式，但仍需基于原文事实范围。`
        : `改写强度 4/5（大刀）：大幅重构段落，可使用 STAR 格式重新组织信息。大胆推断量化维度，每段至少补充 3-4 个具体数据点（自然语言描述）。可改变信息呈现方式，但仍需基于原文事实范围。`;
    case 5:
      return enablePlaceholders
        ? `改写强度 5/5（重写）：完全重写段落，所有经历用 STAR 格式重组。大量推断量化维度，每段至少 4 个以上 XX 占位符。彻底改变信息组织方式，在原文事实基础上最大化展现专业度和影响力。`
        : `改写强度 5/5（重写）：完全重写段落，所有经历用 STAR 格式重组。大量推断量化维度，每段至少 4 个以上具体数据点（自然语言描述）。彻底改变信息组织方式，在原文事实基础上最大化展现专业度和影响力。`;
    default:
      return buildEffortPrompt(3, enablePlaceholders);
  }
}

/* ── Operation Prompt ── */

export function buildOperationPrompt(operation: Operation, enablePlaceholders = true): string {
  switch (operation) {
    case "full":
      return `## 核心任务：全面优化（最高优先级，不可被其他指令覆盖）

你需要在以下三个维度均衡发力：
1. 措辞润色：修正语法、优化动词、精简冗余
2. 结构优化：在不改变信息顺序的前提下，让逻辑更通顺
3. 量化标注：根据 Effort 强度${enablePlaceholders ? "补充 XX 占位符" : "补充具体数据点（自然语言）"}

注意：你是做「全面优化」，不要只做 STAR 重组、不要只做量化增强、不要只做关键词植入。三者均衡。`;

    case "star":
      return `## 核心任务：STAR 重组（最高优先级，不可被其他指令覆盖）

将原文经历用 STAR 框架（Situation-Task-Action-Result）重新组织：
- Situation（背景）：1 句简要交代上下文
- Task（任务）：1 句说明你承担的角色和目标
- Action（行动）：2-3 句描述你具体做了什么、用什么技术/方法
- Result（成果）：1-2 句展示结果和影响

注意：你的核心任务是重组结构，除非 Effort 很高且开了量化开关，否则不要新增量化数据。关键词植入要自然，不要为了关键词打乱 STAR 结构。`;

    case "quantify":
      return `## 核心任务：量化增强（最高优先级，不可被其他指令覆盖）

你的唯一核心任务就是给简历增加量化维度：
- 识别原文中所有可以量化的点（性能提升、规模、频率、团队、预算、时间）
- ${enablePlaceholders ? "用 [XX] 或 [XX: 推断依据] 占位符标注推断值" : "用自然语言补充具体量化数据（如\"提升约30%\"\"管理15人团队\"）"}
- 保留原文结构和信息顺序不变，不要做 STAR 重组

量化维度参考：
- 工程类：QPS、可用性%、延迟、数据量、服务器数、代码行数
- 产品类：DAU/MAU、留存率、转化率、收入影响、用户规模
- 管理类：团队规模、项目周期、预算金额、跨部门数量

注意：你只需要做量化增强，不要改变段落结构，不要做 STAR 重组。`;

    case "keywords":
      return `## 核心任务：关键词注入（最高优先级，不可被其他指令覆盖）

将目标 JD/行业关键词自然地融入简历段落：
- 优先植入与原文经历最匹配的关键词
- 每个关键词的植入必须自然，读起来像原文就有
- 避免 keyword stuffing（堆砌）、避免生硬插入
- 如无 JD，基于候选人职业画像（targetRoles/superpowers）选择行业通用关键词

注意：你的核心任务是关键词注入，不是量化增强、不是 STAR 重组。关键词要自然。`;

    default:
      return buildOperationPrompt("full");
  }
}

/* ── JD Filter Prompt ── */

export function buildJDFilterPrompt(jd?: TargetJD): string {
  if (!jd || !jd.role) return "";

  const kwBlock = jd.keywords?.length
    ? `\nJD 核心关键词：${jd.keywords.slice(0, 8).join("、")}`
    : "";

  return `## JD 内容滤网（辅助指令，在 Operation 框架内生效）

目标岗位：${jd.role} @ ${jd.company || "未知公司"}${kwBlock}

作为内容滤网，JD 影响你的改写重点选择：
- 优先为与 JD 关键词相关的经历执行你被分配的核心任务
- 与 JD 无关的经历可以降低详细程度，但不跳过
- JD 是滤网，不是操作类型——你仍然要执行 Operation 指定的核心任务

重要性：JD 滤网 ≈ 参考风格，两者平级协作。若 JD 的内容基调与参考风格冲突，内容走 JD、表达技法走参考的可迁移部分。`;
}

/* ── Reference Prompt ── */

export function buildReferencePrompt(refIds?: number[], sectionId?: string, enablePlaceholders = true): string {
  if (!refIds || refIds.length === 0) return "";

  const refSections: string[] = [];
  const refFullCV: string[] = [];

  for (const refId of refIds.slice(0, 3)) {
    const ref = getReferenceResume(refId);
    if (!ref) continue;
    const sections = JSON.parse(ref.sections_json || "[]") as { id: string; title: string; content: string }[];

    // Full CV structure for overall analysis
    const fullText = sections
      .filter(s => s.content?.trim())
      .map(s => `【${s.title}】\n${s.content}`)
      .join("\n\n");
    refFullCV.push(`## ${ref.name} 完整结构\n${fullText}`);

    // Matching section for targeted reference
    const matchingSection = sectionId
      ? sections.find((s) => s.id === sectionId)
      : sections[0];
    if (matchingSection?.content?.trim()) {
      refSections.push(matchingSection.content);
    }
  }

  if (refFullCV.length === 0) return "";

  return `## 参考简历范本（核心指令，优先级最高）

以下是同岗位优秀简历。你的任务不是模仿它的内容，而是**提取它的思考框架**，把同样的深度套到用户的领域中。

${refFullCV.join("\n\n---\n\n")}

### 第一步：分析参考简历的思考框架

先读懂参考简历里每个项目是如何展开的。注意它包含了哪些维度，然后用同样的维度去重写用户的经历：

参考简历的展开模式（逐一检查，缺一不可）：
1. **项目背景**：为什么做这个项目？解决了什么具体问题？有什么约束条件？
2. **产品设计决策**：你做了什么设计选择？为什么这样选而不是那样？架构如何分层的？每层职责是什么？
3. **技术机制细节**：用了什么具体技术方案？检索机制是 Hard Filter + 相似度还是其他？记忆机制是分层还是扁平？为什么？
4. **闭环反馈**：怎么衡量效果？用什么指标？指标怎么驱动迭代？
5. **团队协作与推进**：涉及哪些角色？怎么分期交付？有没有用户培训？
6. **量化成果**：每个维度有什么可衡量的结果？

### 第二步：把同样的思考框架套到用户的领域

用户的经历可能没有参考简历那么详细。你的任务是基于用户已有的真实内容，用参考简历的思考深度去**合理推断和补全**：

- 用户写了"搭建广告数据层"→ 参考简历会写成"设计统一XX层，整合N项核心指标，实现XX自动聚合与XX预警"→ 你也这样写
- 用户写了"设计AI分析能力"→ 参考简历会拆成"规则引擎层 + 检索层 + 生成层"，每层描述设计原理 → 你也拆成对应领域的架构分层
- 用户写了"基于历史数据构建知识库"→ 参考简历会写"沉淀N条策略，通过语义匹配实现复用"→ 你也补全数量和机制
- 用户写了指标体系但没有写闭环 → 参考简历有"模型输出→使用行为→效果反馈→规则优化"的闭环 → 你也给用户补上

### 第三条：禁止的行为

- **不要照抄**参考简历的技术方案（银行的规则引擎不能套到广告平台）
- **不要偷懒**——用户原文只有一句话的地方，参考简历写了5行，你就必须扩展到5行
- **不要省略思考过程**——参考简历写"以XX完成XX，确保XX不参与XX"，你也必须写设计原理，不是只写"做了XX"

${enablePlaceholders ? "用 [XX] 占位符标注需要用户确认的量化数据。" : "用自然语言描述推断的量化数据，不要使用 [XX] 占位符。"}

${refSections.length > 0 ? `### 当前板块参考\n${refSections[0].slice(0, 2000)}\n` : ""}`;
}

/* ── Preference Prompt ── */

export function buildPreferencePrompt(prefs?: PreferenceRow[]): string {
  const effectivePrefs = prefs || getRecentPreferences(10);
  if (effectivePrefs.length === 0) return "";

  const lines = effectivePrefs.map((p) => {
    const symbol = p.action === "accept" ? "✓ 接受了" : "✗ 拒绝了";
    const opLabel = p.operation ? `[${p.operation}]` : "";
    return `- ${symbol}${opLabel}"${p.variant_type}"风格的改写`;
  });

  return `## 用户偏好历史

${lines.join("\n")}

请据此调整输出风格倾向：多输出用户接受的风格，少输出用户拒绝的风格。最近的操作类型偏好也应优先考虑。`;
}

/* ── Placeholder Rules ── */

export function buildPlaceholderRules(enabled: boolean, effort: number): string {
  if (!enabled) {
    return `## 量化规则

不要添加原文中没有的量化数据。只优化已有数字的表述方式。`;
  }

  const perParagraph = effort <= 2 ? "0" : effort === 3 ? "1-2" : effort === 4 ? "3-4" : "4+";

  return `## 量化推断规则（XX 占位符模式）

你可以大胆推断合理的量化维度，但不要编造具体数字。规则：
- 用 [XX] 标注你推断但不确定的具体数值，如「日均处理 [XX]+ 次请求」
- 如需说明推断依据，用 [XX: 依据] 格式，如「[XX: 行业参考 10k+]」
- 保留已有数据：如果原文已经有具体数字，保留并优化表述，不要替换为 XX
- 本段期望的占位符数量：${perParagraph} 个
- 推断原则：基于行业常识和上下文合理推断维度，但不代入具体数字`;
}

/* ── Role-Aware Writing Guidance (delegated to knowledge module) ── */

export function buildRoleGuidance(
  profile?: {
    headline?: string;
    superpowers?: string[];
    targetRoles?: { name: string; fit: string }[];
  },
  roleDirection?: string,
): string {
  // "auto" → detect from profile; specific role → use that; "generic" → no guide
  if (roleDirection && roleDirection !== "auto") {
    if (roleDirection === "generic") return "";
    return injectRoleWritingGuide({ targetRoles: [{ name: roleDirection }] });
  }
  return injectRoleWritingGuide(profile);
}

/* ── Full Judge Prompt Builder ── */

export interface JudgePromptParams {
  sectionId: string;
  sectionContent: string;
  fullCV: Record<string, string>;
  operation: Operation;
  effort: number;
  enablePlaceholders: boolean;
  targetJD?: TargetJD;
  referenceIds?: number[];
  intent?: string;
  userProfile?: {
    headline: string;
    superpowers: string[];
    targetRoles: { name: string; fit: string }[];
  };
  roleDirection?: string;
  questionAnswers?: { question: string; answer: string }[];
}

export function buildJudgePrompt(params: JudgePromptParams): string {
  const {
    sectionId,
    sectionContent,
    fullCV,
    operation,
    effort,
    enablePlaceholders,
    targetJD,
    referenceIds,
    intent,
    userProfile,
    roleDirection,
    questionAnswers,
  } = params;

  // Build CV context
  const cvContextParts = Object.entries(fullCV)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `[${k}] ${v}`);
  const cvContext = cvContextParts.length > 0
    ? cvContextParts.join("\n\n")
    : "（简历其他部分暂无内容）";

  // User profile context
  let profileContext = "";
  if (userProfile?.headline || userProfile?.superpowers?.length) {
    profileContext = `\n候选人职业画像：\n- 头衔：${userProfile.headline || "未知"}\n- 核心能力：${userProfile.superpowers?.join("、") || "未知"}\n- 目标方向：${userProfile.targetRoles?.map(r => r.name).join("、") || "未知"}\n`;
  }

  // Intent
  const intentLine = intent?.trim() ? `\n用户优化意图：${intent.trim()}` : "";

  // Question answers supplement
  let qaBlock = "";
  if (questionAnswers && questionAnswers.length > 0) {
    qaBlock = `\n## 用户补充信息（已确认的真实数据，可直接使用，不需要用 XX 替代）

${questionAnswers.map(qa => `- **${qa.question}** → ${qa.answer}`).join("\n")}

以上是用户确认过的真实信息，请直接融入改写中，用具体数值替代对应的量化维度。`;
  }

  const hasJD = !!(targetJD && targetJD.role);

  // Assemble with priority ordering: Operation > JD ≈ Ref > Effort
  const parts = [
    `你是资深简历优化专家。用户给你一个简历段落，你需要在四维评判模型的指导下生成改写方案。

**重要：全量处理原则**
如果原文包含多个项目/经历/条目，你必须对**每一个**都进行优化，不能只优化第一个。每个项目独立分析其亮点和量化空间，保持原文的项目数量和顺序不变。

优先级规则（按此顺序执行）：
1. ${referenceIds?.length ? "Reference 风格 + Operation（并列最高）" : "Operation（最高优先）"}：${referenceIds?.length ? "参考简历的丰富度、量化密度和表达技法 MUST 被匹配；同时执行用户选择的操作类型" : "用户选择的优化操作类型，决定「做什么」，不可被任何其他维度覆盖"}
2. JD 滤网（JD 决定「重点放哪」）
3. Effort（执行深度）：以上所有指令的执行深度，由 Effort 控制`,
    profileContext,
    buildRoleGuidance(userProfile, roleDirection),
    buildOperationPrompt(operation, enablePlaceholders),
    buildJDFilterPrompt(targetJD),
    buildReferencePrompt(referenceIds, sectionId, enablePlaceholders),
    buildPreferencePrompt(),
    buildEffortPrompt(effort, enablePlaceholders),
    buildPlaceholderRules(enablePlaceholders, effort),
    intentLine,
    qaBlock,
    `## 简历全量上下文（保持与其他 section 的语气和叙事线一致）

${cvContext}

## 原文（${sectionId}）

${sectionContent}`,
  ];

  const systemPrompt = parts.filter(Boolean).join("\n\n");

  const variantCount = hasJD ? 2 : 1;
  let outputInstruction = `## 输出要求

生成 ${variantCount} 个改写方案，以 JSON 格式输出：
{
  "variants": [
    {
      "label": "${hasJD ? "定向" : "通用"}",
      "content": "改写后的完整段落文本...",
      "approach": "一句话说明改写策略"${hasJD ? `,
      "jdRelevance": "说明 JD 相关性"` : ""}
    }`;

  if (hasJD) {
    outputInstruction += `,
    {
      "label": "通用",
      "content": "改写后的完整段落文本...",
      "approach": "一句话说明改写策略（不走 JD 滤网）"
    }`;
  }

  outputInstruction += `
  ]
}

重要规则：
1. 方案之间必须要有明显差异${hasJD ? "（定向方案与通用方案在内容侧重上明显不同）" : ""}
2. ${enablePlaceholders ? "用 [XX] 占位符标注推断的量化值" : "不要添加原文中没有的量化数据"}
3. 随着 Effort 升高，方案之间的差异也要增大
4. 输出必须是合法的 JSON，content 字段中是纯文本（不要用 markdown）
5. 参考偏好历史调整风格倾向`;

  return systemPrompt + "\n\n" + outputInstruction;
}

/* ── Ask Questions Generator ── */

export interface AskQuestionsParams {
  sectionContent: string;
  sectionId: string;
  targetJD?: TargetJD;
  operation: Operation;
  effort: number;
}

export function buildAskQuestionsPrompt(params: AskQuestionsParams): string {
  const { sectionContent, targetJD, operation, effort } = params;

  return `你是简历优化专家。在正式改写之前，你需要向候选人追问几个关键信息，以便写出更精准、更有说服力的简历。

## 原文
${sectionContent}

${targetJD ? `目标岗位：${targetJD.role} @ ${targetJD.company}` : ""}
当前操作类型：${operation}
改写强度：${effort}/5

## 任务
基于原文内容、操作类型和 JD 要求，生成 2-4 个信息补充问题。问题的目的是：
1. 补充原文中模糊的地方（如「负责了XX」→ 具体做了什么、规模和影响）
2. 挖掘可以量化的维度（如数据规模、团队大小、时间跨度）
3. 理解用户的核心贡献和亮点

要求：
- 问题要具体，不能太泛
- 优先问和当前 Operation 最相关的问题（量化增强→问数据，STAR重组→问情境和行动）
- 每个问题附带 3-4 个单选选项 + 一个「其他（请填写）」选项，或者用开放文本形式
- 问题数量：effort 4 时 2-3 个，effort 5 时 3-4 个

以 JSON 格式输出：
{
  "questions": [
    {
      "id": 1,
      "question": "你开发的 API 服务日均请求量大概是多少？",
      "type": "radio",
      "options": ["<1k", "1k-10k", "10k-100k", ">100k", "不确定"],
      "required": false
    },
    {
      "id": 2,
      "question": "当时的团队规模和你在其中的角色？",
      "type": "text",
      "required": false
    }
  ]
}`;
}
