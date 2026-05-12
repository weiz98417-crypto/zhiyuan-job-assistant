## Why

现有 `generate-pdf.mjs` 依赖 Playwright，而 Playwright 是 Claude Code 环境提供的。脱离 Claude Code 后无法单独运行。用户投递简历的最后一步——生成 PDF——卡住了。

## What Changes

- `generate-pdf.mjs` 从 Playwright 迁移到 Puppeteer（Chromium 内核相同，API 兼容）
- 新建 `/api/cv/generate-pdf` 端点，前端一键生成 PDF
- `package.json` 中 `playwright` 替换为 `puppeteer`

## Capabilities

- `pdf-generation-api`: `/api/cv/generate-pdf` 端点，接收 CV 数据 → 填充 HTML 模板 → Puppeteer 渲染 → 返回 PDF 二进制

## Impact

- **修改**: `generate-pdf.mjs`（playwright → puppeteer）
- **新建**: `frontend/src/app/api/cv/generate-pdf/route.ts`
- **修改**: `package.json`（依赖替换）
