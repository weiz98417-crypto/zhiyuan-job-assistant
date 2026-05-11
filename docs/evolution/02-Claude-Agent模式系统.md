# 02 — Agent 模式系统

> 所属阶段：Phase 0-1 · 架构核心

---

## 1. 概述

筝筝纸鸢采用**混合 Agent 架构**——两套系统共存，各司其职：

```
┌─────────────────────────────────────────────────────┐
│                 Agent 模式系统 (双轨)                 │
│                                                     │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │  Claude Mode 文件    │  │  TypeScript Agent     │  │
│  │  (modes/*.md)       │  │  (src/lib/agent/)     │  │
│  │                     │  │                       │  │
│  │  · JD 评估           │  │  · 27 工具执行        │  │
│  │  · 风险检测           │  │  · 5 子 Agent 路由    │  │
│  │  · PDF 生成           │  │  · ReAct 循环         │  │
│  │  · 脚本工具链         │  │  · 3 层记忆           │  │
│  │                     │  │  · 模型降级链          │  │
│  │  给 Claude Code CLI  │  │  给 Web 前端          │  │
│  │  用                  │  │  用                   │  │
│  └─────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

- **Claude Mode 文件**：项目最早的智能层，Markdown 即 Prompt，CLI 环境中运行
- **TypeScript Agent**：Web 前端新增的智能层，服务端 ReAct 循环 + 原生函数调用

两者不是替代关系——Claude Mode 文件仍然是 JD 评估脚本、风险扫描脚本、PDF 生成的指令来源。TypeScript Agent 包了一层 Web 可用的壳。

---

## 2. Claude Mode 文件系统

### 设计哲学

无框架引擎——Markdown 文件直接作为 LLM 系统提示词。改 Prompt 不需要改代码。

### Mode 路由机制

```
用户输入 (CLI / CLAUDE.md)
    │
    ▼
CLAUDE.md (根路由器)
    │
    ├── 粘贴 JD/URL  ────→ modes/zh/jianzhi.md (中文评估)
    │                     ├── jianzhi-risk.md (风险检测)
    │                     ├── A-G 7维评分
    │                     └── validate-output + db-write
    │
    ├── Offer 评估 ──────→ modes/oferta.md / modes/zh/jianzhi.md
    ├── 比较 Offers ─────→ modes/ofertas.md
    ├── 面试准备 ────────→ modes/interview-prep.md
    ├── 扫描门户 ────────→ modes/scan.md
    ├── 批量处理 ────────→ modes/pipeline.md
    ├── PDF 生成 ────────→ modes/zh/pdf.md
    ├── 求职画像 ────────→ modes/zh/dingwei.md
    └── 投递追踪 ────────→ modes/tracker.md (通过 scripts)
```

### 核心文件

| 文件 | 用途 |
|------|------|
| `CLAUDE.md` | 根路由，定义所有 Skill 入口 |
| `modes/zh/jianzhi.md` | 中文 JD 评估 Mode（A-G 7 维） |
| `modes/zh/jianzhi-risk.md` | 风险检测 Mode（评估前先跑） |
| `modes/zh/risk-intel.md` | 风险知识库（YAML 格式，30 条黑话 + 10 骗术模式 + 46 薪资基准） |
| `modes/zh/_shared.md` | 共享评分引擎定义 |
| `modes/zh/_profile.md` | 用户画像与 Archetype |
| `modes/oferta.md` | Offer 评估 Mode |
| `modes/pipeline.md` | 管道处理 Mode |
| `DATA_CONTRACT.md` | 用户层/系统层数据分界规则 |
| `risk-intel-triggers.yml` | 31 条正则触发词（给 scan-risks.mjs 用） |
| `templates/states.yml` | 投递状态规范定义 |

---

## 3. TypeScript Agent 系统

### 架构分层

```
页面 (src/app/agent/page.tsx)
    │
    ▼
编排器 (src/lib/agent/orchestrator/index.ts)
    ├── classifyIntent() → 意图分类 → Agent 选择
    ├── AgentPromptContext 组装（画像 + 记忆 + 知识）
    └── agentLoopClient() / agentLoopServer()
    │
    ▼
Agent Loop (src/lib/agent/loop/)
    ├── callLLM() → DeepSeek V4 → GLM-4 → Qwen-Long
    ├── Native function calling → 27 工具
    └── Quality gate → checkResultQuality → self-healing
    │
    ▼
工具注册表 (src/lib/agent/tools/)
    ├── registry.register("tool_name", definition)
    ├── registry.execute("tool_name", params)
    └── formatResult() → LLM 上下文注入
```

### 5 个子 Agent

| Agent ID | 名称 | 工具白名单 | 触发模式 |
|----------|------|-----------|---------|
| `general` | 通用助手 | 全部工具 | `.*` (兜底) |
| `evaluate` | JD 评估 | evaluate_jd_full, analyze_jd_risks, decode_terms, get_profile | 评估/分析 JD |
| `resume` | 简历优化 | optimize_resume_section, save_resume_section, generate_cv, import_resume, ats_check | 简历/优化/CV |
| `interview` | 面试教练 | prepare_interview_full, start_interview_session, get_profile | 面试/准备/练习 |
| `profile` | 求职画像 | mine_profile, self_positioning, get_profile_insights, detect_skill_gaps | 定位/画像/方向 |

---

## 4. 评分引擎

### 评分维度定义

评分引擎在两个系统中并存：Claude Mode 文件定义规则，TypeScript 工具执行计算。

| 维度 | 权重 | 评估内容 |
|------|------|---------|
| A — 职位概览 | 10% | Archetype 分类、行业、职级 |
| B — 简历匹配 | 20% | CV 逐条对照 JD 要求 |
| C — 职级与策略 | 15% | 中国职级对应、晋升路径 |
| D — 薪资与市场 | 15% | 薪资竞争力、五险一金 |
| E — 定制化方案 | 15% | 简历修改建议、关键词匹配 |
| F — 面试准备 | 10% | STAR+R 故事匹配 |
| G — 职位合法性 | 15% | 风险信号分析、黑话解码 |

### 分数解读

| 分数 | 建议 |
|------|------|
| 4.5+ | 强烈建议投递 |
| 4.0-4.4 | 建议投递 |
| 3.5-3.9 | 可以投，注意风险 |
| 3.0-3.4 | 不太推荐 |
| <3.0 | 建议不投 |

---

## 5. 双重风险检测

风险检测在两个系统中都有实现：

```
JD 文本
    │
    ├──[Claude Mode 路径]──→ modes/zh/jianzhi-risk.md
    │                       └── scan-risks.mjs (正则 + 词典)
    │
    └──[TypeScript 路径]──→ /api/agent/scan-risks
                            └── scan-risks.mjs (3 层检测)
                                ├── Layer 1: 正则匹配 (31 条)
                                ├── Layer 2: 词典字面匹配 (30 条黑话)
                                └── Layer 3: 骗术模式检测 (10 种)
```

详见 [风险识别引擎](./04-风险识别引擎.md)

---

## 6. 双轨协作：谁做什么

| 场景 | Claude Mode 文件 | TypeScript Agent |
|------|-----------------|------------------|
| CLI 下评估 JD | ✅ 主力 | - |
| Web 上评估 JD | 提供评估指令给 evaluate-agent | ✅ 执行工具 + SSE 流式 |
| 风险扫描 | 定义检测模式 | ✅ 调 scan-risks + 格式化 |
| CV 优化 | 定义优化策略 | ✅ 调 optimize_resume_section |
| PDF 生成 | ✅ Playwright 渲染 | 提供 API 端点 |
| 面试模拟 | 定义题目风格 | ✅ 引擎 + 状态机 + 评分 |
| 管道管理 | ✅ 读写数据 | 提供 DB 写入 API |
| 门户扫描 | ✅ 执行扫描 | 提供 API 端点 |
