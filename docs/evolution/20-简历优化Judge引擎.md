# 20 — 简历优化 Judge 引擎

> 所属阶段：Phase 2 · 功能模块: CV Optimization Pipeline

---

## 1. 总览

简历优化 Judge 引擎是整个 CV 优化管线的核心调度器。它接收一个四级优先级模型（Operation > JD Filter ≈ Reference Style > Effort），组装系统提示词，调用 DeepSeek API 生成改写方案，再经由"审阅—确认—保存"流程最终写入持久化存储。

```
用户操作 (section + operation + effort)
         │
         ▼
┌────────────────────────────────────────────────────┐
│              Judge Prompt Builder                   │
│                                                    │
│  优先级模型:                                        │
│  Layer 1: Operation (做什么)      ← 最高优先级       │
│  Layer 2: JD Filter ≈ Ref Style  ← 同级协作         │
│  Layer 3: Effort (执行深度)       ← 控制温度+强度     │
│                                                    │
│  辅助维度:                                          │
│  - RoleWritingGuide (角色写作模板)                   │
│  - Preference History (偏好学习)                     │
│  - Placeholder Rules (XX 占位符)                    │
│  - QuestionAnswers (用户补充信息)                    │
└──────────┬─────────────────────────────────────────┘
           ▼
┌──────────────────┐
│ DeepSeek API     │
│ temp = f(effort) │
│ model: v4-pro    │  (CV 页面手动)
│ model: v4-flash  │  (Agent 工具调用, fast=true)
│ response: JSON   │
└──────────┬───────┘
           ▼
┌──────────────────┐
│ /api/cv/         │
│ optimize-section │  → 返回 variants[]
└──────────┬───────┘
           ▼
┌─────────────────────────────────────────────────────┐
│              审阅 — 确认 — 保存流程                    │
│                                                     │
│  1. variants[] 展示给用户 (定向/通用)                  │
│  2. 用户选择 variant → save_resume_section 工具       │
│  3. 写入 SQLite (canonical) → localStorage (cache)    │
└─────────────────────────────────────────────────────┘
```

---

## 设计思想

简历优化 Judge 引擎的四级优先级模型（Operation × Effort × JD × Reference）的设计灵感来自**产品管理领域的优先级框架**，特别是 **MoSCoW（Must/Should/Could/Won't）** 和 **RICE（Reach/Impact/Confidence/Effort）** 方法论。产品经理在决定一个功能是否值得做时，不会简单地回答"做"或"不做"——他们会拆解到多个维度：这个功能对用户的价值有多大（Impact）、需要多少开发资源（Effort）、有多少用户会用到（Reach）。简历优化面对的是同样的问题：用户说"帮我优化这段工作经历"，但优化的方向可以完全不同——是润色措辞（polish）、扩展深度（expand）、量化亮点（quantify）、还是完全重写（rewrite）。

Judge 引擎的核心洞察是：**简历优化不是一个单一任务，而是一个可能性矩阵**。四种 Operation 类型（full/star/quantify/keywords）定义了"做什么"；五级 Effort（1-5）定义了"做到什么程度"；JD Filter 定义了"偏向什么方向"；Reference Style 定义了"写成什么味道"。这四个维度的笛卡尔积产生了数万种可能的改写策略组合。引擎不替用户做选择——它将矩阵暴露出来，让用户（或 Agent）根据当前场景组合出最佳配置：一个投大厂的 AI 产品经理岗位，可能需要 Operation=star + Effort=4 + JD=注入 + Reference=AI PM 风格；而一次快速优化用于初步筛选，可能只需要 Operation=quantify + Effort=1。

这个设计也借鉴了 **RICE 框架中对"Effort"的独立量化**。在 RICE 中，Effort（实现成本）是一个独立维度，不与 Impact（业务价值）混在一起。Judge 引擎中的 Effort 参数正是同样的理念：不猜测用户想要多大改动幅度，而是提供一个 1-5 的刻度让用户自己选择。Effort 1（温和润色）对应 temperature 0.3，保留原文 90%；Effort 5（完全重写）对应 temperature 0.9，只有核心事实保留。这种显式控制比"智能优化"按钮更尊重用户意图——用户知道自己的简历哪些地方不能动，哪些地方可以大胆改。

Reference Style（参考风格）维度是另一个有别于常规工具的设计。传统的简历工具只处理一份简历，Judge 引擎允许用户指定一份"参考简历"——不是抄袭内容，而是提取其结构和表达风格作为标杆。引擎会自动分析参考简历的四维特征（内容丰富度、结构流程、量化密度、表达技法），然后将这些特征映射到用户的简历上。这解决了"我不知道好简历长什么样"的问题——你不必成为简历专家，你只需要找到一份你喜欢的简历，引擎负责提取其中的可迁移元素。

最后，**XX 占位符机制**是这个系统中一个小而关键的设计。LLM 在优化简历时最危险的倾向是"编造数据"——它可能自信地写出"将用户转化率提升了 37%"，但这个数字完全来自训练数据的统计幻觉。XX 占位符（`[XX]`）提供了一种平衡：允许 LLM 推断量化方向（在哪些维度上应该有数字），但禁止 LLM 提供具体数值——用户必须自己填入真实数据。这就像建筑师的草图标注了"此处需要一扇窗户"但不会替你决定窗框颜色。专业度来自量化，可信度来自真实性——XX 机制同时满足了这两个要求。

---

## 2. 四级优先级模型

Judge 引擎的 prompt 组装遵循严格的优先级排序。各级指令之间通过"不可被其他维度覆盖"等措辞建立硬边界。

```
优先级:
┌────────────────────────────────────────────────┐
│ L1  Operation      │ 决定「做什么」             │
│                     │ 不受任何下级维度覆盖       │
│                     │ full | star | quantify |   │
│                     │ keywords                   │
├────────────────────┼────────────────────────────┤
│ L2  JD Filter  ≈  Reference Style               │
│     (同级协作)     │                             │
│     JD:  决定「重点放哪」                        │
│     Ref: 决定「写成啥味」                        │
├────────────────────┼────────────────────────────┤
│ L3  Effort         │ 控制以上所有指令的执行深度   │
│     1-5 级         │ 影响 temperature 和改动幅度 │
└────────────────────┘
```

### 2.1 L1 — Operation（四种操作类型）

| 操作 | 类型名 | 核心任务 | 不可覆盖规则 |
|------|--------|---------|------------|
| 全面优化 | `full` | 三维护均衡：措辞润色 + 结构优化 + 量化标注 | 不做单独 STAR 重组、不做单独量化增强、不做单独关键词植入 |
| STAR 重组 | `star` | 用 STAR (Situation-Task-Action-Result) 重写段落结构 | 不新增量化数据（除非 Effort 高 + 量化开关开），不可为关键词打乱 STAR 结构 |
| 量化增强 | `quantify` | 识别所有可量化点，用 `[XX]` 占位符标注推断值 | 不改变段落结构，不做 STAR 重组 |
| 关键词注入 | `keywords` | 自然植入 JD/行业关键词 | 不做量化增强，不做 STAR 重组，避免 keyword stuffing |

Operation 在 prompt 中以 `## 核心任务：XXX（最高优先级，不可被其他指令覆盖）` 开头，确保 LLM 不会在多层指令叠加时偏离核心目标。

### 2.2 L2 — JD Filter 与 Reference Style（同级协作）

**JD Filter**：当用户提供了目标 JD（role + company + keywords），引擎将其作为"内容滤网"注入 prompt。JD 滤网影响的是改写内容的侧重点——优先为与 JD 关键词相关的经历执行核心任务，无关经历可降低详细程度但不可跳过。

```
JD 滤网优先级: "JD 是滤网，不是操作类型——你仍然要执行 Operation 指定的核心任务"
冲突解决:     "若 JD 内容基调与参考风格冲突，内容走 JD、表达技法走参考的可迁移部分"
```

**Reference Style**：当用户指定了参考简历（通过 `referenceIds`），引擎从 SQLite 加载对应的优秀简历，进行四维对标分析：

| 对标维度 | 分析内容 |
|---------|---------|
| 内容丰富度 | 参考简历每个经历的字数、bullet 深度 → 用户的经历扩展到同等深度 |
| 结构流程 | 参考简历的经历组织方式（背景→职责→行动→成果）→ 应用到用户经历 |
| 量化密度 | 统计参考简历中数字/百分比/指标的出现频率 → 合理推断用户数据 |
| 表达技法 | 动词选择强度、专业术语密度、句式节奏 → 匹配专业水准 |

### 2.3 L3 — Effort（五级改写强度）

Effort 控制所有指令的执行深度，同时直接决定 API 调用的 `temperature` 参数。

| Effort | 名称 | 描述 | Temperature | 每段 XX 占位符 |
|--------|------|------|-------------|---------------|
| 1 | 温和 | 仅润色措辞，修正语法，改进动词。不添加新内容。 | 0.3 | 0 |
| 2 | 保守 | 优化动词和句式，段落末尾用注释标注可量化点。 | 0.3 | 0（仅注释提示） |
| 3 | 适中 | 适度调整句式，补充量化描述（XX 占位），微调信息顺序。 | 0.7 | 1-2 |
| 4 | 大刀 | 大幅重构段落，STAR 格式，大胆推断量化维度。 | 0.9 | 3-4 |
| 5 | 重写 | 完全重写，所有经历 STAR 格式重组，大量推断量化维度。 | 0.9 | 4+ |

Temperature 映射关系：
- Effort 1-2: `temperature = 0.3`（低创意，保持原文）
- Effort 3: `temperature = 0.7`（中等创意）
- Effort 4-5: `temperature = 0.9`（高创意，允许大幅改写）

---

## 3. 角色写作指南

引擎根据用户画像（`targetRoles` + `headline`）自动匹配角色，注入对应的写作模板。匹配逻辑通过关键词组合判断：

```
角色检测逻辑 (matchRole):

  "产品经理/产品负责人/..." + AI关键词 → ai-pm
  "产品经理/产品负责人/..."            → pm
  "后端/java/go/架构师/sre/..."        → backend
  "前端/react/vue/..."                → frontend
  "数据/算法/机器学习/NLP/..."          → data-ai
  "测试/QA/质量保障/..."               → qa
  "设计/UI/UX/交互/..."               → design
  "运营/市场/销售/增长/..."             → ops
  其他                                → generic (无特定模板)
```

### 3.1 各角色模板结构

| 角色 | 指南 ID | 核心结构 |
|------|--------|---------|
| 产品经理 | `pm` | 项目背景→周期/团队→需求获取→需求拆分→ROI→产品设计→组织评审→架构→协作→数据闭环→项目结果 |
| AI 产品经理 | `ai-pm` | PM 基础框架 + LLM/Agent 架构 + Prompt Engineering + RAG + 模型评估 + SDD 原型验证 |
| 后端工程师 | `backend` | 项目背景与规模→技术方案与架构决策(选型理由)→核心实现→量化成果(QPS/TP99/可用性/成本) |
| 前端工程师 | `frontend` | 项目背景→性能优化(SSR/分包/LCP→INP→CLS)→工程化建设(组件库/CI-CD)→量化成果 |
| 数据/AI | `data-ai` | 项目背景→算法选型(理由)→特征工程→工程部署→监控→模型指标(AUC/KS)+业务收益(GMV/转化率) |
| 测试 | `qa` | 项目背景→测试策略(金字塔/左移/右移)→自动化建设(UI/接口/性能)→CI/CD→量化成果(覆盖率/效率/质量) |
| 设计 | `design` | 项目背景→用户研究(访谈/热力图)→信息架构→视觉设计(Figma/Design Token)→A/B测试→设计系统→量化成果 |
| 运营 | `ops` | 项目背景→策略设计(增长模型/渠道/预算)→执行方案(活动/内容/投放)→量化成果(新增/DAU/CAC/ROI) |

### 3.2 AI PM 模板示例（最复杂角色）

AI PM 的模板在通用 PM 框架上额外强化了 7 个 AI 专项维度，并在 2025 年增加了 Vibe Coding / SDD 能力维度：

```
AI PM 方法论公式:
  规则引擎 + RAG + LLM 受控生成 + 人工兜底 (四层架构)
  + Agent 工作流设计 (ReAct / Plan-Act)
  + 结构化 Prompt Engineering
  + 知识检索策略 (Hard Filter + 语义相似度)
  + 模型评估体系 (检索/生成/业务三层指标)
  + 数据闭环机制 (模型输出→使用行为→效果反馈→优化)
  + Vibe Coding → SDD 原型验证 (Spec→Plan→Tasks→Implement→Review)
```

---

## 4. XX 占位符机制

量化推断是 Judge 引擎的核心能力之一。引擎允许 LLM 大胆推断量化维度，但严禁编造具体数字——通过 `[XX]` 占位符在专业度和准确性之间取得平衡。

### 4.1 占位符规则

```
占位符语法:
  [XX]              简单占位，如「日均处理 [XX]+ 次请求」
  [XX: 推断依据]     带依据的占位，如「[XX: 行业参考 10k+]」

硬规则:
  1. 原文已有具体数字 → 保留并优化表述，不替换为 XX
  2. 占位符数量由 Effort 决定 (见 2.3 表格)
  3. Effort ≤ 2 且 enablePlaceholders = false 时完全不添加量化数据
  4. 用户补充信息 (questionAnswers) 中的真实数据直接用，不用 XX 替代
```

### 4.2 量化维度参考

LLM 在推断量化维度时，按不同角色类型有不同的参考方向：

| 角色类型 | 典型量化维度 |
|---------|------------|
| 工程类 | QPS、可用性%、延迟 p99、数据量、服务器数、代码行数 |
| 产品类 | DAU/MAU、留存率、转化率、收入影响、用户规模、NPS |
| 管理类 | 团队规模、项目周期、预算金额、跨部门数量 |
| 设计类 | NPS、转化率、组件库规模、效率提升% |
| 运营类 | 新增用户、CAC、ROI、参与人数、渠道数 |

### 4.3 占位符计数

API 返回结果时自动统计每个 variant 的占位符数量：

```typescript
placeholderCount: (v.content.match(/\[XX(?::[^\]]*)?\]/g) || []).length
```

该计数用于前端展示时提示用户有多少个待确认的量化值。

---

## 5. CV 数据存储

CV 数据采用双层存储架构：SQLite 为 canonical 数据源，localStorage 为前端缓存。

### 5.1 数据结构

```typescript
interface CVSection {
  id: string;      // "summary" | "experience" | "projects" | "education" | "skills"
  title: string;   // 中文显示名: "个人概述" "工作经历" ...
  content: string; // Markdown 文本
}

interface CVersion {
  id: string;          // "v1" "v2" ...
  label: string;       // "初始版本" "优化版" ...
  createdAt: string;
  sections: CVSection[];
  source: "manual" | "optimized";
}

interface CVData {
  activeVersion: string;           // 当前激活的版本 ID
  versions: Record<string, CVersion>;  // 所有版本
}
```

默认 5 个板块：`summary`、`experience`、`projects`、`education`、`skills`。

### 5.2 存储架构

```
    ┌─────────────────┐          ┌──────────────────────┐
    │   localStorage   │          │   SQLite (canonical)  │
    │   key: zhiyuan-cv│          │   cv_data 表          │
    │                  │          │                      │
    │   - 即时读写      │   sync   │   - 持久化存储        │
    │   - 前端缓存      │ ◄──────► │   - 服务端唯一真源    │
    │   - 旧格式兼容    │          │   - ON CONFLICT upsert│
    └─────────────────┘          └──────────────────────┘
```

**存储规则：**

| 操作 | localStorage 角色 | SQLite 角色 |
|------|-------------------|-------------|
| 读取 (`loadCVData`) | 优先读取（快） | 仅在本地无数据时 fallback |
| 写入 (`saveCVData`) | 同步写入（即时） | fire-and-forget async PUT |
| 保存工具 (`save_resume_section`) | 写入成功后的缓存更新 | 主写入路径，必须成功才返回 |
| 优化工具 (`optimize_resume_section`) | 优先读取 | fallback，然后自动同步 |

### 5.3 旧格式兼容

`cv-storage.ts` 内置了旧版格式（`CVSection[]` 数组）自动迁移逻辑：

```
检测：Array.isArray(data) && data[0].id
迁移：包装为 CVData 结构:
  { activeVersion: "v1", versions: { v1: { sections: legacy, source: "manual", ... } } }
```

迁移后的数据立即写回 localStorage，下次读取即为新格式。

### 5.4 版本管理

- `createVersion(label)`: 基于当前活跃版本创建新版本（快照）
- `deleteVersion(versionId)`: 删除版本（至少保留一个）
- `switchVersion(versionId)`: 切换活跃版本
- `renameVersion(versionId, newLabel)`: 重命名版本
- 版本 ID 自动递增: `v1 → v2 → v3 → ...`

### 5.5 SQLite 表结构

```sql
CREATE TABLE IF NOT EXISTS cv_data (
  id         INTEGER PRIMARY KEY,
  data_json  TEXT NOT NULL,     -- JSON.stringify(CVData)
  updated_at TEXT NOT NULL      -- datetime('now')
);
```

写入使用 upsert 语义：
```sql
INSERT INTO cv_data (id, data_json, updated_at)
VALUES (1, ?, datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  data_json = excluded.data_json,
  updated_at = datetime('now')
```

服务端 API (`/api/cv/data`) 提供 GET 和 PUT 两个方法，均直接操作 SQLite 数据库。

---

## 6. 优化管线：Optimize → Review → Save

整个优化流程分为三个关键环节，每个环节有明确的输入输出和错误处理。

### 6.1 阶段 1：Optimize（生成改写方案）

```
触发入口:
  - Agent 工具: optimize_resume_section (fast=true, Flash 模型)
  - CV 页面:    手动触发优化按钮 (fast=false, Pro 模型)
```

**optimize_resume_section 工具（Agent 侧）的完整流程：**

```
1. 解析 section 名称
   "工作经历"→experience  "项目经验"→projects  "技能"→skills  ...
   支持中英文双向匹配，默认 fallback 为 "experience"

2. 读取 CV 数据
   优先 localStorage (cache) → 命中则标记 fromLocalStorage=true
   如果为空，fallback 到 GET /api/cv/data (SQLite)
   如果来自 localStorage，后台 fire-and-forget 同步到 SQLite

3. 校验段落长度
   sectionContent.trim().length < 20 → 返回错误 "内容不足 20 字，无法优化"

4. 调用 /api/cv/optimize-section
   POST body: { sectionId, sectionContent, fullCV, operation, effort,
                intent, enablePlaceholders, fast: true }

5. 返回 variants[]
   [
     { label: "定向", content: "...", approach: "...", jdRelevance: "...",
       placeholderCount: N },
     { label: "通用", content: "...", approach: "...",
       placeholderCount: N }
   ]
```

**优化方案的 variant 数量规则：**

| 条件 | Variant 数量 | 说明 |
|------|-------------|------|
| 有 JD (targetJD.role exists) | 2 | "定向" + "通用" |
| 无 JD | 1 | 仅"通用" |

**formatResult（展示给用户的格式化输出）：**

```
## ✨ 工作经历 优化方案

### 定向
[改写后的完整段落...]
*策略: 优先突出JD相关的XX经验...*

### 通用
[改写后的完整段落...]
*策略: 均衡展示全量经历...*

---
⚠️ 请选择一个方案，回复「应用方案1」「用第一个」「第一个不错」等。
**在我确认前不会写入简历**，等你选择后再保存。
```

### 6.2 阶段 2：Review（用户审阅）

系统在 Agent 对话中展示每个 variant 的：完整改写文本 + `approach` 策略说明 + 占位符计数。

用户可以用自然语言选择：
- "应用方案1" / "用第一个" / "第一个不错"
- "第二个更好" / "用通用版"
- "第一个更好，但把第三段的 XX 改成 50%"

Agent 收到用户选择后，调用 `save_resume_section` 工具执行写入。

### 6.3 阶段 3：Save（确认写入）

**save_resume_section 工具的写入流程：**

```
1. 解析 section 名称 (同 optimize 的中英文映射)

2. 读取当前 CV 数据
   优先 GET /api/cv/data (SQLite canonical)
   如果 SQLite 为空，fallback 到 localStorage

3. 校验数据结构完整性
   cvData 为空 → 错误 "请先在 CV 页面创建简历"
   activeVersion 不存在 → 错误 "CV 版本数据异常"
   sectionId 在 sections 中找不到 → 错误 "找不到板块: XXX"

4. 内存更新
   找到匹配的 section，替换 content 字段

5. 写入 SQLite (canonical)
   PUT /api/cv/data → 必须成功
   失败 → 错误 "CV 数据写入 SQLite 失败" (recoverable)

6. 更新 localStorage (cache only)
   写入 localStorage.setItem("zhiyuan-cv", ...)
   失败 → 非关键错误（SQLite 已成功）

7. 返回成功
   { sectionId, sectionLabel, saved: true }
   → 展示: "✅ 已更新「工作经历」板块到 CV。打开 /cv 查看效果。"
```

---

## 7. API 路线：optimize-section

`/api/cv/optimize-section` 是 Judge 引擎的 HTTP 入口，负责组装 prompt、调用 DeepSeek API、解析并返回结果。

### 7.1 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sectionId` | string | 是 | 板块标识: summary/experience/projects/education/skills |
| `sectionContent` | string | 是 | 原文段落（至少 20 字符） |
| `fullCV` | Record\<string,string\> | 是 | 完整 CV 上下文（所有板块） |
| `operation` | Operation | 否 | 默认 `"full"` |
| `effort` | number | 否 | 默认 `3`，范围 1-5 |
| `enablePlaceholders` | boolean | 否 | 默认 `true` |
| `intent` | string | 否 | 用户优化意图（自由文本） |
| `roleDirection` | string | 否 | 默认 `"auto"`（自动检测），或指定角色名 |
| `questionAnswers` | array | 否 | 用户已确认的补充信息 |
| `targetJD` | object | 否 | 目标 JD 的 role/company/keywords |
| `userProfile` | object | 否 | 候选人画像 |
| `referenceIds` | number[] | 否 | 参考简历 ID 列表 |
| `fast` | boolean | 否 | `true` → Flash 模型, `false` → Pro 模型 |

### 7.2 模型选择

```
model = fast ? "deepseek-v4-flash" : "deepseek-v4-pro"
```

- Agent 工具调用 → `fast = true` → Flash（低延迟，约 3-8 秒）
- CV 页面手动优化 → `fast = false` → Pro（高质量，约 10-20 秒）

### 7.3 Prompt 组装顺序

`buildJudgePrompt()` 按以下优先级顺序组装系统提示词：

```
1. 角色声明 + 全量处理原则 + 优先级规则说明
2. 候选人职业画像 (headline/superpowers/targetRoles)
3. 角色写作指南 (role-writing-guide, 仅匹配角色)
4. Operation 指令 (核心任务, 最高优先级)
5. JD 滤网 (如有)
6. 参考风格 (如有, 含四维对标分析)
7. 偏好历史 (最近 10 条 accept/reject 记录)
8. Effort 指令 (执行深度)
9. 占位符规则 (enablePlaceholders × effort)
10. 用户意图 (intent, 自由文本)
11. 用户补充信息 (questionAnswers, 已确认真实数据)
12. CV 全量上下文 (其他 section 的内容)
13. 原文段落
14. 输出格式指令 (JSON schema)
```

### 7.4 响应结构

```typescript
// 成功
{
  success: true,
  data: {
    variants: [
      {
        label: "定向",           // "定向" | "通用"
        content: "改写后的段落",  // 纯文本，非 markdown
        approach: "改写策略说明",
        jdRelevance: "JD 相关性说明", // 仅定向 variant 有此字段
        placeholderCount: 3
      }
    ]
  }
}

// 失败
{
  success: false,
  error: "错误描述"
}
```

### 7.5 JSON 解析容错

API 返回的 JSON 解析存在两层容错：

1. 直接 `JSON.parse(content)` — 大多数情况下成功（因为请求了 `response_format: { type: "json_object" }`）
2. 如果直接解析失败，尝试从 markdown code block 中提取 JSON：
   ```
   /```(?:json)?\s*([\s\S]*?)```/
   ```
3. 两步都失败 → 返回 500 "AI 返回格式解析失败"

---

## 8. ATS 兼容检查

`check_ats_compatibility` 工具是 CV 优化管线的辅助模块，用于在优化前/后检查简历的机器筛选兼容性。

### 8.1 检查维度

| 维度 | 检查内容 | 严重级别 |
|------|---------|---------|
| 联系方式 | 电话/邮箱/LinkedIn 是否齐全 | critical |
| 量化数据 | 是否有数字/百分比/具体指标 | warning |
| 关键词 | 是否覆盖目标岗位核心关键词 | warning |
| Section 完整性 | 摘要/经历/项目/教育/技能 5 部分是否都有内容 | critical |
| 格式 | 是否有表格/图片/特殊符号（ATS 无法解析） | critical |

### 8.2 调用链

```
check_ats_compatibility tool
  → POST /api/cv/ats-check { cvText: "..." }
    → DeepSeek v4-flash (temperature=0.1, max_tokens=1500)
      → JSON { issues: [...], score: 0-100 }
        → formatResult: 生成评分表格
```

输入文本截断至 6000 字符（`cvText.slice(0, 6000)`），足以覆盖标准中文简历。

### 8.3 与优化管线的集成

ATS 检查可在以下时机触发：
- 优化前：评估当前简历的 ATS 兼容性，引导用户优先修复 critical 问题
- 优化后：验证改写后的简历是否仍然 ATS 兼容（检查是否引入了表格/特殊符号等）

---

## 9. 保存确认门禁

系统通过多层机制确保优化结果不会在用户未确认的情况下自动覆盖 CV。

### 9.1 工具级门禁

`save_resume_section` 工具的 `description` 字段包含硬约束声明：

```
⚠️ 严格限制：只有当用户明确回复「应用」「保存」「写入」「确认」「用这个」等
关键词后，才能调用此工具保存优化方案。绝不能在用户确认前自动保存！
必须先展示优化结果、等待用户选择，用户说「好」「行」「可以」再保存。
```

该描述直接影响 Agent 的行为决策——Agent 框架在决定是否调用工具时，会读取该描述作为前置条件。

### 9.2 流程级门禁

```
optimize_resume_section 工具:
  → 返回 variants[]
  → formatResult 末尾追加确认提示:
    "⚠️ 请选择一个方案...在我确认前不会写入简历"
  → 工具自身不执行任何写入操作

用户回复 "用第一个" → Agent 才会调用 save_resume_section
```

### 9.3 数据完整性门禁

`save_resume_section` 在执行写入前的校验链：

```
1. sectionContent 非空校验           → "新内容不能为空"
2. SQLite CV data 存在性校验         → "请先在 CV 页面创建简历"
3. activeVersion 存在性校验          → "CV 版本数据异常"
4. sectionId 在 sections 中查找      → "找不到板块: {sectionId}"
5. SQLite PUT 写入成功校验           → "CV 数据写入 SQLite 失败"
```

其中步骤 5 是 **硬门禁**——如果 SQLite 写入失败，工具返回 `recoverable: true` 错误，不会回退到 localStorage 作为备选写入路径。localStorage 仅作为写入成功后的缓存更新，不作为失败时的降级方案。

---

## 10. 偏好学习

引擎通过追踪用户的 accept/reject 行为积累偏好数据，在下一次优化时注入 prompt 以调整输出风格。

### 10.1 数据收集

每次用户接受/拒绝一个优化方案时，系统在 SQLite 中记录：

| 字段 | 说明 |
|------|------|
| `section_id` | 被优化的板块 |
| `variant_type` | 被接受/拒绝的 variant 标签（"定向"/"通用"） |
| `action` | "accept" 或 "reject" |
| `operation` | 当时的 Operation 类型 |
| `created_at` | 时间戳 |

### 10.2 偏好注入

`buildPreferencePrompt()` 默认读取最近 10 条偏好记录，生成如下提示：

```
## 用户偏好历史

- ✓ 接受了[quantify]"定向"风格的改写
- ✗ 拒绝了[star]"通用"风格的改写
- ✓ 接受了[full]"定向"风格的改写
...

请据此调整输出风格倾向：多输出用户接受的风格，少输出用户拒绝的风格。
最近的操作类型偏好也应优先考虑。
```

---

## 11. 追问机制（Ask Questions）

在正式优化前，引擎可生成补充信息问题，帮助用户提供更具体的细节以提高改写质量。

### 11.1 触发条件

`buildAskQuestionsPrompt()` 生成的问题与当前 Operation 强相关：

| Operation | 问题侧重 |
|-----------|---------|
| quantify | 优先问数据规模、团队大小、时间跨度 |
| star | 优先问情境（Situation）和具体行动（Action） |
| full | 均衡覆盖三个维度 |
| keywords | 优先问与 JD 相关的经历细节 |

### 11.2 问题格式

```json
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
}
```

问题数量由 Effort 决定：Effort 4 → 2-3 个，Effort 5 → 3-4 个。用户回答的 `questionAnswers` 会以 `## 用户补充信息（已确认的真实数据，可直接使用，不需要用 XX 替代）` 形式注入 prompt，优先级高于占位符推断。

---

## 12. 关键文件索引

| 文件 | 功能 |
|------|------|
| `src/lib/judge-engine.ts` | Judge 引擎核心：四维 prompt builder、effort/temperature 映射、占位符规则、追问生成器 |
| `src/lib/agent/knowledge/role-writing-guides.ts` | 8 类角色的结构化写作模板和范例 |
| `src/lib/agent/tools/action/optimize-resume-section.ts` | Agent 优化工具：读取 CV → 调用 API → 返回 variants |
| `src/lib/agent/tools/action/save-resume-section.ts` | Agent 保存工具：确认门禁 + SQLite 写入 |
| `src/lib/agent/tools/query/ats-check.ts` | ATS 兼容检查工具 |
| `src/lib/cv-storage.ts` | 前端 CV 存储：localStorage 读写 + 版本管理 + 旧格式迁移 |
| `src/app/api/cv/optimize-section/route.ts` | 优化 API：组装 prompt → DeepSeek API → 返回 variants |
| `src/app/api/cv/data/route.ts` | CV 数据 API：GET/PUT SQLite |
| `src/app/api/cv/ats-check/route.ts` | ATS 检查 API |
| `src/types/index.ts` | 类型定义：Operation、CVData、CVSection、CVersion |
