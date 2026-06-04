# Tasks

## 1. Domain Model And Storage

- [x] Define shared TypeScript types for `InterviewPlanSnapshot`, `InterviewSessionState`, `QuestionNode`, `InterviewTurn`, `InterviewScore`, and `InterviewRecap`.
- [x] Add durable storage for interview sessions, either by extending chat session metadata or creating interview-specific tables/records.
- [x] Persist `planSnapshot` inside the session at start time so later JD/resume edits do not mutate the active simulation.
- [x] Persist question graph and transcript after every user/assistant turn.
- [x] Persist recap and scoring artifacts separately from raw assistant text.

## 2. Interview Prep Page

- [x] Refactor Interview Prep into three clear surfaces:
  - preparation controls;
  - saved mock interview history;
  - recap/transcript review.
- [x] Load JD options from JD Management storage and resume options from Resume Management storage.
- [x] Generate an `InterviewPlanSnapshot` only when the user starts a mock interview.
- [x] Open AgentChat with the new snapshot/session context.
- [x] Ensure changes made in Interview Prep after a session starts affect only future sessions.
- [x] Show past Agent interview sessions with title, company, role, status, score, date, and recap entry.
- [x] Allow opening a historical session in AgentChat or opening a read-only recap view.

## 3. AgentChat Interview Runtime

- [x] Add session bootstrap support for `interviewPlanId` or serialized `InterviewPlanSnapshot`.
- [x] Show the active interview binding in AgentChat.
- [x] Route "start mock interview based on my JD/resume" through the interview session runtime, not the loose question-generation flow.
- [x] Track the current main question and follow-up stack in state.
- [x] Classify assistant questions as `main`, `follow_up`, `probe`, `clarification`, or `reverse_question`.
- [x] Attach every follow-up/probe to a parent question with a short reason.
- [x] Save user answers immediately so scoring and recap never ask the user to repost answers.
- [x] Support interrupting streaming output without losing the already persisted turn state.

## 4. Smart JD/Resume Rebind

- [x] Add an intent classifier for material references in interview chat:
  - continue current session;
  - use another JD/resume as supporting context;
  - switch active material;
  - restart as a new interview.
- [x] Match mentioned JD/resume references against local records by explicit id/name/company/role/title.
- [x] Automatically rebind only when confidence is high and user wording is explicit.
- [x] For medium confidence, ask one short clarification before rebinding.
- [x] For weak references, keep the current binding and treat the mention as contextual information.
- [x] Record all confirmed rebinds in `rebindHistory`.

## 5. Coach Prompt And Tool Policy

- [x] Update the interview agent prompt so it treats the session state as the source of truth.
- [x] Prevent tools from regenerating a full question plan when the active session already has one.
- [x] Scoring tools must consume stored question/answer turns rather than asking for pasted answers.
- [x] Recap generation must summarize from `InterviewSessionState`.
- [x] Keep JD/resume read tools flexible enough for real use, but gate state-changing rebinds through the rebind policy.

## 6. Recap Experience

- [x] Define recap sections:
  - overall verdict;
  - question-by-question feedback;
  - follow-up performance;
  - evidence from answers;
  - weak spots;
  - next practice plan.
- [x] Render recap from structured data, not as a raw assistant blob.
- [x] Link recap back to the exact session transcript and plan snapshot.
- [x] Make recap visible from Interview Prep history.

## 7. Regression Tests

- [x] Test: prep snapshot freezes JD/resume content for the active session.
- [x] Test: changing prep configuration does not mutate an active AgentChat session.
- [x] Test: follow-up after Q3 is stored as child of Q3, not Q9.
- [x] Test: after answering multiple questions, recap uses stored answers and never asks the user to repost them.
- [x] Test: ambiguous "use another resume" wording does not silently switch bindings.
- [x] Test: explicit "switch to X resume and restart" creates a new session or rebinds with recorded history.
- [ ] Test: Interview Prep displays AgentChat interview history and recap entries.
- [x] Run `npm run build`.
