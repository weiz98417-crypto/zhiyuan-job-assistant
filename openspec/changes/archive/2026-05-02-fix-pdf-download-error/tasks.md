## 1. Frontend — Error message extraction

- [x] 1.1 Parse API error response body in `downloadPDF()` to extract `error` field
- [x] 1.2 Fall back to generic "PDF 生成失败" message if JSON parsing fails

## 2. Backend — Chromium launch compatibility

- [x] 2.1 Add `--no-sandbox`, `--disable-gpu`, `--disable-setuid-sandbox` args to `chromium.launch()`
- [x] 2.2 Change `waitUntil` from `"networkidle"` to `"load"` in `page.setContent()`
- [x] 2.3 Wrap `document.fonts.ready` in `Promise.race` with 5-second timeout
