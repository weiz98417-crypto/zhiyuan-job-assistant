## 1. 基础设施

- [x] 1.1 新增类型定义：`RadarScores`、`HealthCheck`、`WeeklyReport`、`InterviewQuestion`、`CoachMode`、`CoachResult`、`AnswerScore`、`CVScoreResult`、`QuantifyResult`、`OfferPrediction`、`AnomalyAlert`
- [x] 1.2 抽取公共 streaming 工具函数 `lib/stream-utils.ts`

## 2. JD 智能评估引擎

- [x] 2.1 API: `POST /api/evaluate/jd` — 流式 SSE 输出结构化评估报告（摘要→打分→雷达→信号→建议）
- [x] 2.2 API: `POST /api/evaluate/score` — 非流式匹配度打分 + 雷达数据
- [x] 2.3 前端: 实现 SVG 五维雷达图组件 `<RadarChart>`（技能/经验/薪资/成长/风险）
- [x] 2.4 前端: 改版评估结果页，支持流式渲染分段报告
- [x] 2.5 前端: 实现 JD 行话解读信号标注（黄底提示）
- [x] 2.6 前端: 一句话行动建议渲染（根据匹配度变色）
- [x] 2.7 前端: 评估历史搜索 + 双记录对比视图
- [x] 2.8 JD 库增加"快速评估"入口（粘贴框 + 跳转）

## 3. 简历 AI 引擎

- [x] 3.1 API: `POST /api/cv/tailor` — 根据 JD + 简历生成定向优化版本
- [x] 3.2 API: `POST /api/cv/score` — 简历综合评分（内容/结构/关键词/量化四维度）
- [x] 3.3 API: `POST /api/cv/quantify` — 量化经历提取（扫描 + 建议）
- [x] 3.4 前端: 简历页增加「定向优化」面板（选 JD → 优化 → diff 对比）
- [x] 3.5 前端: 实现 diff 对比视图（原版 vs AI 优化版左右对照）
- [x] 3.6 前端: ATS 兼容检查面板 + 红黄绿灯分级
- [x] 3.7 前端: 简历评分卡片 + 子维度展示
- [x] 3.8 前端: 量化经历批量扫描 + 逐条确认

## 4. 面试 AI 教练 V1

- [x] 4.1 API: `POST /api/interview/generate` — 基于 JD+简历生成动态题目（替代 hardcode route）
- [x] 4.2 API: `POST /api/interview/coach` — 回答教练六种模式（输入经历 + 选择模式 → 结构化回答 + 追问）
- [x] 4.3 API: `POST /api/interview/score` — 回答评分（四维度 + 各模式评分权重不同 + 改进建议）
- [x] 4.4 前端: interview 页面改版为三 Tab 结构（出题 / 教练 / 题库）
- [x] 4.5 前端: 出题 Tab — JD 选择器 + 题目卡片（四分类标签 + 弱项标注）
- [x] 4.6 前端: 教练 Tab — 顶部六模式选择器 + 左侧输入经历 / 右侧结构输出 + 追问列表
- [x] 4.7 前端: 评分功能 — 粘贴回答 → 打分 + 改进建议 + 长文逐段反馈
- [x] 4.8 前端: 大厂面试预设选择器（字节/腾讯/阿里 + 自定义）

## 5. 数据分析 AI 洞察

- [x] 5.1 API: `POST /api/analytics/weekly-report` — AI 生成周报
- [x] 5.2 API: `POST /api/analytics/health-check` — Pipeline 健康度检查 + 指示灯
- [x] 5.3 前端: analytics 页增加「AI 洞察」卡片（周报入口 + 健康灯 + 异常列表）
- [x] 5.4 前端: AI 周报渲染（投递统计 + 趋势分析 + AI 点评 + 鼓励语）
- [x] 5.5 前端: Pipeline 健康指示灯（绿/黄/红/灰 + 建议文案）
- [x] 5.6 前端: 异常检测提醒（零回复预警 / 回复速度异常）
- [x] 5.7 前端: Offer 时间预测卡片

## 6. 首页 AI 摘要

- [x] 6.1 前端: 首页增加 AI 每日摘要卡片组件
- [x] 6.2 前端: 卡片内容：投递统计、最近评估、跟进行动项、Pipeline 健康灯
- [x] 6.3 前端: 各模块点击跳转到对应详情页
- [x] 6.4 前端: 无数据时的引导状态（跳转 explore/evaluate 快捷按钮）

## 7. 验证

- [x] 7.1 TypeScript 编译零错误
- [x] 7.2 所有流式 API SSE 响应正常
- [x] 7.3 1920px / 1280px / 375px 无水平滚动条
- [x] 7.4 现有页面（explore、tracker、compare、settings）布局未受影响
- [x] 7.5 所有新路由在无数据时返回友好提示而非 500
