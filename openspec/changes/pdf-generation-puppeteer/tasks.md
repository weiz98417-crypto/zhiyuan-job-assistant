## 1. 依赖替换

- [x] 1.1 `npm uninstall playwright && npm install puppeteer`
- [x] 1.2 修改 `generate-pdf.mjs`：`playwright.launch()` → `puppeteer.launch()`

## 2. API 端点

- [x] 2.1 新建 `frontend/src/app/api/cv/generate-pdf/route.ts`
- [x] 2.2 接收 `{ cvData }` → 填充 `templates/cv-template.html` → puppeteer → 返回 PDF

## 3. 验证

- [x] 3.1 测试 PDF 生成：`curl -X POST localhost:3000/api/cv/generate-pdf -d '{"cvData":{...}}' -o test.pdf`
- [x] 3.2 排版对比：与原有 Playwright 版本的 PDF 样式一致
