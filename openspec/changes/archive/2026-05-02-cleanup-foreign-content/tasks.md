## 1. Phase A: 删除外国市场无关文件

### 1.1 外语模式目录
- [x] 1.1.1 删除 `modes/de/` 目录（德语）
- [x] 1.1.2 删除 `modes/fr/` 目录（法语）
- [x] 1.1.3 删除 `modes/ja/` 目录（日语）
- [x] 1.1.4 删除 `modes/pt/` 目录（葡萄牙语）
- [x] 1.1.5 删除 `modes/ru/` 目录（俄语）

### 1.2 替代 CLI 平台文件
- [x] 1.2.1 删除 `.opencode/` 目录
- [x] 1.2.2 删除 `.gemini/` 目录
- [x] 1.2.3 删除 `AGENTS.md`, `GEMINI.md`, `gemini-eval.mjs`

### 1.3 GitHub 开源社区治理文件
- [x] 1.3.1 删除 `.github/` 目录
- [x] 1.3.2 删除 `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `CONTRIBUTORS.md`
- [x] 1.3.3 删除 `CITATION.cff`, `CHANGELOG.md`, `renovate.json`, `.release-please-manifest.json`, `.coderabbit.yaml`

### 1.4 外语 README 翻译
- [x] 1.4.1 删除 `README.es.md`, `README.pt-BR.md`, `README.ko-KR.md`, `README.ja.md`, `README.ru.md`, `README.zh-TW.md`

### 1.5 LaTeX / Nix / 更新系统
- [x] 1.5.1 删除 `templates/cv-template.tex`, `generate-latex.mjs`
- [x] 1.5.2 删除 `flake.nix`, `flake.lock`, `.envrc`
- [x] 1.5.3 删除 `update-system.mjs`, `VERSION`

### 1.6 西方示例和配置
- [x] 1.6.1 删除 `examples/` 目录
- [x] 1.6.2 删除 `config/profile.example.yml`, `templates/portals.example.yml`
- [x] 1.6.3 删除 `modes/contacto.md`, `modes/latex.md`, `modes/_profile.template.md`

### 1.7 文档图片
- [x] 1.7.1 删除 `docs/demo.gif`, `docs/hero-banner.jpg`, `docs/og-image.jpg`, `docs/roadmap-phases.jpg`, `docs/vision-banner.jpg`, `docs/CODEX.md`

### 1.8 修改保留文件中的外链和品牌引用
- [x] 1.8.1 精简 `CLAUDE.md`：删除外语模式路由、Canva MCP、Gemini/OpenCode/Codex/LaTeX 引用、santifer 品牌故事和 Discord 链接
- [x] 1.8.2 更新 `package.json`：修改 author/homepage/repository，删除 `gemini:eval` 脚本
- [x] 1.8.3 更新 `.claude-plugin/plugin.json` 和 `marketplace.json`：修改 author/owner
- [x] 1.8.4 更新 `.env.example`：Gemini → DeepSeek
- [x] 1.8.5 删除 `scan.mjs` 和 `doctor.mjs` 中的 Discord 链接
- [x] 1.8.6 删除 `README.cn.md` 中的 Discord 链接
- [x] 1.8.7 删除 `config/profile.example.zh.yml` 中的 Canva 配置项
- [x] 1.8.8 删除 `modes/_shared.md` 和 `modes/pdf.md` 中的 Canva MCP 内容
- [x] 1.8.9 更新 `LEGAL_DISCLAIMER.md`：GDPR → PIPL，Anthropic → DeepSeek

## 2. Phase B: 新建中文模式文件

- [x] 2.1 创建 `modes/zh/interview-prep.md` — 中国面试准备（群面/技术面/HR面/薪资谈判）
- [x] 2.2 创建 `modes/zh/deep.md` — 公司深度调研（企查查/天眼查/脉脉/IT桔子）
- [x] 2.3 创建 `modes/zh/apply.md` — 申请填表助手（BOSS直聘/拉勾/猎聘/51job）
- [x] 2.4 创建 `modes/zh/tracker.md` — 投递追踪中文版
- [x] 2.5 创建 `modes/zh/scan.md` — 国内招聘平台扫描（BOSS直聘/拉勾/脉脉/猎聘）
- [x] 2.6 创建 `modes/zh/followup.md` — 跟进节奏管理（中文市场规范）
- [x] 2.7 创建 `modes/zh/ofertas.md` — 多 Offer 薪资对比（五险一金/年终奖/税前税后）
