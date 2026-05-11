## Why

项目是从开源项目 career-ops fork 而来，包含大量与国产求职场景无关的内容：5 种外语模式、3 个替代 CLI 平台的命令文件、GitHub 开源社区治理文件、LaTeX 模板、Canva MCP 集成、西方求职平台配置等。这些内容增加项目噪音，且 `modes/zh/` 缺少 7 个高价值中文模式。清理无关内容并补全中文模式，让项目聚焦国产求职场景。

## What Changes

### Phase A: 清理外国市场无关内容

- 删除 5 个外语模式目录：`modes/de/`, `modes/fr/`, `modes/ja/`, `modes/pt/`, `modes/ru/`
- 删除替代 CLI 平台目录：`.opencode/`, `.gemini/`
- 删除 GitHub 社区治理文件：`CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `CONTRIBUTORS.md`, `CITATION.cff`, `CHANGELOG.md`
- 删除 CI/CD 配置：`.github/` 目录, `renovate.json`, `.release-please-manifest.json`, `.coderabbit.yaml`
- 删除 6 个外语 README 翻译
- 删除 LaTeX 相关：`templates/cv-template.tex`, `generate-latex.mjs`
- 删除其他 CLI 平台文件：`AGENTS.md`, `GEMINI.md`, `gemini-eval.mjs`
- 删除 Nix 环境：`flake.nix`, `flake.lock`, `.envrc`
- 删除更新系统：`update-system.mjs`, `VERSION`
- 删除英文示例：`examples/` 目录
- 删除英文配置：`config/profile.example.yml`, `templates/portals.example.yml`
- 删除不相关的英文模式：`modes/contacto.md`, `modes/latex.md`, `modes/_profile.template.md`
- 删除文档图片：`docs/demo.gif`, `docs/hero-banner.jpg`, `docs/og-image.jpg`, `docs/roadmap-phases.jpg`, `docs/vision-banner.jpg`, `docs/CODEX.md`
- 修改保留文件中的外链和品牌引用：CLAUDE.md, package.json, `.claude-plugin/`, `.env.example`, `scan.mjs`, `doctor.mjs`, `README.cn.md`, `config/profile.example.zh.yml`, `modes/_shared.md`, `modes/pdf.md`, `LEGAL_DISCLAIMER.md`

### Phase B: 补全中文模式 `modes/zh/`

- 新建 `modes/zh/interview-prep.md` — 中国面试准备（适配中文面试文化）
- 新建 `modes/zh/deep.md` — 公司深度调研（企查查/天眼查数据源）
- 新建 `modes/zh/apply.md` — 申请助手（BOSS直聘/51job 填表）
- 新建 `modes/zh/tracker.md` — 投递追踪中文版
- 新建 `modes/zh/scan.md` — 国内招聘平台扫描（BOSS直聘/拉勾/脉脉）
- 新建 `modes/zh/followup.md` — 跟进节奏（中国求职市场规范）
- 新建 `modes/zh/ofertas.md` — 多 Offer 薪资对比中文版

## Capabilities

### New Capabilities

- `cleanup-foreign-content`: 删除项目中所有与国产求职无关的文件、目录和引用，包括外语模式、替代 CLI 平台、开源社区治理文件、LaTeX 模板、西方求职配置等
- `zh-interview-prep`: 中文面试准备模式，适配中国面试文化和流程
- `zh-company-research`: 公司深度调研模式，使用企查查/天眼查等国内数据源
- `zh-apply-assistant`: 申请填表助手，适配 BOSS直聘/51job/猎聘等国内平台
- `zh-tracker`: 投递追踪中文版
- `zh-scan`: 国内招聘平台扫描模式（BOSS直聘/拉勾/脉脉）
- `zh-followup`: 跟进节奏管理，适配中国求职市场时间规范
- `zh-offer-compare`: 多 Offer 薪资对比中文版

### Modified Capabilities

<!-- 无已有 spec 被修改 -->

## Impact

- 项目根目录：删除 40+ 个无关文件，释放约 45MB
- `modes/zh/`：新增 7 个模式文件
- `CLAUDE.md`：大量精简，删除外语模式路由、Canva MCP、Gemini/OpenCode 引用
- `package.json`：修改 author/homepage/repository，删除 gemini:eval 脚本
- `frontend/` 目录不受影响（已独立品牌化为筝筝纸鸢）
