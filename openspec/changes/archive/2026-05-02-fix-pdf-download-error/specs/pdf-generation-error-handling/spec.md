## ADDED Requirements

### Requirement: Frontend extracts and displays API error detail
When the PDF generation API returns a non-2xx response, the frontend SHALL parse the response body as JSON and use the `error` field as the error message. If parsing fails, it SHALL fall back to "PDF 生成失败".

#### Scenario: API returns structured error
- **WHEN** `/api/generate-cv-pdf` responds with status 400 or 500 and body `{ "success": false, "error": "简历内容不能为空，请先填写简历" }`
- **THEN** the frontend SHALL extract "简历内容不能为空，请先填写简历" and log it via `console.error`

#### Scenario: API response body is unparseable
- **WHEN** `/api/generate-cv-pdf` responds with a non-2xx status and the body cannot be parsed as JSON
- **THEN** the frontend SHALL fall back to the message "PDF 生成失败"

### Requirement: Chromium launch includes Windows-compatible args
The API route SHALL launch Chromium with `--no-sandbox`, `--disable-gpu`, and `--disable-setuid-sandbox` flags to ensure compatibility on Windows and CI environments.

#### Scenario: Chromium launches successfully on Windows
- **WHEN** the API receives a valid PDF generation request
- **THEN** Chromium SHALL launch with the configured args and proceed to render the page

### Requirement: PDF page rendering tolerates missing external resources
The API route SHALL use `waitUntil: "load"` instead of `"networkidle"` when calling `page.setContent()`, so that missing external resources (fonts, images) do not cause timeouts.

#### Scenario: Font files are missing from disk
- **WHEN** the HTML template references font files that do not exist in the `fonts/` directory
- **THEN** the page SHALL still render and produce a PDF, using fallback system fonts

### Requirement: Font loading has a hard timeout
The API route SHALL wrap `document.fonts.ready` in a `Promise.race` with a 5-second timeout so that font loading failures do not block PDF generation indefinitely.

#### Scenario: Fonts fail to load within 5 seconds
- **WHEN** `document.fonts.ready` does not resolve within 5 seconds
- **THEN** the timeout SHALL resolve and PDF generation SHALL proceed with whatever fonts are available
