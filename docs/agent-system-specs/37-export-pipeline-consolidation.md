# Spec 37: Export Pipeline Consolidation(导出链路收敛,B3)

Target label: `ready-for-agent`
Depends on: 无;先于 spec 38(视觉反测需要单一可信渲染出口);批次 0.22.0

## Problem

简历到 PDF 的链路上同时养着**三套实现、两个浏览器引擎**:

- 在用:`src/app/api/generate-cv-pdf/route.ts`(Playwright chromium,`:30-58` findChromiumExecutable、`:79` launch、`:94` page.pdf),命名反而是旧的;
- 死路由:`src/app/api/cv/generate-pdf/route.ts`(全文件 94 行,Puppeteer(:2)+ `templates/cv-template.html`(:7),前端已不调用),命名反而是新的;
- 脚本:根 `generate-pdf.mjs:14`(文件头注释说 Playwright,实际 import puppeteer),且 **package.json:22 挂着 `"pdf": "node generate-pdf.mjs"` 的 npm script**;
- md→HTML 三套:`server-markdown.ts`(marked+sanitize)、`api/cv/generate-pdf/route.ts:9-24` 手写正则、`api/export-file/route.ts` 另一份(:51 调用、:153-161 定义);
- `findChromiumExecutable` 复制两份(`api/generate-cv-pdf/route.ts:30-58` 与 `src/lib/server/report-pdf-service.ts:77-87`);
- `verify-desktop-layout.mjs:5` 截图目录硬编码仓库外盘符(`E:/求职项目/...`),换机即失效。

新同事或下一个 agent 接手必然踩错(命名互相反着)。spec 38 要在渲染出口上做机器反测,出口必须先收敛成一条。

## Solution

1. 删死路由 `api/cv/generate-pdf` 与 **puppeteer 依赖**;删根 `generate-pdf.mjs` **连同 package.json:22 的 `pdf` npm script**。
2. md→HTML 收口到 `server-markdown.ts` 单一实现;`export-file` 与 PDF 链路改调它。
3. `findChromiumExecutable` 收成一份(`src/lib/server/`),两处改引用。
4. `verify-desktop-layout.mjs` 截图目录改仓库内相对路径(进 `.gitignore`),删除硬编码盘符。
5. 命名纠偏:保留在用的 `api/generate-cv-pdf`;若目录语义混乱,加 README 注释说明「generate-cv-pdf 是唯一在用实现」,不做破坏性重命名路由。

## User Stories

- 无用户可见变化;导出产物(PDF)逐字节级等价(允许元数据差异,正文渲染不变)。

## Implementation Decisions

- 全部是删和收口,零新逻辑(deletion test:删完复杂度消失而不是转移,才做)。
- 卸载 puppeteer 前先删干净引用:`package.json:22` 的 `pdf` script、`generate-pdf.mjs` 本体、`docs/` 内提及处(注:根目录无 SCRIPTS.md,已核实)。

## Testing Decisions

- PDF 产物对比:改前改后各生成同一简历样本 PDF,人工+文本层 diff(pdf-parse 抽文本比对)确认等价。
- 全测试绿;`grep` 契约:仓库内(puppeteer 引用=0、mdToHtml 手写实现=0)。

## Out of Scope

- PDF 模板样式改动(spec 38 的视觉反测管);paged.js 分页增强(1-2 页简历暂不需要);`export-artifact-service` 的 md/html/txt/pdf 四格式功能不变。

## Further Notes

- 预估半天~一天。完成后 spec 38 的截图出口唯一且可信。
