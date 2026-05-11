# 16 — 从假 Agent 到真 Agent 的改造路线图

## 架构演进: 我们做了什么

### 旧架构 ("假 Agent")

```
Claude Agent (真):                       Next.js Agent (假):
  感知 → 决策 → 执行 → 反馈              用户问 → 正则匹配 → DeepSeek → 输出文字
  例: 读JD → 评分 → 写SQLite → 报告       例: "面字节准备啥" → "建议准备STAR故事..."
```

用户有 8 个核心功能域，只有 JD 评估走过 Claude Agent。剩下 7 个全在前端——**前端做了所有事，Agent 只是聊天界面**。

### 新架构 ("真 Agent")

```
用户 → Next.js 前端 → API Route (Next.js Edge/Node)
  → Agent Loop (server-side, src/lib/agent/loop/server-runner.ts)
    → Tool Registry (native function calling)
      ├── Claude/DeepSeek API (思考 + 决策)
      ├── SQLite (读/写, via better-sqlite3 in API layer)
      ├── Playwright/Puppeteer (PDF, scraping)
      └── 外部 API (职位搜索等)
    → 工具执行 → 结果返回前端 → SSE streaming
```

关键变化：

| 维度 | 旧 (v1) | 新 (v2) |
|------|---------|---------|
| Agent 循环 | 前端 client-runner.ts 模拟 | 服务端 server-runner.ts 原生 function calling |
| 工具执行 | 前端 fetch → 独立 API route | Agent loop 内直接调用 tool implementation |
| 数据存储 | IndexedDB (DexieDB) 前端为主 | SQLite 服务端 (via API)，前端只读 |
| 错误恢复 | 无 | 自愈逻辑（最多 3 次重试） |
| 状态流 | 轮询 | SSE streaming |
| 评估执行 | Claude Agent 一次性的 | Agent tool 可被任何对话触发 |

---

## 已完成的功能改造

以下是从旧文档中标记为"需要改造"后实际完成了的部分：

### 1. 简历优化 → optimize_resume_section + save_resume_section

- **tool: `optimize_resume_section`** — Agent 读取 JD + cv.md → 生成定向版+通用版双方案
- **tool: `save_resume_section`** — 用户确认后写入 SQLite cv_sections 表
- 闭环：Agent 对话内完成「建议 → 确认 → 保存」，不再依赖独立 OptimizePanel

### 2. 管道监控 → check_pipeline_health

- **tool: `check_pipeline_health`** — 读取 SQLite applications 表，检测：
  - 逾期未回复（>7 天无更新）
  - 评估了未投递（score ≥ 4.0 但状态仍为 evaluated）
  - 状态异常停滞
- Agent 主动提醒："你投的美团 AI PM 已经 9 天没回复了，要发跟进邮件吗？"

### 3. 自我定位 → self_positioning

- **tool: `self_positioning`** — 基于全量 applications + reports 数据，分析用户市场定位
- 输出：竞争力排名、差异化建议、目标市场估值

### 4. 面试准备 → prepare_interview_full + start_interview_session

- **tool: `prepare_interview_full`** — 读 JD + story-bank → 生成面试题 + 公司情报
- **tool: `start_interview_session`** — 创建多轮模拟面试会话（`/api/agent/coach/session`）

### 5. Offer 深度对比 → compare_offers_deep

- **tool: `compare_offers_deep`** — 6 维打分 + 加权推荐 + 谈判策略 + 实际收入计算
- 超越前端雷达图：Agent 输出结构化对比报告 + 话术建议

### 6. 技能缺口检测 → detect_skill_gaps

- **tool: `detect_skill_gaps`** — JD 高频要求 vs 用户 skills 列表 → 缺口报告
- 自动触发：当 Agent 评估 JD 时同时检测

### 7. 画像洞察 → get_profile_insights

- **tool: `get_profile_insights`** — 全量历史数据分析用户画像演变
- 输出：投递模式、偏好趋势、技能缺口、deal-breaker 建议

### 8. 术语解码 → decode_black_market_terms

- **tool: `decode_terms`** (API: `/api/agent/decode-terms`) — 解码 JD 中的潜台词
- 例如："弹性工作制" → "大概率无偿加班"、"有竞争力的薪资" → "低于市场平均"
- 支持中文求职市场特有黑话

---

## 剩余工作

### ATS 检查 UX 集成

- `/api/cv/ats-check` 端点已实现，但前端 UI 未完整集成
- 需要：简历编辑页的"ATS 检查"按钮 + 结果面板
- Agent tool `ats_check` 已注册，需在 Agent 对话中触发

### 面试引擎打磨

- `start_interview_session` 已实现基础流程（出题 → 评分 → 下一题）
- 待完善：
  - 多语言支持切换（中/英面试模式）
  - 压力面试模式（加速、追问、质疑）
  - 面试历史回放 + 进度追踪
  - 语音输入支持

### Analytics 页 Agent 集成

- 当前 `/analytics` 页仍为纯前端计算
- 需要：Agent 主动解读数据 → 聊天内呈现
  - "你的投递转化率比上月下降 12%，可能原因：..."
  - "你投递的岗位中薪资中位数低于市场 15%，建议..."

### Agent 自主主动能力

当前 Agent 仍为被动响应（用户问才答）。需要实现：

- **定时触发**：每天检查 pipeline 健康，主动推送通知
- **事件驱动**：JD 评估完成后自动检测技能缺口并推送
- **学习反馈**：用户评分反馈 → 自动调整评估权重

### 数据迁移收尾

- IndexedDB → SQLite 迁移的收尾工作
- 前端所有读操作确认走 API 而非直接 IndexedDB
- 离线缓存策略（API 失败时的降级方案）

---

## 架构决策记录

### 为什么从 client-runner 迁移到 server-runner

1. **安全性**: Tool 实现不应暴露在前端（API keys、DB access）
2. **SSE streaming**: 服务端可原生 SSE，前端只需 EventSource
3. **重试/自愈**: 服务端可做 3 次重试 + fallback model 切换
4. **执行状态**: 服务端记录每步 tool execution status，前端展示

### 为什么从 IndexedDB 迁移到 SQLite

1. **一致性**: Agent (Claude) 和前端共享同一数据源
2. **查询能力**: SQL 复杂查询远强于 IndexedDB API
3. **备份/迁移**: SQLite 文件可直接备份，不需要导出 IndexedDB
4. **FTS5**: SQLite 内置全文搜索，用于简历和报告搜索

### 为什么用 function calling 而非正则匹配

旧版 Agent "意图识别" 用关键词正则匹配路由到不同 mode。新版用 LLM native function calling：
- LLM 自行决定调用哪个 tool（不依赖路由规则）
- Tool 参数由 LLM 从对话上下文推断
- 支持多 tool 串联（如：先 evaluate_jd_full → 再 optimize_resume_section）
