# Design: Career-Ops Frontend

## Context

Career-Ops 当前是纯 CLI/AI 对话系统。前端需要将所有核心功能封装为独立的 Web 应用，同时保持与 CLI 系统的数据兼容性。用户数据存储在本地的 Markdown/TSV/YAML 文件中，前端需要直接读写这些格式。

目标用户是中国 AI 行业求职者，使用场景跨越数周甚至数月。前端必须给他们"翻开手帐"的感觉，而非操作一个工具。

## Goals / Non-Goals

**Goals:**
- 提供 9 个功能模块的完整 Web 界面（首页、评估、追踪、Offer对比、简历优化、面试准备、数据分析、职位发现、设置）
- Local-first：默认数据存在浏览器 IndexedDB，无需后端
- 与 CLI 系统的数据格式双向兼容（import/export）
- 实现 DESIGN.md 定义的完整设计系统
- 支持中英文界面
- 移动端响应式

**Non-Goals:**
- 不替代 CLI 系统——前端是新增层，CLI 继续存在
- 不连接真实 AI API——MVP 阶段使用 mock/simulated 数据，AI 能力后续接入
- 不做用户认证/多设备同步——local-first，后续可加
- 不做国际化（i18n 完整方案）——仅中英文切换

## Decisions

### Decision 1: Next.js App Router

**选择**: Next.js 14+ App Router（非 Pages Router）

**理由**:
- React Server Components 可减少客户端 JS 体积
- 基于文件的路由系统，9 个模块各一个 route group
- 后续可无缝升级为全栈（API Routes 连接 AI 后端）
- Vercel 部署开箱即用

**替代方案**: 纯 Vite + React SPA。更简单但缺失路由约定和未来的 API 能力。

### Decision 2: Local-First 数据层

**选择**: IndexedDB（通过 Dexie.js）作为主存储，兼容 Markdown/TSV/YAML 导入导出

**理由**:
- IndexedDB 支持大文件存储（报告全文）
- Dexie.js 提供简洁的 Promise API，避免裸 IndexedDB 回调地狱
- 导入导出层将 CLI 格式（.md/.tsv）与前端格式双向转换
- 后续升级为云端同步时，IndexedDB 天然适合作为离线优先层

**数据模型映射**:
```
applications.md  → Dexie Table: applications
reports/*.md     → Dexie Table: reports (关联 applicationId)
data/pipeline.md → Dexie Table: pipelineUrls
config/profile.yml → Dexie Table: settings (单条)
story-bank.md    → Dexie Table: stories
```

### Decision 3: CSS 架构

**选择**: Tailwind CSS + CSS Variables（OKLCH 色彩空间）

**理由**:
- Tailwind 的 utility-first 模式适合快速构建定制设计（不依赖组件库默认样式）
- CSS Variables 定义设计 token（颜色、圆角、阴影、间距），可在 Tailwind config 中引用
- OKLCH 色彩通过 CSS Variables 定义，支持动态主题切换
- 禁止使用 DaisyUI / shadcn / Radix 等组件库的默认样式——所有组件手写以符合设计系统

**Tailwind Config 约定**:
```js
colors: {
  'warm-amber': 'oklch(var(--color-primary) / <alpha-value>)',
  'cream-paper': 'oklch(var(--color-bg) / <alpha-value>)',
  'warm-ink': 'oklch(var(--color-text) / <alpha-value>)',
  'soft-ash': 'oklch(var(--color-muted) / <alpha-value>)',
}
```

### Decision 4: 路由结构

**选择**: Route Groups 按功能模块组织

```
app/
├── (home)/          # 首页/今日手帐
│   └── page.tsx
├── (evaluate)/      # JD 评估
│   ├── page.tsx          # 评估入口
│   ├── [id]/page.tsx     # 报告详情
│   └── history/page.tsx  # 评估历史
├── (tracker)/       # 投递追踪
│   └── page.tsx
├── (compare)/       # Offer 对比
│   └── page.tsx
├── (cv)/            # 简历优化
│   └── page.tsx
├── (interview)/     # 面试准备
│   ├── page.tsx          # 面试概览
│   ├── stories/page.tsx  # 故事库
│   └── [company]/page.tsx # 公司研究
├── (analytics)/     # 数据分析
│   └── page.tsx
├── (discover)/      # 职位发现
│   └── page.tsx
├── (settings)/      # 设置
│   └── page.tsx
├── layout.tsx       # Root Layout (App Shell)
├── globals.css      # 设计 token + Tailwind
└── providers.tsx    # 数据层 Provider
```

### Decision 5: 组件组织

**选择**: 按功能模块 + 共享设计系统

```
src/
├── components/
│   ├── shell/          # App Shell: Nav, Layout, PageTransition
│   ├── design/         # 设计系统组件: WarmButton, Paper, HandwritingTitle, ScoreBadge...
│   ├── evaluation/     # 评估相关组件
│   ├── tracker/        # 追踪相关组件
│   ├── comparison/     # 对比相关组件
│   ├── cv/             # 简历相关组件
│   ├── interview/      # 面试相关组件
│   ├── analytics/      # 分析相关组件
│   ├── discovery/      # 发现相关组件
│   └── settings/       # 设置相关组件
├── lib/
│   ├── db.ts           # Dexie 数据库定义
│   ├── parsers.ts      # Markdown/TSV/YAML 解析器
│   ├── exporters.ts    # 导出工具
│   └── ai.ts           # AI API 调用（后续接入）
├── hooks/              # 共享 hooks
└── types/              # TypeScript 类型定义
```

### Decision 6: 导航设计

**选择**: 桌面端左侧垂直导航（手帐的"目录页"），移动端底部 Tab Bar

**理由**:
- DESIGN.md 要求避免传统企业软件的顶部导航栏
- 左侧导航像翻开手帐的目录/索引页
- 9 个模块在左侧以中文标签 + 简约图标呈现
- 当前页面以暖色圆角色块高亮，像手帐的书签

### Decision 7: 动画策略

**选择**: Framer Motion，编排过的入场动画

**动画约定**:
- 页面切换：stagger children，依次淡入+轻微 Y 轴位移（像被轻轻放在桌面上）
- 评分数字：count-up 动画（数字滚动的温暖版本）
- 卡片 hover：轻微 Y 轴上浮 + 暖色背景微亮
- 加载状态：手写笔迹逐渐出现
- 不弹跳、不弹跳、不弹跳

### Decision 8: 数据兼容性桥接

前端不调用 CLI 脚本（.mjs），而是实现兼容的解析/导出层：

| CLI 数据 | 前端处理 |
|----------|---------|
| `data/applications.md` | `parsers.ts` 解析 Markdown 表格 → IndexedDB |
| `reports/*.md` | `parsers.ts` 解析报告 Markdown → IndexedDB |
| `config/profile.yml` | `parsers.ts` 解析 YAML → IndexedDB settings |
| `data/pipeline.md` | `parsers.ts` 解析 checklist → IndexedDB |
| `interview-prep/story-bank.md` | `parsers.ts` 解析故事 → IndexedDB |
| 导出 | `exporters.ts` 反向转换 → .md/.yml 文件 |

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| IndexedDB 数据丢失（浏览器清除） | 提供定期导出提醒，一键备份 |
| AI 评估无后端无法工作 | MVP 使用模拟数据展示 UI，AI 能力后续接入 API Routes |
| 设计系统过于定制化，开发效率低 | 先构建 `design/` 组件库，9个模块复用 |
| 移动端体验受限 | 优先桌面端，移动端做到可用（非核心场景） |
| 与 CLI 系统数据格式漂移 | 导入导出层有格式校验，CI 确保兼容 |
