## Context

当前评估 API (`/api/evaluate`) 从远程 modes 文件加载评估指令，调用 DeepSeek 生成 7 块结构化报告。前端展示 7 个可折叠 block + 总分 + 关键词标签。评估是单向的——告诉用户"匹配几分"，但不告诉用户"缺什么、怎么补"。

用户简历数据存储在两个地方：
1. 项目根目录 `cv.md`（CLI 系统使用）
2. 前端 localStorage `lingji-ai-profile`（UserProfile，含 superpowers/headline）

## Goals / Non-Goals

**Goals:**
- 在现有 7 块报告之上，API 额外返回：关键词覆盖率、技能缺口、职级匹配、差异化提示
- 前端展示这 4 个新维度的可视化 UI
- 不增加额外的 API 调用——所有分析在同一次 DeepSeek 请求中完成（扩展 prompt）

**Non-Goals:**
- 不做 embedding 语义匹配（Phase 3）
- 不改动 IndexedDB 表结构（新字段存储为 JSON blob 或扩展类型）
- 不做简历自动改写（那是 eval-inline-resume 的 scope）

## Decisions

### 1. 所有新维度在同一轮 LLM 调用中生成

**选择**：扩展现有 prompt，要求 LLM 在 JSON 输出中增加 4 个新字段。不拆成多次调用。

**理由**：一次调用完成所有分析，延迟不变。多一次 LLM 轮次会增加 50%+ 的总耗时和 token 消耗。

### 2. 用户画像从前端传入 API

**选择**：前端发送 `userProfile` 对象（含 superpowers / headline / exitStory / targetRoles），API 拼入 prompt。

**理由**：后端不能直接读 localStorage。CV 文件路径跨前后端不一致。

### 3. 报告数据模型扩展用 JSON 字段

**选择**：`EvaluationReport` 新增 `keywordCoverage`、`skillGaps`、`levelMatch`、`differentiationTips` 字段，类型为具体 interface。IndexedDB 直接存这些 JSON 对象。

## Risks / Trade-offs

- LLM 一次生成更多字段 → 输出可能截断 → `max_tokens` 从 8000 提到 12000
- 没有真实 CV 全文 → skill gap 分析精度有限 → 依赖 userProfile 里的 superpowers 和 headline 作为简历摘要
