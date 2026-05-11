# Tasks: Career-Ops Frontend

## 1. 项目初始化

- [x] 1.1 创建 Next.js 14+ 项目（TypeScript, App Router, Tailwind CSS）
- [x] 1.2 配置 Tailwind CSS Variables（OKLCH 色彩空间，设计 token）
- [x] 1.3 安装核心依赖（framer-motion, dexie.js, js-yaml, lucide-react）
- [x] 1.4 设置 TypeScript 类型定义（Application, Report, Offer, Story, Profile）
- [x] 1.5 创建 Dexie.js 数据库 schema（applications, reports, pipelineUrls, settings, stories, offers）
- [x] 1.6 创建 Markdown/TSV/YAML 解析器（parsers.ts）和导出器（exporters.ts）
- [x] 1.7 配置字体加载（Display 圆体 + Body 人文无衬线，中文优先）

## 2. 设计系统组件

- [x] 2.1 构建色彩系统（Warm Amber Glow, Cream Paper, Warm Ink, Soft Shadow Ash 的 CSS Variables）
- [x] 2.2 构建字体层级组件（Display, Headline, Title, Body, Label）
- [x] 2.3 构建基础交互组件（WarmButton, PaperCard, HandwritingTitle, ScoreBadge, StatusTag, Divider）
- [x] 2.4 构建布局组件（PageTransition, StaggerList, Section, AppShell）
- [x] 2.5 实现有机圆角体系（8px-24px，随层级上升变圆）
- [x] 2.6 实现暖色阴影/层级系统（Flat-At-Rest Rule）
- [x] 2.7 定义入场动画 preset（fadeInUp, staggerChildren, pageFlip, handwritingReveal）

## 3. App Shell 与导航

- [x] 3.1 构建 Root Layout（左侧导航 + 内容区）
- [x] 3.2 构建桌面端左侧垂直导航（9 个模块，像手帐目录）
- [x] 3.3 构建移动端底部 Tab Bar（响应式切换）
- [x] 3.4 实现页面路由和 PageTransition 动画
- [x] 3.5 构建 Providers（数据库 Context、主题 Context）
- [x] 3.6 构建主题切换（浅色/深色，深色保持温暖调性）

## 4. 首页（今日手帐）

- [x] 4.1 构建首页布局——手帐封面感
- [x] 4.2 今日求职概览卡片（本周投递数、活跃面试、新机会）
- [x] 4.3 快速操作入口（贴 JD 评估、查看追踪、优化简历）
- [x] 4.4 每日金句/鼓励语
- [x] 4.5 即将到来的面试提醒
- [x] 4.6 最近活动时间线

## 5. JD 评估

- [x] 5.1 构建评估入口页——JD 输入框（文本/URL tabs）
- [x] 5.2 构建评估加载动画（手写笔迹逐渐出现 + 进度文字）
- [x] 5.3 构建 A-G 报告渲染组件（Block A 到 Block G 的完整渲染）
- [x] 5.4 构建评分可视化组件（大号 Display 数字 + 人话解读）
- [x] 5.5 实现报告模块折叠/展开
- [x] 5.6 构建报告操作栏（加入追踪、优化简历、准备面试）
- [x] 5.7 构建评估历史页（列表 + 搜索 + 过滤）
- [x] 5.8 实现 mock 评估数据（完整报告样本）

## 6. 投递追踪

- [x] 6.1 构建列表视图（排序、搜索、过滤）
- [x] 6.2 构建分组视图（按状态分组，色彩编码）
- [x] 6.3 构建看板视图（Kanban 列，拖拽变更状态）
- [x] 6.4 实现状态选择器和状态变更
- [x] 6.5 实现面试进度追踪（轮次、日期）
- [x] 6.6 实现批量操作（批量状态更新、批量导出）
- [x] 6.7 构建投递详情面板（关联报告、面试记录、备注）

## 7. Offer 对比

- [x] 7.1 构建 Offer 录入表单（中国薪资结构：月薪、年终奖、五险一金、期权）
- [x] 7.2 构建并排对比视图（2-4 个 Offer）
- [x] 7.3 构建雷达图可视化（薪资、成长、WLB、前景、匹配、风险）
- [x] 7.4 实现总薪酬自动计算（年总包 + 五险一金差异）
- [x] 7.5 构建决策矩阵（可调权重、加权总分排序）
- [x] 7.6 生成谈判建议

## 8. 简历优化

- [x] 8.1 构建简历编辑器（Summary、工作经历、项目、教育、技能 section）
- [x] 8.2 构建 JD 配对面板（关键词高亮、匹配度指示）
- [x] 8.3 构建 AI 优化建议列表（逐条展示、单条接受/拒绝）
- [x] 8.4 构建关键词注入预览
- [x] 8.5 构建实时 A4 PDF 预览
- [x] 8.6 构建简历模板选择器（2-3 套模板）
- [x] 8.7 实现 PDF 下载（复用 generate-pdf.mjs 逻辑）

## 9. 面试准备

- [x] 9.1 构建 STAR+R 故事库列表（卡片视图）
- [x] 9.2 构建故事编辑器（S/T/A/R/Reflection + 适用问题标签）
- [x] 9.3 实现按问题搜索匹配故事
- [x] 9.4 构建公司研究页面
- [x] 9.5 构建面试问题生成器（按类别分组）
- [x] 9.6 构建面试日程视图（时间线 + 准备清单）
- [x] 9.7 构建准备清单（可勾选）

## 10. 数据分析

- [x] 10.1 构建转化漏斗图（温暖渐变色，非标准蓝色）
- [x] 10.2 实现时间段对比
- [x] 10.3 构建拒绝模式分析（原因分类、比例图）
- [x] 10.4 构建跟进提醒列表（按紧急程度排序）
- [x] 10.5 实现跟进频率规则（7天/14天/30天）
- [x] 10.6 构建求职周报组件（本周摘要 + 鼓励语）
- [x] 10.7 构建历史趋势折线图（8周）

## 11. 职位发现

- [x] 11.1 构建扫描源列表（来自 portals.yml 配置）
- [x] 11.2 构建关键词编辑面板（正向/负向关键词）
- [x] 11.3 构建扫描结果卡片列表
- [x] 11.4 构建职位详情预览
- [x] 11.5 实现手动扫描触发和进度展示
- [x] 11.6 构建扫描历史

## 12. 个人设置

- [x] 12.1 构建个人信息编辑表单
- [x] 12.2 构建职业定位编辑（目标岗位、叙事、Superpowers 排序）
- [x] 12.3 构建中国薪资设置表单
- [x] 12.4 实现语言切换（中/英）
- [x] 12.5 实现数据导出（ZIP 下载，CLI 兼容格式）
- [x] 12.6 实现数据导入（ZIP 上传，去重合并）

## 13. 收尾打磨

- [x] 13.1 移动端响应式适配（所有页面）
- [x] 13.2 动效打磨（页面过渡、列表动画、数字滚动）
- [x] 13.3 prefers-reduced-motion 适配
- [x] 13.4 暗色模式完善（保持温暖调性）
- [x] 13.5 数据导入导出端到端测试
- [x] 13.6 无障碍检查（WCAG 2.1 AA）
- [x] 13.7 更新 DESIGN.md（运行 `/impeccable document` 捕获实际 token）
- [x] 13.8 更新 CLAUDE.md 新增 frontend 说明
