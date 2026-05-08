# 筝筝纸鸢 (Zhiyuan) — AI 求职助手

> **致谢**：本项目基于开源项目 [career-ops](https://github.com/bengous/career-ops)，进行了大量本土化改造与功能增强，包括交互式前端看板、AI 简历优化评判引擎、Agent 多智能体架构、岗位写作模版系统等。感谢原作者将 career-ops 开源。

<p align="center">
  <img src="https://img.shields.io/badge/DeepSeek_V4_Pro-4B6BFB?style=flat&logo=deepseek&logoColor=white" alt="DeepSeek V4 Pro">
  <img src="https://img.shields.io/badge/Next.js_16-000?style=flat&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
</p>

[English](README.md)

---

## 这是什么

**筝筝纸鸢** 是一个面向中国求职市场的 AI 驱动求职管理系统。它可以帮你：

- **评估职位 JD**：结构化的多维度评分体系，覆盖岗位匹配、简历匹配、薪资、面试准备等维度
- **AI 优化简历**：四维评判引擎，支持 8 种岗位角色模版，逐段精细化改写
- **面试准备**：AI 根据 JD 自动生成面试问题，支持多轮练习
- **追踪投递进度**：从评估到 Offer 的全流程状态管理
- **Offer 对比**：综合税前月薪、五险一金、公积金、年终奖、试用期等中国特有维度
- **求职画像**：AI 自动提取和持续更新你的职业技能、偏好和市场匹配度

> **这不是海投工具。** 筝筝纸鸢是一个过滤器，帮你从众多职位中找出真正值得投入时间的少数机会。

## 核心功能

### 🎨 交互式前端看板

完整的 Next.js Web 应用，包含 **11 个页面**：

| 页面 | 功能 |
|------|------|
| **Agent 对话** | 多智能体聊天，自动路由到简历/评估/面试/画像 Agent |
| **简历管理** | 多版本简历编辑、PDF 预览下载、AI 逐段优化、版本对比 |
| **JD 评估** | 粘贴职位描述/链接，AI 多维评分，报告历史管理 |
| **投递追踪** | 全流程 Pipeline 管理，面试轮次记录，状态流转 |
| **面试准备** | AI 生成针对性问题，多轮练习，问答评分 |
| **Offer 对比** | 多 Offer 横向比较，含五险一金/公积金/试用期 |
| **职位发现** | 扫描招聘平台，自动去重，liveness 检查 |
| **求职画像** | 技能雷达、市场匹配度、偏好分析、演化时间线 |
| **数据分析** | 投递转化漏斗、健康检查、周报 |
| **个人设置** | 个人信息、目标岗位、薪资范围、偏好配置 |
| **探索对话** | 自由探索式 AI 对话 |

### 🤖 AI 简历优化评判引擎

核心创新——**四维评判模型**：

```
Operation（操作类型）  >  JD（内容滤网） ≈ Reference（风格范本）  >  Effort（执行深度）
```

- **4 种优化操作**：全面优化 / STAR 重组 / 量化增强 / 关键词注入
- **5 档改写强度**：从温和润色到完全重写，每档输出有肉眼可见差异
- **XX 占位符机制**：AI 大胆推断量化维度，用 `[XX]` 标注，由你填入真实数字——不编造、不干瘪
- **追问模式**（Effort 4-5 可选）：AI 先问你几个关键信息问题，融合答案后再生成
- **8 套岗位写作模版**：

| 模版 | 适用角色 |
|------|---------|
| **AI 产品经理** | LLM/Agent 架构、Prompt Engineering、Vibe Coding→SDD |
| **产品经理** | 需求获取→PRD→评审→协作→闭环，11 维全链路 |
| **后端工程师** | 技术选型理由 + QPS/TP99/可用性/成本量化 |
| **前端工程师** | 性能优化(Web Vitals) + 工程化(Monorepo/CI-CD) |
| **数据/AI 工程师** | 模型选型理由 + AUC/KS + 业务收益双量化 |
| **测试工程师** | 测试金字塔 + 自动化覆盖率 + CI/CD 集成 |
| **设计师** | 全链路设计思维(NPS/转化率/效率) |
| **运营/市场** | 增长模型 + 渠道策略 + ROI 复盘 |

- **JD 配对优化**：选中目标 JD 后，AI 自动优先强化匹配关键词
- **参考简历风格**：导入优秀简历作为风格范本，学习其句式和量化密度
- **岗位方向自动检测**：从求职画像中读取目标岗位，自动匹配最佳写作模版
- **偏好学习**：记录 accept/reject 偏好，持续优化输出风格

### 🧠 Agent 多智能体架构

- **5 个专项 Agent**：简历(Resume)、评估(Evaluate)、面试(Interview)、画像(Profile)、通用(General)
- **意图识别路由**：自然语言输入自动分发到对应 Agent
- **知识按需注入**：每个 Agent 只加载所需知识（薪资基准、公司面试风格、JD 信号词、角色写作指南）
- **工具调用体系**：40+ API 端点，覆盖查询和行动两类操作

### 📊 JD 评估引擎

- 六维评分体系（A-F），含合法性检测
- JD 信号词检测（加班文化、稳定性、薪酬暗示等）
- 支持粘贴文本/URL 抓取/截图 OCR 三种输入方式
- 评估报告支持流式输出，边生成边查看
- 报告历史管理，支持搜索和筛选

## 快速开始

```bash
# 1. 安装依赖
cd frontend && npm install

# 2. 配置 API Key
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY

# 3. 启动开发服务器
npm run dev

# 4. 打开浏览器访问 http://localhost:3000
```

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion |
| **AI 模型** | DeepSeek V4 Pro（主力）, DeepSeek V4 Flash（轻量任务） |
| **数据库** | SQLite (better-sqlite3) — 服务端持久化 |
| **PDF 生成** | Playwright + HTML 模板 |
| **Agent 运行时** | Claude Code CLI + 自定义 Agent Loop |

## 项目结构

```
zhiyuan/
├── frontend/                    # Next.js 前端应用
│   ├── src/
│   │   ├── app/
│   │   │   ├── agent/           # Agent 对话页
│   │   │   ├── cv/              # 简历优化 + 编辑页
│   │   │   ├── evaluate/        # JD 评估页
│   │   │   ├── tracker/         # 投递追踪页
│   │   │   ├── interview/       # 面试准备页
│   │   │   ├── compare/         # Offer 对比页
│   │   │   ├── discover/        # 职位发现页
│   │   │   ├── explore/         # 探索对话页
│   │   │   ├── profile/         # 求职画像页
│   │   │   ├── settings/        # 个人设置页
│   │   │   ├── analytics/       # 数据分析页
│   │   │   └── api/             # 40+ API 路由
│   │   ├── components/          # 共享 UI 组件
│   │   └── lib/                 # 核心库
│   │       ├── agent/           # Agent 系统（注册/编排/知识/工具）
│   │       ├── judge-engine.ts  # 简历优化 Prompt 流水线
│   │       └── server-db.ts     # SQLite 数据层
├── modes/                       # AI 提示词模式（zh/ 中文模式）
├── config/                      # 用户配置
├── templates/                   # CV HTML 模板
├── data/                        # 应用数据（SQLite）
├── reports/                     # 评估报告
└── openspec/                    # OpenSpec 设计文档
```

## 免责声明

筝筝纸鸢是本地开源工具，不是托管服务。

- **数据由你掌控。** 你的简历、联系方式和个人数据保留在你的设备上，直接发送给你选择的 AI 提供商（DeepSeek）。
- **AI 输出需要人工审核。** 提交前务必核查 AI 生成内容的准确性。
- **不提供任何保证。** 评估结果是建议，不是绝对判定。详见 [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md)。
- 依据 [MIT License](LICENSE) 开源。
