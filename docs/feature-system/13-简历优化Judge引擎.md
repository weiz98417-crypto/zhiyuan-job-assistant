# 简历优化 Judge 引擎的产品构造

纸鸢求职助手的简历优化 Judge 引擎，不是“帮我润色一下简历”的 prompt。它是简历改写前的决策层：系统要判断这次优化到底是全面优化、STAR 重组、量化增强还是关键词注入；要控制改写强度；要参考目标 JD、优秀简历记忆、用户画像和历史偏好；还要把结果限制在可审阅、可提案、可保存的范围内。

这个引擎的产品目标是：把“优化简历”这个模糊请求，拆成可配置、可解释、可验证的改写策略。

## 1. 产品定位

用户说“帮我优化这段经历”时，背后可能是完全不同的需求：

- 只是让句子更专业，不改变内容。
- 按 STAR 结构重组项目。
- 补充量化维度，但不编造具体数字。
- 针对某个 JD 植入关键词。
- 参考优秀简历的结构和表达密度。
- 根据用户职业画像突出 AI 产品、数据产品、运营或其他方向。
- 根据用户过去接受或拒绝的改写风格调整输出。

所以 Judge 引擎不是一个固定 prompt，而是一个多输入的策略构造器：

```text
简历板块原文
  + 操作类型 operation
  + 改写强度 effort
  + 是否允许 XX 占位符
  + 目标 JD
  + 显式参考简历
  + 语义检索参考片段
  + 优秀简历抽象模式
  + 用户画像
  + 历史偏好
  -> buildJudgePrompt()
  -> DeepSeek 生成 variants
  -> 用户审阅
  -> 进入提案系统或保存系统
```

它连接的是“生成改写方案”和“安全写入简历”之间的中间层。

## 2. 为什么不能只有一个“优化”按钮

一个按钮式的简历优化会让产品失控：

- 用户想轻微润色，AI 却大幅重写。
- 用户想补关键词，AI 却做成 STAR 重组。
- 用户没有真实数据，AI 直接编出百分比和规模。
- 参考简历被照抄，污染用户简历真实性。
- JD 要求被过度放大，原有真实经历被扭曲。
- 用户每次拒绝的风格，下次系统还继续生成。

Judge 引擎通过四个维度拆开控制权：

```text
Operation：这次主要做什么
JD / Reference：重点向哪里靠
Effort：改到多深
Preference：用户过去喜欢什么、不喜欢什么
```

当前源码注释里直接写了优先级模型：`Operation > JD ≈ Reference > Effort`。也就是说，操作类型决定核心任务，JD 和参考简历决定侧重点和表达方式，Effort 决定执行深度，而不是反过来让模型自由发挥。

## 3. 系统入口和关键文件

| 层级 | 文件或接口 | 作用 |
|---|---|---|
| Prompt 构造 | `src/lib/judge-engine.ts` | 构造 operation、effort、JD、reference、profile、preference 等 prompt 片段。 |
| 优化接口 | `src/app/api/cv/optimize-section/route.ts` | 接收板块内容和控制参数，调用 DeepSeek，返回改写 variants。 |
| 偏好记录 | `src/app/api/cv/record-preference/route.ts` | 记录用户接受、拒绝、重改等反馈，并反馈给记忆系统。 |
| 角色写作指南 | `src/lib/agent/knowledge/role-writing-guides.ts` | 根据目标角色注入 PM、AI PM、后端、前端、数据、设计、运营等写法。 |
| 语义参考检索 | `src/lib/reference-resume-vector.ts` | 从参考简历向量库检索同岗位、同板块片段。 |
| 抽象模式记忆 | `src/lib/excellent-resume-patterns.ts` | 从优秀简历中提取可迁移写作模式。 |
| 写入保护 | `src/lib/agent/resume-edit-proposals.ts`、`src/lib/agent/resume-save-guard.ts` | 优化结果不能直接覆盖 CV，必须走提案或保存保护。 |

这个系统本身不负责最终保存。它只负责生成可审阅方案。

## 4. API 输入和硬边界

`POST /api/cv/optimize-section` 的核心输入包括：

| 参数 | 含义 |
|---|---|
| `sectionId` | 当前优化的简历板块，例如 `summary`、`experience`、`projects`、`skills`。 |
| `sectionContent` | 当前板块原文，少于 20 字会拒绝。 |
| `fullCV` | 简历全量上下文，用于保持其他板块语气和叙事一致。 |
| `operation` | `full`、`star`、`quantify`、`keywords`。 |
| `effort` | 1 到 5 的改写强度。 |
| `enablePlaceholders` | 是否允许用 `[XX]` 标注需要用户确认的数据。 |
| `targetJD` | 目标岗位、公司和关键词。 |
| `userProfile` | 用户职业画像，包含 headline、superpowers、targetRoles。 |
| `roleDirection` | 角色方向，`auto`、`generic` 或具体方向。 |
| `questionAnswers` | 用户补充过的真实信息，可直接写入。 |
| `referenceIds` | 用户显式选中的参考简历，最多取 3 份。 |
| `fast` | 在没有语义参考和模式记忆时可使用 flash 模型。 |

接口的硬边界：

- 必须已登录。
- `sectionContent` 至少 20 字。
- 必须配置 `DEEPSEEK_API_KEY`。
- 模型返回必须是 JSON。
- 没有生成有效 `variants` 时返回失败。
- 请求超时 180 秒。

这些边界让优化结果不会在“没内容、没模型、没结构化返回”的情况下伪装成功。

## 5. Operation：这次到底改什么

Operation 是最高优先级维度。它决定本次优化的主任务。

| Operation | 产品含义 | 生成约束 |
|---|---|---|
| `full` | 全面优化 | 均衡处理措辞、结构、量化，不能只做某一类。 |
| `star` | STAR 重组 | 按 Situation、Task、Action、Result 重组经历，关键词和量化不能破坏 STAR 结构。 |
| `quantify` | 量化增强 | 只识别和补充可量化维度，保留原文结构和顺序。 |
| `keywords` | 关键词注入 | 将 JD 或画像关键词自然融入原文，避免堆砌。 |

这解决了“优化”这个词过于模糊的问题。用户选择的是产品动作，不是让模型猜。

## 6. Effort：改写强度如何影响输出

Effort 控制两件事：prompt 里的改写深度，以及模型温度。

| Effort | Prompt 行为 | 温度 |
|---:|---|---:|
| 1 | 仅润色措辞、修正语法，不添加新内容，不改变结构 | 0.3 |
| 2 | 保守优化动词和句式，可提示哪里适合补量化数据 | 0.3 |
| 3 | 适度调整结构，补 1-2 个量化维度占位符 | 0.7 |
| 4 | 大幅重构，可用 STAR，补 3-4 个量化维度占位符 | 0.9 |
| 5 | 完全重写段落，用 STAR 重组，补 4 个以上量化维度占位符 | 0.9 |

`buildPlaceholderRules()` 会根据 Effort 决定每段期望的 `[XX]` 数量：

```text
effort <= 2 -> 0
effort = 3 -> 1-2
effort = 4 -> 3-4
effort = 5 -> 4+
```

这让用户能清楚地控制“改到什么程度”。低 Effort 保护原文，高 Effort 追求更强表达，但仍必须基于原文事实范围。

## 7. `[XX]` 占位符的产品意义

纸鸢的简历优化不能编造用户没有提供的数据。项目采用 `[XX]` 占位符把“可以量化”和“具体数值未确认”分开。

例如：

```text
日均处理 [XX]+ 条用户反馈
将简历匹配准确率提升 [XX]%
覆盖 [XX: 可按实际主播数量确认] 名主播
```

这类占位符的产品价值是：

- 提醒用户哪里应该补真实数字。
- 让 AI 可以指出量化空间，但不替用户编事实。
- 为后续追问和提案确认留下位置。

当 `enablePlaceholders=false` 时，系统会更保守地要求不要添加原文中没有的量化数据，只优化已有数字表达。

## 8. JD 滤网

`buildJDFilterPrompt()` 负责把目标 JD 作为内容滤网注入。

JD 不会改变 Operation。比如用户选择 `quantify`，即使有 JD，核心任务仍然是量化增强，只是在选择量化重点时优先服务 JD 关键词。

JD 滤网包含：

- 目标岗位。
- 目标公司。
- 最多 8 个核心关键词。
- 与 JD 相关的经历优先详细处理。
- 与 JD 无关的经历可以降低详细程度，但不能跳过。

这个设计避免了两个极端：

- 忽略 JD，输出通用简历。
- 过度迎合 JD，把用户事实改成岗位要求。

## 9. 参考简历和优秀模式记忆

Judge 引擎有三类参考来源。

第一类是用户显式选择的参考简历。`referenceIds` 最多取 3 份，系统会把完整结构和当前板块参考写进 prompt。它强调“提取思考框架，不照抄内容”。

第二类是语义检索片段。`retrieveReferenceResumeSnippets()` 会根据意图、角色、JD、关键词和当前 section 内容，从 pgvector 索引里找同岗位、同板块、相似度高的优秀简历片段，最多取 4 条。

第三类是抽象模式记忆。`retrieveExcellentResumePatternMemory()` 最多取 6 条 active 模式，例如：

- AI 产品经历写成“业务目标 -> 技术链路 -> 评测/反馈 -> 产品结果”闭环。
- 每段经历用可验证指标收束结果。
- 从 0 到 1落地经历要写清阶段推进和上线闭环。
- 跨团队项目要写清协作对象、交付物和推进机制。

这三类参考的边界是一样的：只能迁移结构、表达密度和故事逻辑，不能复制原文，也不能把参考简历里的事实写到用户简历里。

## 10. 用户画像和角色写作指南

`buildRoleGuidance()` 会根据 `roleDirection` 或用户画像注入角色写作指南。

当前项目支持的角色方向包括：

- 通用产品经理。
- AI 产品经理。
- 后端工程师。
- 前端工程师。
- 数据 / AI 工程师。
- 测试工程师。
- 设计师。
- 运营 / 市场。

其中 AI 产品经理写作指南会强化：

- LLM / Agent 架构设计。
- Prompt Engineering。
- RAG 和知识检索策略。
- 模型评估体系。
- AI 合规和 Human-in-the-loop。
- Vibe Coding 到 Spec-Driven Development 的原型验证链路。

这让同一段经历可以按不同岗位方向改写，而不是所有人都套同一套简历表达。

## 11. 用户偏好反馈

`/api/cv/record-preference` 会记录用户对优化结果的动作：

- `accept`
- `save`
- `reject`
- `dismiss`
- `heavily_edit`
- `modified`

记录字段包括：

- `section_id`
- `variant_type`
- `action`
- `operation`
- 原文、优化文本、用户编辑后的文本
- `referenceMemory` 中的 snippet、reference resume、pattern memory ID
- 角色方向、目标 JD、任务类型、文字反馈

这些偏好会进入 `buildPreferencePrompt()`，让之后的优化更倾向用户接受过的风格，减少用户拒绝过的风格。

同时，`recordOptimizationMemoryFeedback()` 会把参考记忆的使用效果反馈给记忆系统，用于后续参考片段排序。

## 12. 输出结构

模型必须输出 JSON：

```json
{
  "variants": [
    {
      "label": "定向",
      "content": "改写后的完整段落文本",
      "approach": "一句话说明改写策略",
      "jdRelevance": "说明 JD 相关性"
    }
  ]
}
```

如果有目标 JD，系统要求生成 2 个方案：

- `定向`：走 JD 滤网。
- `通用`：不走 JD 滤网，保留更通用的表达。

如果没有目标 JD，系统生成 1 个通用方案。

接口会给每个 variant 计算 `placeholderCount`，也会返回 `referenceMemory`：

- 命中的 snippet ID。
- 命中的 reference resume ID。
- 命中的 pattern memory ID。
- 参考片段排序分数。

这让前端可以展示“这次优化参考了哪些长期记忆”，也方便后续反馈闭环。

## 13. 与提案系统的边界

Judge 引擎输出的是方案，不是保存结果。

```text
Judge 引擎生成 variants
  -> 用户选择一个版本
  -> 创建简历修改提案
  -> 用户确认应用
  -> 提案系统写入 CV 并读回
```

如果用户没有确认，优化结果不应该进入正式简历。这个边界保证了“生成”和“写入”分开治理。

## 14. 失败模式

| 失败模式 | 系统处理 |
|---|---|
| 未登录 | 返回 401。 |
| 当前板块少于 20 字 | 返回 400，提示无法有意义优化。 |
| `DEEPSEEK_API_KEY` 未配置 | 返回 500，提示环境变量缺失。 |
| DeepSeek 返回非 2xx | 返回 502，并记录状态码。 |
| 模型返回为空 | 返回 500。 |
| 模型返回非 JSON 且无法从代码块提取 | 返回“AI 返回格式解析失败”。 |
| `variants` 为空 | 返回“AI 未生成有效方案”。 |
| 参考检索失败 | 捕获后降级为空参考，不阻断主流程。 |
| 模式记忆检索失败 | 捕获后降级为空模式，不阻断主流程。 |

这个失败设计的原则是：核心生成失败要明确失败；辅助记忆失败可以降级，但不能阻断用户完成一次优化。

## 15. 测试与验证证据

项目里与 Judge 引擎相关的验证包括：

- `src/__tests__/cv-optimize-postgres-boundary.test.ts`：验证优化接口在 PostgreSQL 边界下的行为。
- `src/__tests__/excellent-resume-patterns.test.ts`：验证优秀简历模式可被抽取和检索。
- `src/__tests__/excellent-resume-memory-evolution.eval.test.ts`：验证优秀简历记忆在优化链路中的演进效果。
- `src/__tests__/reference-resume-vector.test.ts`：验证参考简历向量检索和排序。
- `src/__tests__/resume-save-guard.test.ts`：验证优化结果进入保存前的防护。

验收这个功能时，不能只看“模型有没有生成文字”。要看：

- Operation 是否被执行，而不是被 JD 或参考简历覆盖。
- Effort 是否改变改写幅度和占位符数量。
- 有 JD 时是否生成定向和通用两个明显不同的方案。
- 参考简历是否只迁移结构，没有复制原文。
- 用户未确认前是否没有写入正式 CV。

## 16. 产品总结

简历优化 Judge 引擎把“AI 帮我改简历”变成了一个可控的产品系统。它用 Operation 定义动作，用 Effort 控制幅度，用 JD 和参考记忆控制方向，用画像和偏好控制个性化，用提案系统保护写入。

它的价值不在于生成一段更漂亮的话，而在于让每次改写都有明确策略、事实边界、审阅空间和后续沉淀。
