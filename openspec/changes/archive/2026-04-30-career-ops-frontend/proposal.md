# Proposal: Career-Ops Frontend

## Why

Career-Ops 目前完全依赖 CLI/AI 对话界面。用户必须在终端或聊天窗口中粘贴 JD、阅读 Markdown 报告、手动管理追踪表。这对于每天使用求职工具数周甚至数月的中国 AI 行业求职者来说，体验门槛太高。

需要一个独立的前端应用，将 AI 求职引擎的能力封装成一个让人愿意每天打开的温暖空间——一本"数字手帐"，而非冷冰冰的仪表盘。

## What Changes

### 新增前端应用

基于 React/Next.js 构建的独立 SPA 前端，local-first 架构（可后续升级为云端部署），封装以下功能模块：

1. **首页（今日手帐）** — 求职概览：本周投递数、活跃面试、新机会提醒、每日金句
2. **JD 评估** — 粘贴 JD 文本或 URL → A-G 完整评估报告（Block A-G）
3. **投递追踪** — 应用状态管理（8 种规范状态）、搜索过滤、批量操作
4. **Offer 对比** — 多 offer 并排比较（薪资结构、福利、成长空间、风险）
5. **简历优化** — 基于 JD 定制简历、关键词注入、PDF 生成/预览
6. **面试准备** — STAR+R 故事库、公司深度研究、模拟问题生成
7. **数据分析** — 转化漏斗、拒绝模式分析、跟进提醒
8. **职位发现** — 扫描配置管理、新职位通知
9. **个人档案** — 职业叙事、优势、薪资目标、偏好设置

### 设计方向

遵循 PRODUCT.md 和 DESIGN.md 定义的设计系统：
- **Creative North Star**: "一页翻开的手帳"
- **色彩策略**: Committed — Warm Amber Glow 承担界面 30-50% 色彩面积
- **字体**: 圆体/手写感 Display + 干净人文无衬线 Body（The Handwriting Gap Rule）
- **质感**: 有机圆角体系、Flat-At-Rest、暖色层级、编排过的入场动画
- **注册类型**: Brand（设计即是产品）

### 技术决策

- **框架**: Next.js 14+ (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS + CSS Variables（OKLCH 色彩空间）
- **状态管理**: local-first（IndexedDB / localForage），后续可加云端同步
- **数据**: 复用现有 data/ 目录的 Markdown/TSV/YAML 格式，前端直接解析
- **PDF**: 复用现有 generate-pdf.mjs 逻辑，前端触发

## Capabilities

### New Capabilities

- `frontend-shell`: 前端应用壳——路由、导航、布局、设计系统
- `jd-evaluation-ui`: JD 评估界面——粘贴输入、A-G 报告渲染、评分可视化
- `application-tracker-ui`: 投递追踪界面——列表/看板视图、状态管理、搜索过滤
- `offer-comparison-ui`: Offer 对比界面——多选并排比较、维度雷达图
- `cv-optimization-ui`: 简历优化界面——JD 配对、关键词高亮、PDF 预览
- `interview-prep-ui`: 面试准备界面——故事库管理、公司研究、问题生成
- `analytics-ui`: 数据分析界面——漏斗图、模式分析、跟进日历
- `job-discovery-ui`: 职位发现界面——扫描配置、结果浏览
- `profile-settings-ui`: 个人档案界面——信息编辑、偏好设置

### Modified Capabilities

无——现有 CLI 系统保持不变，前端为新增层。

## Impact

- 新增 `frontend/` 目录（Next.js 项目）
- `DESIGN.md` 需在实现后从 seed 更新为实际 token（运行 `/impeccable document`）
- `CLAUDE.md` 需新增 frontend 相关说明
- 现有 `.mjs` 脚本、`modes/`、`data/` 均不受影响
