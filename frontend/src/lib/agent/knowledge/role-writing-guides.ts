/* ── Role-Specific Writing Guides ──
   Each guide provides role-aware project description structure + examples.
   Only the matching role is injected, not all of them. */

/* ── Role Detection ── */

function matchRole(roles: string, headline: string): string {
  const combined = (roles + " " + headline).toLowerCase();
  // AI PM: product manager + AI/LLM keywords
  if (combined.match(/产品经理|产品负责人|产品主管|产品总监|product manager|product owner/)) {
    if (combined.match(/ai|人工智能|大模型|llm|agent|aigc|生成式|gpt|prompt|语言模型/)) return "ai-pm";
    return "pm";
  }
  if (combined.match(/后端|java|golang|python.*工程|架构师|服务端|backend|sre|运维/)) return "backend";
  if (combined.match(/前端|前端开发|frontend|react|vue|h5/)) return "frontend";
  if (combined.match(/数据|data|算法|algorithm|机器学习|深度学习|nlp|推荐|模型/)) return "data-ai";
  if (combined.match(/测试|test|qa|质量保障/)) return "qa";
  if (combined.match(/设计|design|ui|ux|交互|视觉/)) return "design";
  if (combined.match(/运营|operation|市场|marketing|销售|sales|增长/)) return "ops";
  return "generic";
}

/* ── Guide Content ── */

const GUIDES: Record<string, string> = {
  pm: `## 角色写作指南：产品经理项目经历

PM 的项目经历需覆盖从需求到落地的全链路决策细节，不能写成"主导XX产品"一句带过。

标准结构：项目背景 → 周期/团队 → 需求获取(调研谁/怎么调/结论) → 需求拆分(优先级标准/排序) → 产品价值判断(ROI) → 产品设计(PRD/原型/分期迭代) → 组织评审(频率/参与方/通过决议) → 架构设计(技术方案决策) → 团队协作(部门/分阶段/培训) → 数据闭环(反馈→迭代) → 项目结果(业务+产品+运营价值)

范例参考：
- "对 50+ 一线客户经理进行访谈和跟岗观察，识别出 4 大核心痛点，输出需求调研报告驱动立项"
- "基于用户价值×实现成本矩阵排序 12 个需求模块为 P0-P3，MVP 聚焦画像判断+策略推荐"
- "输出 PRD v1.0 + 26 页高保真原型，V1.0 覆盖核心经营场景，V2.0 规划智能预警与主动推荐"

动词：主导、设计、构建、推动、梳理。用 [XX] 标注不确定细节。`,

  "ai-pm": `## 角色写作指南：AI产品经理项目经历

AI PM 的项目经历需在通用PM框架上，突出 LLM/Agent 架构设计、模型效果评估和 Prompt Engineering 能力。

标准结构（在PM基础上强化以下维度）：

1. **AI 产品架构设计** — 规则引擎+RAG+LLM+人工兜底四层架构，明确各层职责边界与协作关系
2. **Agent 工作流设计** — 工具定义(JSON Schema统一接口)、控制策略(ReAct/Plan-Act选型)、决策逻辑(规则+LLM双重机制)、异常降级
3. **Prompt Engineering** — 结构化System Prompt设计、占位字段动态注入、输出格式约束(语气/推荐强度/风险提示)
4. **知识检索策略** — 结构化Query设计、双路径检索(Hard Filter+语义相似度)、Precision/Recall分层平衡
5. **模型评估体系** — 检索评估(召回率)、生成评估(准确率/幻觉率)、业务评估(采纳率/转化提升)
6. **AI 合规与安全** — 输出合规校验、模型不参与确定性决策、Human-in-the-loop兜底
7. **数据闭环机制** — "模型输出→使用行为→效果反馈→Prompt/知识库优化"持续迭代

8. **Vibe Coding → SDD 原型验证能力** (2025 AI PM 必备)：
   - Vibe Coding：用 Cursor/Claude Code/Bolt/v0 等 AI IDE，自然语言对话快速生成可交互原型，数小时内完成概念验证
   - SDD(Spec-Driven Development)：从"写传统PRD"升级为"写可执行 Spec"——Spec 既是人看的文档，也是AI Agent 的指令
   - 工作流：Specify(结构化Spec) → Plan(技术设计) → Tasks(任务拆解) → Implement(AI执行) → Review(审查)
   - PM 核心产出：结构化 Spec 文档(背景/目标/In Scope/Out of Scope/验收标准/约束/风险)，替代传统 Word PRD
   - 关键价值：消除"需求翻译损耗"——PM 的 Spec 直接驱动 AI 编码，减少需求传递失真

**专业范例参考**：
- AI架构："设计「规则引擎+RAG+LLM受控生成+人工兜底」四层架构，确定性决策与受控生成分离"
- Agent："结构化Query+双路径检索(Hard Filter+语义相似度)，规则优先保障合规覆盖，语义匹配二次排序，召回准确率83%→91%"
- Prompt："将行为金融特征以结构化占位字段注入System Prompt，支持'历史基线+会话态度修正'动态合成"
- SDD原型："用 Cursor + v0 在 XX 小时内完成产品原型验证，输出结构化 Spec 替代传统 PRD，Spec→Plan→Tasks→Implement 全链路 AI 执行，需求到交付周期缩短 XX%"
- 闭环："建立'模型输出→使用行为→效果反馈→Prompt/知识库优化'闭环，结合点赞/编辑偏好驱动持续迭代"

**关键原则**：
- 面试官想看：LLM 能力边界理解 + AI 原生研发范式掌握 + 传统PM全链路基本功
- 每个技术方案附决策理由：为什么 RAG 而非微调？为什么规则引擎做合规而非 LLM？
- Vibe Coding → SDD 不是对立而是分层：原型用 Vibe(快)，生产用 Spec(稳)
- 用 [XX] 标注不确定数值`,

  backend: `## 角色写作指南：后端工程师项目经历

后端项目经历用"技术语言 + 业务价值 + 量化数据"三位一体，核心公式：STAR + 技术选型理由 + 指标。

标准结构：项目背景与规模(QPS/数据量) → 技术方案与架构决策(选型理由) → 核心实现 → 量化成果(QPS/TP99/可用性/成本)

范例参考：
- "大促峰值 QPS 8k→40k，多级缓存(Caffeine+Redis)+本地库存预扣减，TP99 1.8s→0.3s"
- "ShardingSphere 16库256表分片，慢查询 850ms→45ms，数据库压力下降 90%"
- "Go协程池+epoll，单机50万长连接，内存降低60%，运维成本-40%"

每个技术决策附选型理由。用 [XX] 标注不确定数值。`,

  frontend: `## 角色写作指南：前端工程师项目经历

前端项目经历展示性能优化深度+工程化能力+业务影响力。

标准结构：项目背景 → 性能优化(SSR/分包/资源优化，附LCP/INP/CLS指标变化) → 工程化建设(组件库/CI-CD/灰度) → 量化成果

范例参考：
- "SSR+路由分包+WebP/AVIF，LCP 3.8s→2.2s(-45%)，首屏包体 700KB→340KB(-54%)"
- "封装表单引擎+列表DSL覆盖80%场景，新页面开发效率提升3倍"
- "Monorepo+Turborepo，构建 12min→4min，E2E通过率>95%"

每个优化必须带Web Vitals指标变化。用 [XX] 标注不确定数值。`,

  "data-ai": `## 角色写作指南：数据/AI工程师项目经历

展示从数据到业务价值的完整链路，同时量化模型指标和业务收益。

标准结构：项目背景 → 算法选型(选型理由) → 特征工程 → 工程部署(Docker/K8s/Serving) → 监控体系 → 模型指标(AUC/KS) + 业务收益(GMV/转化率)

范例参考：
- "LightGBM替代逻辑回归，SHAP解释模型决策，KS 0.28→0.35，拦截欺诈损失约1200万/年"
- "双塔模型+TF Serving+Redis多级缓存，P99 500ms→120ms，用户停留+18%"
- "RFM模型对500万用户打标+A/B测试，支付转化率+27%，月增GMV 420万"

同时展示模型指标和业务指标。用 [XX] 标注不确定数值。`,

  qa: `## 角色写作指南：测试工程师项目经历

展示质量保障体系设计能力+自动化深度+效率提升。

标准结构：项目背景 → 测试策略(金字塔/左移/右移) → 自动化建设(UI/接口/性能) → CI/CD集成 → 量化成果(覆盖率/效率/质量)

范例参考：
- "Appium+Python+Allure框架，300+核心用例，自动化覆盖率20%→85%，回归3天→4小时"
- "JMeter百万级并发压测，发现12个并发缺陷，响应800ms→150ms"
- "Jenkins+Docker流水线，提交到反馈<15min，修复周期缩短40%"

数据驱动：效率提升%、覆盖率%、缺陷率下降%。用 [XX] 标注不确定数值。`,

  design: `## 角色写作指南：设计师项目经历

展示全链路设计思维：从用户研究到视觉设计到验证迭代。

标准结构：项目背景 → 用户研究(访谈N人/热力图) → 信息架构(导航重构/旅程图) → 视觉设计(Figma原型/Design Token/组件库) → A/B测试与验证 → 设计系统(组件库规模/规范文档) → 量化成果(NPS/转化率/效率)

范例参考：
- "50人访谈+热力图分析，重构信息架构，NPS 62→78，核心路径缩短40%"
- "Figma 20个高保真原型+A/B测试，转化率+12%"
- "建立设计系统，200+组件+Design Token，团队效率+35%"

同时展示体验指标和业务指标。用 [XX] 标注不确定数值。`,

  ops: `## 角色写作指南：运营/市场项目经历

展示策略思维+执行力+数据驱动复盘能力。

标准结构：项目背景 → 策略设计(增长模型/渠道/预算) → 执行方案(活动/内容/投放) → 量化成果(新增/DAU/CAC/ROI)

范例参考：
- "策划3场裂变活动，总参与50万+，新增用户8万，CAC-40%，ROI 1:6.2"
- "搭建社群运营体系，管理200+微信群，留存率35%→62%，NPS 42→71"
- "SEO+信息流投放，3个月自然流量月均2万→15万，SEM转化率+28%"

每个活动附成本/收益/ROI。用 [XX] 标注不确定数值。`,

  generic: "",
};

/* ── Public API ── */

export interface RoleProfile {
  targetRoles?: { name: string }[];
  headline?: string;
}

/** Returns only the role-specific writing guide (or empty string for generic). */
export function injectRoleWritingGuide(profile?: RoleProfile): string {
  if (!profile) return "";
  const roles = (profile.targetRoles || []).map(r => r.name).join(" ");
  const headline = profile.headline || "";
  const role = matchRole(roles, headline);
  return GUIDES[role] || "";
}
