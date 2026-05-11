## Context

项目从开源 career-ops fork 而来，当前包含大量与国产求职无关的文件。本项目仅面向中国大陆求职市场，使用 DeepSeek 作为 AI 后端，BOSS直聘/拉勾/脉脉等作为招聘渠道。清理无关内容可降低维护负担，补全中文模式可覆盖完整求职流程。

## Goals / Non-Goals

**Goals:**
- 删除所有外国市场相关的语言模式、平台配置、示例文件
- 删除开源社区治理和 CI/CD 基础设施（非本项目需要）
- 删除不可用的替代 CLI 平台文件（OpenCode/Gemini/Codex）
- 删除西方工具链（LaTeX/Canva MCP/Nix）
- 修改保留文件中的外部链接和品牌引用
- 新建 7 个缺失的中文模式文件

**Non-Goals:**
- 不修改 `frontend/` 目录（已完成品牌化）
- 不删除仍可用的脚本工具（merge-tracker, verify-pipeline, dedup-tracker, generate-pdf 等）
- 不动英文默认 `modes/` 文件（保留作为 AI 系统参考提示词）
- 不创建中文 LaTeX 模式（中文简历用 HTML/Word）

## Decisions

### 英文 modes/ 保留为参考
默认 `modes/` 下的英文模式文件（oferta.md, apply.md, deep.md 等）保留不动。原因是：
1. AI API 调用的系统提示词可以使用英文内容作为参考上下文
2. 删除它们可能破坏现有的 evaluate API（仍在引用这些文件）
3. 中文模式 (`modes/zh/`) 是用户可见层，英文模式是系统层

### 分阶段清理
Phase A（删除）和 Phase B（新建中文模式）可以独立进行。Phase A 是纯文件删除 + 内容修改，Phase B 是纯新建文件。Phase A 先行可以减少项目噪音。

### 清理方式：直接删除
不创建备份目录，直接 `rm -rf`。Git 历史保留了所有内容，如需恢复可从 git 历史找回。

### 中文模式内容：从英文模式翻译+本土化
新建的中文模式文件不是简单翻译，而是：
1. 参考英文模式的提示词结构
2. 替换为中国市场特定的数据源、平台、术语、规范
3. 使用 `modes/zh/_shared.md` 中已有的中国特定词汇（五险一金、税前/税后等）

## Risks / Trade-offs

- [删除字体文件后 PDF 生成可能缺少中文字体] → 目前 fonts/ 只有拉丁字体，中文 PDF 生成需要单独添加 CJK 字体（非本 change 范围）
- [dashboard/ Go 应用可能无法编译] → dashboard 引用 santifer import 路径，但保留不动由用户决定
- [删除 update-system.mjs 后无法跟踪上游更新] → 本项目为独立 fork，不需要跟踪上游

## Open Questions

- 中文模式文件是否应完全重写，还是从英文模式翻译+适配？（建议：翻译+适配，保留提示词结构）
- `dashboard/` Go 应用是否需要修改 import 路径？（建议：本 change 不处理，用户决定保留或删除）
