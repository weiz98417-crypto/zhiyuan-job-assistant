## ADDED Requirements

### Requirement: 删除所有外语模式目录
系统 SHALL 删除 `modes/de/`, `modes/fr/`, `modes/ja/`, `modes/pt/`, `modes/ru/` 五个非中文语言模式目录及其所有文件。

#### Scenario: 外语模式目录已删除
- **WHEN** 清理完成后
- **THEN** `modes/` 目录下仅保留 `zh/`（中文模式）和英文默认模式文件

### Requirement: 删除替代 CLI 平台文件
系统 SHALL 删除 `.opencode/` 和 `.gemini/` 目录及其所有内容，以及 `AGENTS.md`、`GEMINI.md`、`gemini-eval.mjs`。

#### Scenario: CLI 平台文件已清除
- **WHEN** 清理完成后
- **THEN** 项目中不存在任何 OpenCode、Gemini CLI 或 Codex 相关文件

### Requirement: 删除开源社区治理文件
系统 SHALL 删除 `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `CONTRIBUTORS.md`, `CITATION.cff`, `CHANGELOG.md`, `.github/` 目录, `renovate.json`, `.release-please-manifest.json`, `.coderabbit.yaml`。

#### Scenario: 社区治理文件已清除
- **WHEN** 清理完成后
- **THEN** 项目中不存在 GitHub 开源社区相关的治理和 CI/CD 配置文件

### Requirement: 删除外语 README 翻译
系统 SHALL 删除 `README.es.md`, `README.pt-BR.md`, `README.ko-KR.md`, `README.ja.md`, `README.ru.md`, `README.zh-TW.md`。

#### Scenario: 外语 README 已删除
- **WHEN** 清理完成后
- **THEN** 项目根目录仅保留 `README.md` 和 `README.cn.md`

### Requirement: 删除 LaTeX 和 Nix 相关文件
系统 SHALL 删除 `templates/cv-template.tex`, `generate-latex.mjs`, `flake.nix`, `flake.lock`, `.envrc`, `update-system.mjs`, `VERSION`。

#### Scenario: LaTeX 和 Nix 文件已删除
- **WHEN** 清理完成后
- **THEN** 项目中不存在 LaTeX 模板/编译器、Nix 环境配置和上游更新系统

### Requirement: 删除西方示例和配置
系统 SHALL 删除 `examples/` 目录, `config/profile.example.yml`, `templates/portals.example.yml`, `modes/contacto.md`, `modes/latex.md`, `modes/_profile.template.md`。

#### Scenario: 西方示例和配置已删除
- **WHEN** 清理完成后
- **THEN** 项目中仅保留中文相关的示例和配置

### Requirement: 删除文档图片
系统 SHALL 删除 `docs/demo.gif`, `docs/hero-banner.jpg`, `docs/og-image.jpg`, `docs/roadmap-phases.jpg`, `docs/vision-banner.jpg`, `docs/CODEX.md`。

#### Scenario: 文档图片已删除
- **WHEN** 清理完成后
- **THEN** 释放约 28MB 磁盘空间，`docs/` 目录仅保留文字文档

### Requirement: 修改保留文件中的外链和品牌引用
系统 SHALL 修改以下文件中的外链、品牌和无关引用：
- `CLAUDE.md`：删除外语模式路由说明、Canva MCP 引用、Gemini/OpenCode/Codex 引用、LaTeX 引用、santifer 品牌故事
- `package.json`：更新 author/homepage/repository 字段，删除 `gemini:eval` 脚本
- `.claude-plugin/plugin.json` 和 `marketplace.json`：更新 author/owner
- `.env.example`：替换 Gemini API key 为 DeepSeek API key
- `scan.mjs` 和 `doctor.mjs`：删除 Discord 邀请链接
- `README.cn.md`：删除 Discord 链接
- `config/profile.example.zh.yml`：删除 Canva 配置项
- `modes/_shared.md` 和 `modes/pdf.md`：删除 Canva MCP 相关内容
- `LEGAL_DISCLAIMER.md`：GDPR → PIPL，Anthropic → DeepSeek

#### Scenario: 保留文件已修改
- **WHEN** 清理完成后
- **THEN** 上述文件不包含 Discord 链接、santifer 品牌引用、Canva MCP 引用、Gemini/OpenCode 引用，且 API key 模板指向 DeepSeek
