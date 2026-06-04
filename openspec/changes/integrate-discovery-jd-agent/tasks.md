# Tasks

## 1. Data Layer

- [x] Add scan-to-JD fields to the server database migration:
  - `scan_jobs.jd_id`
  - `scan_jobs.last_error`
  - broaden `scan_jobs.status` handling to include `viewed`, `saved`, `evaluating`, `evaluated`, `dismissed`.
- [x] Add JD dedup helper:
  - first match by `source_url`;
  - then match by normalized body hash;
  - return existing `jd_id` when safe to reuse.
- [x] Update JD creation APIs to accept `source_type = "discovery"` and optional `scan_job_id`.
- [x] Update scan job APIs to return `jd_id` and saved/evaluated state.

## 2. JD Fetch And Save Flow

- [x] Add an API endpoint or service function to fetch full JD text for a `scan_job_id`.
- [x] On successful JD fetch, normalize company, role, URL, body, and keywords.
- [x] If JD fetch fails, store the error in `scan_jobs.last_error` and expose a manual paste fallback.
- [x] Implement "保存到 JD 库" from a scan job:
  - fetch JD if needed;
  - deduplicate;
  - create/reuse `jds`;
  - update `scan_jobs.jd_id`;
  - set `scan_jobs.status = "saved"`.

## 3. Job Discovery UI

- [x] Replace "送入评估管道" copy with explicit buttons:
  - `查看 JD`
  - `保存到 JD 库`
  - `让 Agent 评估`
  - `跳过`
- [x] Add JD detail drawer:
  - loading state while fetching;
  - full JD display;
  - manual paste fallback;
  - original link;
  - save/evaluate actions.
- [x] Show lightweight state badges on job cards:
  - `新发现`
  - `已查看`
  - `已保存`
  - `已评估`
  - `已跳过`
- [x] Do not add report browsing actions to Discovery.
- [x] Adjust default scan config toward Chinese target roles and domestic companies.

## 4. Agent Handoff

- [x] Add AgentChat entry support for `jd_id` context, for example `/agent?jdId=123&intent=evaluate`.
- [x] Add or reuse an Agent tool to read a saved JD by id.
- [x] When user clicks "让 Agent 评估" from Discovery:
  - save/reuse JD first;
  - open AgentChat with JD context;
  - auto-send or prefill a clear evaluation prompt.
- [x] Agent must read local JD context instead of asking the user to paste the JD again.
- [x] Evaluation output remains summary-first in AgentChat; full report stays in Report/JD Management.

## 5. JD Management Integration

- [x] JD Management should show discovery-sourced JDs with a small `来自职位发现` source badge.
- [x] JD Management should remain the place for opening saved JD details and related reports.
- [x] Add "去 JD 管理" affordance from Discovery only after a job is saved.
- [x] Ensure deleting a JD does not delete the scan lead; it should clear or orphan `scan_jobs.jd_id` safely.

## 6. Verification

- [x] Add regression tests for JD dedup by source URL and body hash.
- [ ] Add API tests or route-level checks for save-from-discovery.
- [ ] Manually verify:
  - scan job -> view JD -> save to JD library;
  - scan job -> let Agent evaluate -> Agent reads saved JD;
  - saved discovery JD appears in JD Management;
  - Discovery does not show report management actions.
- [x] Run `npm run build`.

