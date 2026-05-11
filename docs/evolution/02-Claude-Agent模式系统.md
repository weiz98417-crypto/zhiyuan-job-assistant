# 02 — Agent 模式系统

> 当前状态：Web 优先，CLI 可选

---

## 1. 概述

筝筝纸鸢的 Agent 系统经历了两个阶段：

```
阶段 1 (2026-05-09 前)              阶段 2 (当前)
─────────────────────────           ─────────────────────
Claude Mode 文件 唯一智能层          TypeScript Agent 主力
                                    Claude Mode 文件 降为 CLI 备选
需要 Claude Code CLI                 浏览器打开即用
Markdown = Prompt                    TypeScript ReAct Loop
改 Prompt = 改文件                   改代码 = 改工具
```

**现在的真实情况：用户打开 `http://localhost:3000/agent`，浏览器里直接对话，完全不需要 Claude Code CLI。**

Claude Mode 文件（`modes/zh/*.md`）保留的原因是：
1. 它们是评分引擎的"规范文档"——定义了 A-G 7 维怎么打分、风险怎么分类
2. `scripts/scan-risks.mjs` 等脚本仍然被 TypeScript Agent 的 API 路由调用
3. 有用户偏好 CLI 工作流时仍可用

---

## 2. TypeScript Agent 系统（主力）

### 架构分层

```
浏览器 (src/app/agent/page.tsx)
    │  SSE 流式连接
    ▼
编排器 (src/lib/agent/orchestrator/index.ts)
    ├── classifyIntent() → 意图分类 → 5 子 Agent 择一
    ├── AgentPromptContext 组装（画像 + 3 层记忆 + 知识）
    └── agentLoopClient() / agentLoopServer()
    │
    ▼
Agent Loop (src/lib/agent/loop/)
    ├── callLLM() → DeepSeek V4 → GLM-4 → Qwen-Long (模型降级)
    ├── Native function calling → 27 TypeScript 工具
    └── Quality gate → checkResultQuality → self-healing
    │
    ▼
工具注册表 (src/lib/agent/tools/)
    ├── registry.execute("tool_name", params)
    └── formatResult() → LLM 上下文注入
```

### 5 个子 Agent

| Agent ID | 名称 | 工具白名单 | 触发条件 |
|----------|------|-----------|---------|
| `general` | 通用助手 | 全部 27 工具 | 兜底（`.*`） |
| `evaluate` | JD 评估 | evaluate_jd_full, analyze_jd_risks, decode_terms | 评估/分析 JD |
| `resume` | 简历优化 | optimize_resume_section, save_resume_section, ats_check | 简历/优化/CV |
| `interview` | 面试教练 | prepare_interview_full, start_interview_session | 面试/准备 |
| `profile` | 求职画像 | mine_profile, self_positioning, detect_skill_gaps | 定位/画像 |

---

## 3. Claude Mode 文件系统（CLI 备选 / 规范文档）

### 定位

Mode 文件现在扮演两个角色：
- **规范文档**：定义评分维度、风险分类、评估流程的业务规则
- **CLI 备选**：如果用户在 Claude Code 中直接跑，仍然能工作

### 核心文件

| 文件 | 角色 |
|------|------|
| `CLAUDE.md` | Claude Code 的 Skill 路由入口（CLI 用） |
| `modes/zh/jianzhi.md` | JD 评估流程定义（规范文档） |
| `modes/zh/jianzhi-risk.md` | 风险检测流程定义 |
| `modes/zh/risk-intel.md` | 风险知识库：30 条黑话 + 10 种骗术模式 + 46 薪资基准 |
| `modes/zh/_shared.md` | 评分引擎规范 |
| `modes/zh/_profile.md` | 用户画像模板 |
| `modes/oferta.md` | Offer 评估规范 |
| `DATA_CONTRACT.md` | 用户层/系统层数据分界规则 |
| `templates/states.yml` | 投递状态规范定义 |

### Mode 路由（CLI 路径）

```
CLI 用户 (Claude Code)
    │
    ▼
CLAUDE.md (根路由器)
    ├── 粘贴 JD/URL  → modes/zh/jianzhi.md → A-G 评估
    ├── Offer 评估   → modes/oferta.md
    ├── 面试准备     → modes/interview-prep.md
    ├── 扫描门户     → modes/scan.md
    ├── PDF 生成     → modes/zh/pdf.md
    └── 管道处理     → modes/pipeline.md
```

---

## 4. 评分引擎

### 评分维度（A-G 7 维）

评分引擎的业务规则定义在 Claude Mode 文件中，执行在 TypeScript 工具中：

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

## 5. Web 路径 vs CLI 路径

| 场景 | Web (TypeScript Agent) | CLI (Claude Mode) |
|------|----------------------|-------------------|
| JD 评估 | evaluate_jd_full 工具 → 浏览器展示 | CLI 直接跑 jianzhi.md |
| 风险扫描 | /api/agent/scan-risks → scan-risks.mjs | CLI 直接跑 scan-risks.mjs |
| CV 优化 | optimize_resume_section → 流式选方案 | - （CLI 无此功能） |
| PDF 导出 | /api/cv/generate-pdf → 下载 | CLI Playwright 渲染 |
| 面试模拟 | interview engine 状态机 → 实时评分 | - （CLI 无此功能） |
| 投递追踪 | search_applications 工具 → 表格展示 | CLI 读 SQLite |
| 求职画像 | get_profile_insights → 卡片展示 | CLI 读 YAML |

**结论：Web 是完整产品，CLI 是开发者备选。**
