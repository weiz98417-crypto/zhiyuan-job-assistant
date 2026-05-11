## Why

当前产品只有 explore 页面有 AI 能力（聊天 + summarize），其余 8 个页面都是手动 CRUD。用户的核心工作流——看 JD → 改简历 → 准备面试 → 追踪分析——每个环节都需要 AI 深度参与，而不是让 AI 只待在聊天框里。V1.5 是第一轮 AI 能力升级，目标是把 AI 嵌入用户每天真实使用的高频场景。

## What Changes

### 1. JD 智能评估引擎
- JD 粘贴（URL/截图/文本）→ 流式输出结构化评估报告
- 五维雷达图：技能/经验/薪资/成长/风险
- JD 行话解读（"快速迭代" → 加班信号，"扁平化管理" → 晋升模糊）
- 一句话行动建议（"值得投，但面试要问清汇报线"）
- 评估历史可搜索、可对比

### 2. 简历 AI 引擎
- JD 定向简历优化：选目标 JD → AI 重写，保持真实只优化关键词密度
- 量化经历提取：从描述文字中自动提取可量化的成果
- ATS 兼容检查：关键词密度、格式兼容性、段落结构评分
- 多版本简历管理 + 评分 + 优化前后对比视图

### 3. 面试 AI 教练 V1
- 动态出题：根据 JD + 简历 + 弱项生成个性化面试题目（替代现有 hardcode 题库）
- 回答教练（六种模式覆盖国内全场景）：
  - 模式1 项目复盘 — 互联网大厂/科技公司
  - 模式2 行为问答 — 外企/咨询
  - 模式3 情景应对 — 大厂交叉面/群面/管培
  - 模式4 结构化面试 — 中小企业（50-500人）
  - 模式5 创始人对话 — 初创/微型（<50人）
  - 模式6 稳重应答 — 国企/央企/银行
- 回答评分：AI 打分 + 改进建议（结构/具体度/亮点/时间），各模式评分权重不同

### 4. 数据分析 AI 洞察
- AI 周报：自动生成求职健康报告
- 异常检测：回复速度异常、某方向零回复预警
- Pipeline 健康度评分 + 预测 Offer 时间窗口
- 首页集成每日 AI 摘要

## Capabilities

### New Capabilities
- `jd-smart-evaluate`: JD 流式智能评估，含雷达图、行话解读、行动建议
- `cv-ai-tailor`: 简历 AI 定制引擎，含 JD 定向优化、量化提取、ATS 检查
- `interview-ai-coach`: 面试 AI 教练，含动态出题、STAR 教练、回答评分
- `ai-job-insights`: AI 求职洞察，含周报生成、异常检测、Pipeline 健康度

### Modified Capabilities
- `jd-evaluation-ui`: 评估结果页改版，增加雷达图和分段分析
- `cv-optimization-ui`: 增加 AI 优化面板和前后对比视图
- `interview-prep-ui`: 大改版为三 Tab 结构（出题/教练/题库）
- `analytics-ui`: 增加 AI 洞察卡片和健康度指示灯
- `jd-library-ui`: 增加快速评估入口（粘贴即评）
- `frontend-shell`: 首页增加每日 AI 摘要卡片

## Impact

- **API 路由**: 新增 8 个（evaluate/jd, evaluate/score, cv/tailor, cv/score, cv/quantify, interview/generate, interview/coach, interview/score, analytics/weekly-report, analytics/health-check）；改造 1 个（interview/questions → interview/generate）
- **前端页面**: evaluate（大改）、cv（大改）、interview（大改）、analytics（中改）、首页（小改）
- **依赖**: 无新增第三方依赖，复用现有 DeepSeek API + streaming 基础设施
- **数据模型**: 新增 `RadarScores`、`HealthCheck`、`WeeklyReport` 类型
