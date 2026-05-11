# 02 — Claude Agent 模式系统

> 所属阶段：Phase 0-1 · 架构核心

---

## 1. 概述

模式系统是筝筝纸鸢的**核心智能层**。它没有代码引擎——Agent 读取 Markdown 文件作为系统提示词，动态执行指令。这是整个系统最根本的设计决策。

### 为什么不用 Agent 框架

| 方案 | 优点 | 缺点 |
|------|------|------|
| LangChain/CrewAI | 类型安全、可测试 | 框架锁死、调 prompt 要改代码 |
| **Mode 文件（当前）** | 改 prompt 不改代码、极致灵活 | 依赖 LLM 输出质量、需要校验层 |

---

## 2. Mode 路由机制

```
用户输入 (URL / 文本 / 命令)
    │
    ▼
CLAUDE.md (根路由器)
    │
    ├── 粘贴 JD/URL  ────→ modes/zh/jianzhi.md (中文评估)
    │                     ├── 第-1步: jianzhi-risk.md (风险检测)
    │                     ├── 第0步: Archetype 检测
    │                     ├── A-G 7维评分
    │                     └── 评估后: validate → db-write
    │
    ├── Offer 评估 ──────→ modes/oferta.md (英文)
    │                     └── modes/zh/jianzhi.md (中文)
    │
    ├── 面试准备 ────────→ modes/interview-prep.md
    │
    ├── 扫描门户 ────────→ modes/scan.md
    │
    ├── 批量处理 ────────→ modes/batch.md
    │
    ├── PDF 生成 ────────→ modes/pdf.md
    │                     └── scripts/generate-pdf.mjs
    │
    ├── 管道处理 ────────→ modes/pipeline.md
    │
    ├── 应用追踪 ────────→ modes/tracker.md
    │
    └── 自我定位 ────────→ modes/zh/dingwei.md (中文职业探索)
```

### 语言路由

| 触发条件 | Mode 路径 | 评分引擎 |
|---------|----------|---------|
| 中文 JD / 用户在中国 | `modes/zh/` | 中文特有：五险一金、税前税后、13薪、996、竞业限制 |
| 英文 JD | `modes/` | 英文标准：salary band、equity、remote policy |

两种语言共享 `modes/scoring-dimensions.yml` 的评分结构，差异仅在评估 prompt 的措辞和 label 字段。

---

## 3. Mode 文件结构

每个 Mode 文件遵循标准模板：

```markdown
# 模式：<name> — <简述>

<触发条件>

## 第N步 — <步骤名>
<具体指令>

## 评估后流程
### 1. 保存报告
### 2. 校验输出 (validate-output.mjs)
### 3. 持久化 (db-write.mjs)
```

关键规则：
- Mode 文件是**操作指令**，不是文档——Agent 逐行执行
- 所有 Mode 共享 `modes/_shared.md` (或 `zh/_shared.md`) 中的评分系统和工具定义
- `modes/_profile.md` (用户自定义) 覆盖 `_shared.md` 中的默认值

---

## 4. 评分引擎

### 维度定义 (scoring-dimensions.yml v1.0.0)

```yaml
dimensions:
  - id: A, key: role_summary,       weight: 10  # 岗位摘要与公司背景
  - id: B, key: cv_match,           weight: 20  # 简历匹配度
  - id: C, key: level_strategy,     weight: 15  # 级别定位与竞争策略
  - id: D, key: compensation,       weight: 15  # 薪酬福利评估
  - id: E, key: personalization,    weight: 15  # 个性化申请方案
  - id: F, key: interview_prep,     weight: 15  # 面试准备 (STAR+R)
  - id: G, key: legitimacy,         weight: 10  # 发布合法性与风险提示
```

### 分数解读

| 分数 | 含义 | 建议 |
|------|------|------|
| 4.5+ | 强匹配 | 建议立即投递 |
| 4.0-4.4 | 好匹配 | 值得申请 |
| 3.5-3.9 | 一般 | 有特别原因才申请 |
| <3.5 | 弱匹配 | 建议不投 |

### 风险降级

如果风险检测引擎发现信号，评分会被降级：

| 风险等级 | 条件 | 对评分影响 |
|---------|------|-----------|
| 🔴 严重 | 命中 critical 信号 | 强制 1.0/5 |
| 🔴 高风险 | 总分 ≥6, 无 critical | 上限 min(原分, 2.5)/5 |
| 🟡 中风险 | 总分 2-5 | 不变,加横幅 |
| 🟢 低风险 | 总分 ≤1 | 正常评估 |

---

## 5. 工具定义

所有 Mode 共享 `_shared.md` 中定义的工具集：

| 工具 | 用途 | 限制 |
|------|------|------|
| WebSearch | 薪资研究、公司文化、行业趋势 | — |
| WebFetch | 静态页面 JD 提取 | — |
| Playwright | 验证职位发布、提取 SPA JD | **禁止并行** |
| Read | cv.md、profile、article-digest、模板 | — |
| Write | 报告 .md、临时 HTML | — |
| Edit | 更新追踪表 | — |
| Bash | `node *.mjs` 脚本执行 | — |

---

## 6. 用户数据层 vs 系统层

```
User Layer (NEVER auto-updated):     System Layer (auto-updatable):
├── cv.md                            ├── modes/*.md
├── config/profile.yml               ├── scripts/*.mjs
├── modes/_profile.md                ├── templates/*
├── article-digest.md (optional)     ├── CLAUDE.md
├── portals.yml                      ├── DATA_CONTRACT.md
├── data/*                           └── VERSION
├── reports/*
└── output/*
```

**硬规则：** Agent 自定义请求必须写入 `modes/_profile.md` 或 `config/profile.yml`。绝不写入 `modes/_shared.md`。
