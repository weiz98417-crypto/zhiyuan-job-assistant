# 16 — 从假 Agent 到真 Agent 的改造路线图

## 现状诊断

Next.js Agent 被 gstack 反复标记为"假 Agent"，原因是它**只输出文字，不执行动作**。

```
Claude Agent (真):                       Next.js Agent (假):
  感知 → 决策 → 执行 → 反馈              用户问 → 正则匹配 → DeepSeek → 输出文字
  例: 读JD → 评分 → 写SQLite → 报告       例: "面字节准备啥" → "建议准备STAR故事..."
```

你的项目有 8 个核心功能域，其中只有 JD 评估走 Claude Agent。剩下的 7 个全在 Next.js 前端——**前端做了所有事，Agent 只是聊天界面**。

---

## 全功能现状与改造

### 1. 简历优化系统 (cv/)

**现状**：业界最完善的简历优化工具之一，完全在浏览器跑。

| 功能 | 实现 | Agent 参与？ |
|------|------|-------------|
| 多版简历管理 | `cv-storage.ts` localStorage | ❌ |
| 6 节编辑器 (概述/经历/项目/教育/技能) | 独立 section 编辑 | ❌ |
| 3 套模板 (简洁/现代/紧凑) | A4 实时预览 | ❌ |
| **AI 优化面板** | `OptimizePanel` + `/api/cv/optimize-section` | ⚠️ DeepSeek 调了但只出文字 |
| 4 种优化操作 | full重写 / star 故事化 / quantify 量化 / keywords 注入 | ⚠️ |
| 3 级力度 (1-5) | 从"微调标点"到"完全重写" | ⚠️ |
| 自动追问模式 | effort≥4 时 AI 先提问再生成 | ⚠️ |
| 多方案生成 | 每个 section 生成定向版+通用版双方案 | ⚠️ |
| 参考简历注入 | 读 reference_resumes 表 → 风格对齐 | ⚠️ |
| 偏好学习 | `/api/cv/record-preference` accept/reject | ✅ 有学习闭环 |
| 版本对比 | `VersionDiff` 左右分屏 + diff 高亮 | ❌ |
| PDF 生成 | Playwright ATS 兼容 | ⚠️ 调了脚本但 Agent 不知道 |

**改造**：Agent 不只是"帮你想一段文字"，而是**理解整个简历状态并主动优化**。

```
现在:
  用户: "帮我把经历改成STAR格式"
  Agent: 调 DeepSeek → 输出一段文字

改造后:
  用户: "字节 AI PM 这个岗位帮我弄下简历"
  Agent:
    1. 读 JD → 提取关键词
    2. 检查当前简历的每个 section → 找出不匹配的
    3. 对每个不匹配 section 调 OptimizePanel 的 API
    4. 生成完整定制版简历
    5. "你的经历 section 已重写为 STAR 格式并注入字节相关关键词，技能 section 补充了 LLM 应用经验。要预览吗？"
```

**需要的能力**：
- `optimize_resume_for_jd(company, role)` → 全 section 自动化
- `check_resume_completeness()` → 缺失字段检测 → 追问用户
- `auto_select_references()` → 根据 JD 自动匹配参考简历
- `generate_targeted_pdf()` → 一键定制 + 下载

---

### 2. 面试准备系统 (interview/)

**现状**：独立的面试出题+评分。

| 功能 | 实现 | Agent 参与？ |
|------|------|-------------|
| AI 出题 | `/api/agent/coach/generate-questions` | ⚠️ DeepSeek |
| 回答评分 | `/api/agent/coach/score-answer` | ⚠️ DeepSeek |
| STAR 故事库 | `interview-prep/story-bank.md` | ❌ |
| 公司情报 | Claude Agent 评估报告 | ⚠️ 一次性的 |

**改造**：

```
现在:
  用户: "帮我出几道字节 AI PM 的面试题"
  Agent: 出 5 道题

改造后:
  Agent 主动: "你投了字节 AI PM，JD 里提到'大模型应用落地'和'跨部门协作'，
  这两个是高频考点。我从你的 story-bank 里找到了相关的 STAR 故事，
  建议重点准备这 3 个方向。要模拟一下吗？"
  → 用户答 → Agent 评分 → 指出哪里可以改进 → 记录到 story-bank
```

**需要的能力**：
- `generate_targeted_questions(company, role)` → 基于 JD + 公司风格
- `analyze_story_bank_gaps()` → 发现缺哪种故事 → 提示准备
- `recommend_case_for_interview(company)` → 从作品集推荐案例
- `simulate_interview()` → 多轮对话模拟

---

### 3. 投递追踪系统 (tracker/)

**现状**：手动 CRUD。

| 功能 | 实现 | Agent 参与？ |
|------|------|-------------|
| 状态管理 | 8 个标签 + 手动更新 | ❌ |
| 排序/筛选 | 前端 filter/sort | ❌ |
| 备注编辑 | 内联编辑 | ❌ |

**改造**：

```
现在:
  用户打开 tracker → 手动看 → 手动改状态

改造后:
  Agent 主动: "你投的美团 AI PM 已经 7 天没回复了，建议发跟进邮件。
  需要我帮你起草吗？另外，你评估了 12 个岗位但只投了 3 个——
  评估分 ≥4.0 却没投的有 4 个，要我列出来吗？"
```

**需要的能力**：
- `auto_status_suggestion()` → 时间 + 状态 → 建议变更
- `draft_followup(company)` → 跟进邮件/消息模板
- `detect_stalled_pipeline()` → 评估了不投 / 投了不跟 → 提示

---

### 4. Offer 对比系统 (compare/)

**现状**：手动选择 + 雷达图 + 计算器。

**改造**：

```
现在:
  用户手动选 offer → 看雷达图

改造后:
  Agent: "你拿到了字节和美团两个 offer。综合来看：
  • 字节薪资高 15%（28K vs 24K）但公积金比例低（5% vs 12%）
  • 美团福利更好（补充商业保险 + 15薪）
  • 字节岗位成长性更高（AI产品 vs 传统PM）
  • 综合 6 维评分：字节 3.8 vs 美团 3.5
  建议选字节，但可以拿美团 offer 去谈薪资。要我帮你起草谈判话术吗？"
```

**需要的能力**：
- `deep_compare_offers()` → 6 维打分 + 加权推荐
- `negotiation_strategy()` → 谈判话术 + 数据支撑
- `calculate_real_income()` → 税前→税后→公积金→实际收入

---

### 5. 求职画像系统 (profile/)

**现状**：手动管理。

**改造**：

```
Agent 主动学习:
  • 你拒绝了所有 996 的岗位 → Agent 自动更新 deal-breakers
  • 你投的岗位 80% 是 AI 方向 → Agent 调整 primary archetype
  • 你缺 '数据产品经验' → Agent 从 JD 中检测到高频缺失技能 → 提示
```

**需要的能力**：
- `learn_from_feedback()` → 评分纠正 + 选择模式
- `detect_skill_gaps()` → JD要求 vs CV → 差距
- `recommend_archetype_shift()` → 投递模式分析 → 建议

---

### 6. 风险检测 + JD 评估

**已走 Claude Agent，是真 Agent。** 改造点：
- 让 Next.js Agent 能调用评估流程（不自己生成）
- 评估结果自动回传给 Next.js Agent → 显示在聊天里

---

### 7. Analytics / 首页 RSS

**现状**：纯前端计算和展示。

**改造**：
- Agent 主动解读数据："本周投递转化率低于你历史平均 15%，可能原因：..."
- 新版面世时 Agent 主动通知

---

## 优先级重排

| P | 功能 | 改动量 | 用户感知 |
|----|------|--------|---------|
| P0 | 简历自动优化（读JD→全section优化→PDF） | 中 | **极大** — 从手动编辑器变成一键定制 |
| P0 | 管道主动监控（逾期提醒、状态建议） | 小 | **极大** — Agent 从被动变主动 |
| P1 | 面试自动准备（读JD+story-bank→出题→模拟） | 中 | 大 — 从手动出题变成自动教练 |
| P1 | Offer 深度对比 + 谈判策略 | 小 | 大 — 从前端计算变成 AI 推荐 |
| P2 | 画像自适应学习 | 中 | 中 — 越用越准 |
| P2 | 数据分析解读 | 小 | 中 — 从看图表变成听建议 |
