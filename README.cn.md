# 纸鸢 Agent (Zhiyuan) — AI 求职助手

[English](README.md) · [文档目录](docs/README.md) · [版本记录](src/app/changelog/release-notes.ts)

![Version](https://img.shields.io/badge/release-0.13.2-b74432)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-61dafb)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169e1)
![License](https://img.shields.io/badge/license-MIT-blue)

**纸鸢 Agent** 是面向中国求职市场、支持自行部署的 AI 求职工作台，把职位评估、简历打磨、模拟面试、投递追踪、Offer 对比和职业记忆放在同一个工作流里。旧仓库名为“筝筝纸鸢”，产品界面统一使用“纸鸢 Agent”。

从“今日手账”开始，把已保存的机会转化为当天的行动：准备面试、跟进投递，或推进已经评估的 JD。

## 当前发布：0.13.2

**2026 年 10 月 7 日（北京时间）**上线的生产版本为 `0.13.2`。GitHub 默认主干是 `master`，应用版本以 `VERSION` 和 `package.json` 为准。推送代码与生产部署是两个独立操作。

| 版本 | 主要变化 |
| --- | --- |
| 0.13.2 | 今日手账视觉升级：深色纸鸢舞台、两张手账插画、节点式机会旅程。 |
| 0.13.1 | 今日焦点、按优先级排列的行动队列、求职进展摘要、响应式布局，以及加载、错误与空态。 |
| 0.13.0 | MiMo 语音输入与朗读、简历事实门禁、面试评分锚定与题库、薪资证据、Agent 运行追踪。 |

应用内 `/changelog` 可选择历史版本查看详细更新；源码记录见 [release-notes.ts](src/app/changelog/release-notes.ts)。规划文档中的未来里程碑编号不代表对应版本已经上线。

## 功能地图

| 板块 | 入口 | 能做什么 |
| --- | --- | --- |
| 今日手账 | `/` | 汇总面试、跟进和已评估机会，展示阶段数量、行业与目标企业动态。 |
| Agent 对话 | `/agent` | 自然语言安排任务，查看旅程栏、执行进度、审批卡与独立分析台。 |
| 简历工作台 | `/cv` | 导入、编辑、优化、版本比较、ATS 检查与 PDF 导出。 |
| JD 评估 | `/evaluate`、`/evaluate/jds`、`/evaluate/reports` | 接收文本、链接或截图，保存职位与结构化评估报告。 |
| 投递追踪 | `/tracker` | 管理投递状态、跟进与面试安排。 |
| 面试教练 | `/interview` | 围绕目标 JD 和简历练习问题、接受追问，查看有依据的评分与复盘。 |
| Offer 决策 | `/compare` | 单 Offer 评估与多 Offer 对比，分析薪资、福利、风险和谈判空间。 |
| 职位发现 | `/discover` | 扫描配置的来源、去重，并查看发现任务与岗位精选状态。 |
| 求职画像 | `/profile` | 查看技能、偏好、差距与画像演化。 |
| 个人记忆 | `/memory` | 查看和治理个人职业记忆。 |
| 分析与探索 | `/analytics`、`/explore` | 回顾求职数据，探索职业问题。 |
| 设置与版本 | `/settings`、`/changelog` | 配置偏好并查看历史更新。 |
| 管理后台 | `/admin/*` | 按角色权限管理用户审批、安全事件、团队记忆、Agent 运行、追踪与评审证据。 |

### Agent 执行与工具治理

- 系统编排 Agent 协调简历、评估、面试、画像、Offer 和通用 Agent。
- Web 接收任务，独立 Worker 基于 PostgreSQL 执行，并作为持久化对话记录的写入方。
- Run 保存事件、检查点、工具尝试、预算与恢复状态；关闭浏览器不改变任务执行归属。
- 工具声明副作用、允许的任务与 Agent、确认要求、读回要求和成功条件；敏感写入走审批流程。
- 截图先区分 JD、Offer、简历或无关内容，再进入相应工作流。
- 生产追踪保存执行元数据，用于排错与成本观察。详情见 [Agent 系统规格](docs/agent-system-specs/README.md)。

### 简历质量与职业记忆

- 支持岗位写作指导、目标 JD 匹配、参考简历风格，以及多种优化操作和改写强度。
- 文本 PDF 本地提取，DOCX 使用 Mammoth；扫描版或不可读 PDF 可配置独立 MinerU，图片使用 DeepSeek 识图。
- 生成简历产物经过事实门禁；缺失的量化信息需要用户补充依据，不应编造成果。
- 保存优秀参考简历需要明确岗位分类；团队共享需管理员批准后才可供其他用户检索。
- 分层记忆管理会话、证据、事实与画像，支持个人治理、限定范围清除和检索权限控制。

### 面试、语音与决策支持

- 面试会话绑定 JD 与简历，支持题库练习、有边界的追问、带证据的评分与复盘。
- MiMo ASR 把录音转为文字，MiMo TTS 在 Agent 会话中逐句朗读助手回复；回复内容仍由 DeepSeek 生成。
- 当前语音采用回合制，可手动停止播放；连续流式识别和自动打断属于后续升级。
- JD 报告覆盖 A–G 分析；Offer 报告保留信息缺口、风险、谈判要点与薪资假设。
- 薪资基准与反馈保留来源或证据信息；评分与基准用于辅助决策，需要人工核查。

### 首页美术资源

`0.13.2` 今日手账接入三张插画，并使用品牌配色、叠层构图与微动效，遵循系统减少动态效果的偏好。下面是美术资源，不是页面截图：

| 资源 | 用途 |
| --- | --- |
| [paper-kite-hero.png](public/art/paper-kite-hero.png) | 今日焦点的纸鸢主视觉。 |
| [journal-empty.png](public/art/journal-empty.png) | 翻开的手账插画。 |
| [journal-complete.png](public/art/journal-complete.png) | 完成后的手账插画。 |

## 架构与技术栈

```mermaid
flowchart LR
    Browser[浏览器工作台] --> Web[Next.js Web / API]
    Web --> PG[(PostgreSQL + pgvector)]
    Web --> Redis[(认证 Redis)]
    PG <--> Worker[持久化 Agent Worker]
    Worker --> DeepSeek[DeepSeek 文本 / 识图]
    Worker --> MCP[受治理的 MCP 工具]
    Web --> MiMo[MiMo ASR / TTS]
    Web --> Files[共享产物目录]
    Worker --> Files
```

| 层级 | 技术 |
| --- | --- |
| 界面 | Next.js 16.4、React 19、TypeScript、Tailwind CSS 4、Framer Motion、assistant-ui、Radix UI、Recharts。 |
| 执行 | 自定义持久化 Agent 运行时、Task Program、事件与检查点账本、独立 Node.js Worker。 |
| 主模型 | DeepSeek `deepseek-flash`，用于文本、评估与图片识别。 |
| 语音 | 小米 MiMo `mimo-v2.5-asr` / `mimo-v2.5-tts`，默认音色“白桦”。 |
| 权威存储 | PostgreSQL + pgvector；Redis 承担认证限流与安全功能。 |
| 兼容存储 | SQLite 本地兼容、归档与迁移源；部分本地数据使用浏览器 IndexedDB。 |
| 记忆 | PostgreSQL 事实与证据存储、Mastra 会话记忆、可选 OpenAI 兼容向量服务。 |
| 导入与导出 | pdf-parse、Mammoth、可选 MinerU、Playwright Chromium、统一 PDF/导出服务。 |
| 验证 | Vitest、TypeScript、确定性 Agent/能力 eval、Promptfoo、可选真实调用与视觉检查。 |
| 生产部署 | Nginx HTTPS、PM2 Web + Worker、独立 release 目录、共享密钥与产物、原子切换链接。 |

## 本地启动

### 环境要求

- 推荐 **Node.js 24 LTS + npm**，与 CI 一致；部分验证依赖要求至少 Node.js 22.22。
- PostgreSQL 与 `vector` 扩展，以及登录和安全功能所需的 Redis。
- AI 功能需要 DeepSeek API Key；语音功能另需 MiMo Key。
- PDF 渲染和浏览器扫描需要 Playwright Chromium；扫描文档提取可选装 MinerU。

SQLite 可用于兼容和部分本地数据路径，但不能替代当前持久化 Agent 所需的 PostgreSQL。只运行 `npm run dev` 不足以执行 Agent 任务。

### 1. 安装与配置

```bash
git clone https://github.com/weiz98417-crypto/zhiyuan-job-assistant.git
cd zhiyuan-job-assistant
npm ci
cp .env.example .env.local
npm run install:playwright
```

PowerShell 中使用 `Copy-Item .env.example .env.local` 复制文件。所有 npm 命令都在仓库根目录执行，当前项目没有 `frontend/` 子目录。

编辑 `.env.local`，填入你自己的本地凭据：

```dotenv
DEEPSEEK_API_KEY=replace_with_your_key
DEEPSEEK_MODEL=deepseek-flash
JWT_SECRET=replace_with_an_independent_random_secret_of_at_least_32_characters
DB_DRIVER=postgres
DATABASE_URL=postgresql://zhiyuan_app:replace_with_local_password@127.0.0.1:55432/zhiyuan_job_assistant
REDIS_URL=redis://:replace_with_local_password@127.0.0.1:6380/0
AGENT_RUNTIME_MODE=worker_all
AGENT_ARTIFACT_DIR=./data/agent-artifacts
```

可使用已有的本地 PostgreSQL/Redis，也可按 [认证运行手册](docs/AUTH_SECURITY_RUNBOOK.md) 准备 Docker secrets 和服务。仓库的 [Compose 配置](deploy/auth-security/docker-compose.yml) 提供 pgvector/PostgreSQL 16 与 Redis 7.4。

### 2. 初始化本地数据库与 Worker

新建本地数据库后，使用与上述配置相同的数据库地址，通过 `psql` 应用 schema：

```bash
psql --dbname="<your-local-database-url>" -v ON_ERROR_STOP=1 -f src/lib/postgres-schema.sql
mkdir -p data/agent-artifacts
npm run check:postgres
npm run build:worker
npm run check:agent-runtime
```

PowerShell 创建目录使用 `New-Item -ItemType Directory -Force data/agent-artifacts`。

已有数据库应先按迁移手册备份和核验，再切换运行时。运行预检会检查 schema、记忆门禁、模型配置、Worker 产物与可写的产物目录。

### 3. 启动两个进程

```bash
# 终端一：Web
npm run dev
```

```bash
# 终端二：Agent Worker，同样从仓库根目录启动
node --enable-source-maps build/agent-worker.mjs
```

访问 [http://localhost:3000](http://localhost:3000)。修改 Worker 源码后需要重新构建并重启。Windows 的 `start-lan.ps1` 可启动局域网 Web，Worker 仍需另行运行。

在 `/register` 注册。如果没有有效的特权账号，首次注册成为启用的 `superadmin`；后续账号需在 `/admin/users` 审批。

## 可选集成

| 环境变量 | 作用 |
| --- | --- |
| `MIMO_API_KEY`、`MIMO_BASE_URL`、`MIMO_TTS_MODEL`、`MIMO_ASR_MODEL`、`MIMO_TTS_VOICE` | 语音输入和朗读。未配置 Key 时不显示语音入口；麦克风需要 HTTPS 或 localhost，以及浏览器授权。 |
| `MEMORY_EMBEDDING_PROVIDER`、`MEMORY_EMBEDDING_API_URL`、`MEMORY_EMBEDDING_API_KEY`、`MEMORY_EMBEDDING_MODEL`、`MEMORY_EMBEDDING_DIMENSION` | OpenAI 兼容向量服务，可配置 DashScope `text-embedding-v4`。 |
| `SERPAPI_API_KEY`、`BAIDU_MAP_API_KEY` | 可选搜索与地图 MCP 服务，配置见 `mcp.config.json`。 |
| `MINERU_EXECUTABLE`、`MINERU_MODEL_SOURCE`、`MINERU_TOOLS_CONFIG_JSON`、`MINERU_EXTRACTION_TIMEOUT_MS` | 本地扫描文档提取，详见 [环境配置](docs/SETUP.md)。 |
| `APP_ORIGIN`、`AUTH_COOKIE_SECURE`、`CSRF_SECRET`、`AUTH_RATE_LIMIT_SECRET`、`APP_BIND_HOST` | 生产来源、Cookie、请求校验、限流与监听地址，详见安全运行手册。 |

供应商凭据只放服务端环境文件，不放浏览器可见的 `NEXT_PUBLIC_*` 变量。生产密钥使用独立随机值，Web 与 Worker 共用经过核验的生产配置。

## 验证与发布门禁

| 命令 | 验证范围 |
| --- | --- |
| `npm test` | 全量 Vitest 测试。 |
| `npx tsc --noEmit` | 类型检查。 |
| `npm run lint` | ESLint。 |
| `npm run build:production` | 同时构建 Web 与 Worker。 |
| `npm run eval:agent-pr` | Agent 投影、旅程与 eval 契约的确定性验证。 |
| `npm run eval:memory` | 确定性记忆 eval。 |
| `npm run verify:capability-2026-10b` | 知识与提示词门禁、能力 eval。 |
| `npm run eval:redteam:build` 后执行 `npm run eval:redteam:core` | CI 使用的确定性红队检查。 |
| `npm run check:agent-runtime` | 针对配置数据库的运行就绪检查。 |
| `npm run security:preflight` | 生产认证与部署拓扑检查。 |

可选真实调用包括 `npm run smoke:embedding`、`npm run smoke:voice`、Agent staging/release eval 和 `npm run verify:resume-visual`，需要相应的凭据和服务，视觉检查还需要 Chromium。语音冒烟脚本读取进程环境或 `.env`；若使用 `.env.local`，运行 `node -r dotenv/config scripts/smoke-voice-mimo.mjs dotenv_config_path=.env.local`。跳过冒烟不能视为真实调用验证通过。

数据库集成和故障注入测试应使用独立可丢弃数据库。[CI](.github/workflows/capability-evals.yml) 在 `master` / `dev` 推送和 PR 时执行核心红队与能力 eval，不负责自动部署。

## 生产部署与回滚

当前部署使用 Nginx + PM2 管理的 `zhiyuan-web`、`zhiyuan-agent-worker`，配套 PostgreSQL/pgvector 与认证 Redis。Web 监听 `127.0.0.1:3100`，现有部署的公开入口使用 HTTPS `38084` 端口。

```text
/root/zhiyuan-job-assistant/
  current -> releases/<release-id>
  releases/<release-id>/
  shared/secrets/production.env
  shared/agent-artifacts/
```

将已提交源码归档到新的 release 目录，把该目录的 `.env.local` 链接至共享生产环境文件，准备必要的增量 schema，再调用候选版本自己的发布脚本：

```bash
bash /root/zhiyuan-job-assistant/releases/<release-id>/deploy/agent-runtime/release.sh \
  /root/zhiyuan-job-assistant /root/zhiyuan-job-assistant/releases/<release-id>
```

脚本会安装依赖、构建 Web/Worker、备份 PostgreSQL、运行预检，在切换时暂停 Worker 接收新任务，更新 `current`，重载 PM2 并检查 `/login`。脚本核验 schema，不自动执行 schema 迁移。部署后还应核实两个进程、登录后的任务执行、静态资源和应用版本。

```bash
bash /root/zhiyuan-job-assistant/current/deploy/agent-runtime/rollback.sh \
  /root/zhiyuan-job-assistant /root/zhiyuan-job-assistant/releases/<previous-release>
```

应用回滚保留数据库和共享产物。完整操作和共享环境约定见 [Agent 部署手册](deploy/agent-runtime/README.md)。

## 数据迁移

SQLite 保留为迁移源与兼容/归档路径。迁移历史数据与初始化新 PostgreSQL 数据库是独立操作：

```bash
npm run migrate:postgres -- --dry-run --default-owner <user-id> --report reports/postgres-migration-dry-run.md
npm run migrate:postgres -- --apply --default-owner <user-id> --report reports/postgres-migration-apply.md
npm run check:postgres-migration -- --default-owner <user-id> --report reports/postgres-migration-verify.md
npm run check:postgres-cutover
```

执行前将 `<user-id>` 替换为真实的已有用户 ID，核对源库和目标库并备份。记忆账本迁移另有备份证据与治理要求，详见 [PostgreSQL 迁移](docs/POSTGRES_MIGRATION.md) 和 [记忆迁移发布门禁](docs/agent-system-specs/13-memory-migration-and-release-gates.md)。

## 目录结构

```text
src/app/                 页面、认证、管理后台与 API
src/components/home/     今日手账组件
src/components/agent/    对话、审批、旅程与语音界面
src/components/design/   通用设计原语
src/lib/agent/           Agent、工具治理、持久化运行时与投影
src/lib/memory/          记忆准入、检索、治理与清除
src/lib/server/          服务端导入、导出与语音服务
src/lib/home-dashboard.ts 首页行动排序与数据汇总
src/worker/              独立 Agent Worker 入口
src/__tests__/           单元、回归与 eval 测试
public/art/              首页插画
scripts/                 构建、验证、迁移与运维脚本
deploy/                  发布/回滚与认证基础设施
docs/                    架构、运行手册、规格与调研
openspec/                变更提案与实施计划
promptfoo/               红队配置
modes/、templates/       提示词模式与简历模板
```

## 进一步阅读

- [文档目录](docs/README.md)、[架构](docs/ARCHITECTURE.md)、[环境配置](docs/SETUP.md)、[脚本说明](docs/SCRIPTS.md)。
- [工具治理](docs/AGENT_TOOL_GOVERNANCE.md)、[Agent 系统规格](docs/agent-system-specs/README.md)、[记忆 eval](docs/MEMORY_EVALS.md)。
- [今日手账调研](docs/research/today-journal-homepage-research-2026-10-07.md)、[首页升级方案](docs/review/today-journal-homepage-upgrade-plan-2026-10-07.md)。
- [项目课程体系](docs/course-system/README.md)、[功能 eval 规格](docs/feature-system/evals/README.md)。

## 致谢与许可

项目起源于 [Ben Gou](https://github.com/bengous) 的开源项目 [career-ops](https://github.com/bengous/career-ops)。纸鸢在其基础上扩展了面向中国求职市场的多用户 Web 工作台、对话 Agent、持久化执行和受治理的记忆。第三方声明见 [NOTICE](NOTICE)。

项目采用 [MIT 许可](LICENSE)。AI 功能使用的简历、Offer、语音等内容会发送给所配置的供应商；自行部署控制应用存储，不代表模型调用离线运行。向雇主使用生成内容前，请核查其中的事实。详见 [免责声明](LEGAL_DISCLAIMER.md)。
