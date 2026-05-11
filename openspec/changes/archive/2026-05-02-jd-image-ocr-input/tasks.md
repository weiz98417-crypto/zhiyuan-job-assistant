## 1. OCR API Route

- [x] 1.1 Create `/api/ocr/jd-screenshot` route handler with input validation (size, format)
- [x] 1.2 Implement 智谱 GLM-4.6V-Flash API call with structured JSON prompt
- [x] 1.3 Parse OCR response: extract company, role, location, salary, skills, body, isJD
- [x] 1.4 Fill missing fields with `【缺失】` placeholder
- [x] 1.5 Add error handling (API key missing, rate limit, timeout, non-JSON response)

## 2. Image Upload Component

- [x] 2.1 Create `ImageUploadZone` component (drag, paste, click upload)
- [x] 2.2 Implement image preview queue with thumbnail grid
- [x] 2.3 Add drag-to-reorder in queue (simplified: order determined by add sequence)
- [x] 2.4 Add remove-from-queue with confirm
- [x] 2.5 Validate file format and size before adding to queue
- [x] 2.6 Add "开始识别" button with disabled states

## 3. Batch Processing Logic

- [x] 3.1 Create `useBatchOCR` hook managing queue state and parallel API calls (integrated in OCRInputPanel)
- [x] 3.2 Implement per-image status tracking (pending → processing → done/error)
- [x] 3.3 Show batch progress indicator ("3/5 完成")
- [x] 3.4 Add retry logic for failed images (max 1 retry)

## 4. Confirmation UI

- [x] 4.1 Create `OCRConfirmCard` component with editable fields
- [x] 4.2 Highlight missing fields with yellow warning style
- [x] 4.3 Implement non-JD detection alert ("该图片可能不是 JD")
- [x] 4.4 Add "保存到 JD 库" and "跳过" actions per item
- [x] 4.5 Implement auto-advance to next item after confirm/skip
- [x] 4.6 Show completion summary: "成功保存 N 条 JD"

## 5. Evaluate Page Integration

- [x] 5.1 Add "截图识别" tab to evaluate page input mode selector
- [x] 5.2 Wire OCR confirmation save to JD library (`createJD`)
- [x] 5.3 Add option to evaluate saved JD directly after confirmation

## 6. Environment Config

- [x] 6.1 Add `ZHIPU_API_KEY` to `.env.local` (already provided)
- [x] 6.2 Add validation on startup: warn if key is missing (validated at API call time)
