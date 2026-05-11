## Why

The CV PDF download feature fails silently with a generic "PDF 生成失败" error. The frontend discards the server's actual error message, making debugging impossible. The Playwright/Chromium launch on Windows may also lack proper sandbox/GPU flags needed in development environments, and the `networkidle` wait strategy can timeout when referenced font files don't exist.

## What Changes

- Frontend: extract and display the actual error message from the API response body instead of throwing a generic error
- API route: add Windows-compatible Chromium launch args (`--no-sandbox`, `--disable-gpu`, `--disable-setuid-sandbox`)
- API route: change `waitUntil` from `networkidle` to `domcontentloaded` to avoid timeout when external resources (fonts) are unavailable
- API route: wrap `document.fonts.ready` in a try-catch with a fallback timeout to prevent hanging on missing font files

## Capabilities

### New Capabilities
- `pdf-generation-error-handling`: API returns structured errors and frontend surfaces them to the user

### Modified Capabilities
<!-- None - no existing specs to modify -->

## Impact

- `frontend/src/app/cv/page.tsx` — `downloadPDF` function (error extraction from response body)
- `frontend/src/app/api/generate-cv-pdf/route.ts` — Chromium launch args, wait strategy, font loading timeout
