## Context

The CV PDF generation flow: user clicks "下载 PDF" → frontend `downloadPDF()` sends POST to `/api/generate-cv-pdf` → API route loads HTML template, populates CV data, launches headless Chromium via Playwright, renders to PDF, returns binary.

Current problems:
- Frontend throws generic "PDF 生成失败" without extracting the server's error detail
- Backend launches Chromium without Windows-compatible flags (`--no-sandbox`)
- Backend uses `waitUntil: "networkidle"` which can timeout when referenced fonts are missing
- Font files referenced in template CSS don't exist in the `fonts/` directory

## Goals / Non-Goals

**Goals:**
- Surface the actual server error message on the frontend so users and developers can diagnose failures
- Make Chromium launch work reliably on Windows in development
- Prevent PDF generation from hanging when external resources (fonts) can't load

**Non-Goals:**
- Adding the missing font files (separate concern)
- Switching from Playwright to a different PDF library
- Adding a UI toast/notification system for errors

## Decisions

### 1. Frontend: parse error response body

Read `res.json()` on non-ok responses to extract `error` field from the API's JSON error envelope. Fall back to the generic message if parsing fails.

**Alternative considered**: Add a dedicated error state variable in React state. Rejected — simpler to pass the message directly to the Error constructor for now.

### 2. Chromium launch args: `--no-sandbox`, `--disable-gpu`, `--disable-setuid-sandbox`

Standard Playwright args for non-Linux CI/dev environments. These are harmless on platforms that don't need them.

**Alternative considered**: Environment detection to conditionally set args. Rejected — flags are harmless universally and conditional logic adds complexity.

### 3. `waitUntil` strategy: `load` instead of `networkidle`

`networkidle` waits for 500ms of no network activity. When font files are 404, the browser may keep retrying or the network check takes longer. `load` fires after the page and all subresources finish loading (success or failure). Followed by `document.fonts.ready` wrapped in a 5s timeout.

**Alternative considered**: Keeping `networkidle` and adding the font files. Rejected — font loading is a separate concern and `networkidle` is unnecessarily strict for PDF generation.

### 4. Font loading: try/catch with 5s timeout

Wrap `document.fonts.ready` in `Promise.race` with a 5s timeout so missing font files don't block PDF generation indefinitely.

## Risks / Trade-offs

- PDF styling may use fallback fonts (system serif/sans-serif) instead of Space Grotesk/DM Sans → Acceptable until fonts are added separately
- `load` event may fire before some async resources complete → Mitigated by explicit `document.fonts.ready` with timeout
