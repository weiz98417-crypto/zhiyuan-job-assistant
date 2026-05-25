# Tasks

## 1. Domain Model And Storage

- [ ] Define shared TypeScript types for `InterviewPlanSnapshot`, `InterviewSessionState`, `QuestionNode`, `InterviewTurn`, `InterviewScore`, and `InterviewRecap`.
- [ ] Add durable storage for interview sessions, either by extending chat session metadata or creating interview-specific tables/records.
- [ ] Persist `planSnapshot` inside the session at start time so later JD/resume edits do not mutate the active simulation.
- [ ] Persist question graph and transcript after every user/assistant turn.
- [ ] Persist recap and scoring artifacts separately from raw assistant text.

## 2. Interview Prep Page

- [ ] Refactor Interview Prep into three clear surfaces:
  - preparation controls;
  - saved mock interview history;
  - recap/transcript review.
- [ ] Load JD options from JD Management storage and resume options from Resume Management storage.
- [ ] Generate an `InterviewPlanSnapshot` only when the user starts a mock interview.
- [ ] Open AgentChat with the new snapshot/session context.
- [ ] Ensure changes made in Interview Prep after a session starts affect only future sessions.
- [ ] Show past Agent interview sessions with title, company, role, status, score, date, and recap entry.
- [ ] Allow opening a historical session in AgentChat or opening a read-only recap view.

## 3. AgentChat Interview Runtime

- [ ] Add session bootstrap support for `interviewPlanId` or serialized `InterviewPlanSnapshot`.
- [ ] Show the active interview binding in AgentChat.
- [ ] Route "start mock interview based on my JD/resume" through the interview session runtime, not the loose question-generation flow.
- [ ] Track the current main question and follow-up stack in state.
- [ ] Classify assistant questions as `main`, `follow_up`, `probe`, `clarification`, or `reverse_question`.
- [ ] Attach every follow-up/probe to a parent question with a short reason.
- [ ] Save user answers immediately so scoring and recap never ask the user to repost answers.
- [ ] Support interrupting streaming output without losing the already persisted turn state.

## 4. Smart JD/Resume Rebind

- [ ] Add an intent classifier for material references in interview chat:
  - continue current session;
  - use another JD/resume as supporting context;
  - switch active material;
  - restart as a new interview.
- [ ] Match mentioned JD/resume references against local records by explicit id/name/company/role/title.
- [ ] Automatically rebind only when confidence is high and user wording is explicit.
- [ ] For medium confidence, ask one short clarification before rebinding.
- [ ] For weak references, keep the current binding and treat the mention as contextual information.
- [ ] Record all confirmed rebinds in `rebindHistory`.

## 5. Coach Prompt And Tool Policy

- [ ] Update the interview agent prompt so it treats the session state as the source of truth.
- [ ] Prevent tools from regenerating a full question plan when the active session already has one.
- [ ] Scoring tools must consume stored question/answer turns rather than asking for pasted answers.
- [ ] Recap generation must summarize from `InterviewSessionState`.
- [ ] Keep JD/resume read tools flexible enough for real use, but gate state-changing rebinds through the rebind policy.

## 6. Recap Experience

- [ ] Define recap sections:
  - overall verdict;
  - question-by-question feedback;
  - follow-up performance;
  - evidence from answers;
  - weak spots;
  - next practice plan.
- [ ] Render recap from structured data, not as a raw assistant blob.
- [ ] Link recap back to the exact session transcript and plan snapshot.
- [ ] Make recap visible from Interview Prep history.

## 7. Regression Tests

- [ ] Test: prep snapshot freezes JD/resume content for the active session.
- [ ] Test: changing prep configuration does not mutate an active AgentChat session.
- [ ] Test: follow-up after Q3 is stored as child of Q3, not Q9.
- [ ] Test: after answering multiple questions, recap uses stored answers and never asks the user to repost them.
- [ ] Test: ambiguous "use another resume" wording does not silently switch bindings.
- [ ] Test: explicit "switch to X resume and restart" creates a new session or rebinds with recorded history.
- [ ] Test: Interview Prep displays AgentChat interview history and recap entries.
- [ ] Run `npm run build`.

