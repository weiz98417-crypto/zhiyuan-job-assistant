# Change: restructure-interview-coach-flow

## Summary

Redesign the interview coach around a real interview session model.

JD Management and Resume Management remain the canonical data stores. Interview Prep becomes a planner and history surface. AgentChat becomes the only live interview executor. A simulation may ask follow-ups and deviate naturally, but every question, answer, score, and recap must stay anchored to the current interview session.

## Problem

The current interview flow behaves like a loose question generator instead of a realistic interviewer:

- the coach can forget which questions were already answered;
- follow-ups can drift into unrelated "new questions";
- scoring and recap may ask the user to paste answers that already exist in the transcript;
- Interview Prep, practice panels, AgentChat, and agent tools all have overlapping responsibility;
- preparation-page configuration may accidentally interfere with live AgentChat behavior;
- simulated interview records are not consistently visible from Interview Prep.

## Goals

- Make Interview Prep a configuration and review surface, not a live interviewer.
- Make AgentChat the single runtime for realistic mock interviews.
- Freeze selected JD/resume data into an `InterviewPlanSnapshot` at session start.
- Allow natural follow-ups without turning them into untracked question drift.
- Persist transcripts, question graph, scores, and recap as first-class session data.
- Let Interview Prep show historical simulations and recaps without mutating active sessions.
- Define smart rebind behavior when a user mentions another JD/resume during AgentChat.

## Non-Goals

- Do not replace JD Management or Resume Management as source-of-truth pages.
- Do not force a rigid Q1-Q8 script that blocks realistic follow-up.
- Do not let Interview Prep control live scoring or live question selection.
- Do not silently switch the active JD/resume binding on ambiguous user wording.
- Do not build a separate report system for interviews outside session history.

## Proposed Flow

1. User manages source JD/resume records in their existing management pages.
2. User opens Interview Prep, chooses JD, resume, mode, difficulty, and focus areas.
3. Starting a mock interview creates an immutable `InterviewPlanSnapshot`.
4. AgentChat opens or resumes an `InterviewSession` backed by that snapshot.
5. The coach asks a main question, listens to the answer, and may ask anchored follow-ups.
6. Each turn is saved into a transcript and linked to a question node.
7. Scoring reads the session transcript, not transient page state.
8. Ending the mock interview generates a recap tied to the session.
9. Interview Prep lists past sessions and opens transcripts/recaps for review.

## Key UX Decisions

- Interview Prep labels the selected JD/resume as "used for the next session" rather than "currently controlling the coach".
- AgentChat shows the active interview binding: company, role, resume, mode, and whether it came from a prep snapshot.
- Follow-ups are displayed as probes under the current main question, not as unlabeled new questions.
- If the user mentions another JD/resume:
  - clear switch language may rebind or start a new session with an explicit assistant explanation;
  - weak or ambiguous references are treated as supporting context or trigger a brief clarification;
  - no silent switch is allowed.
- Interview Prep can show recaps and transcripts, but editing prep settings only affects future sessions.

## Data Model Direction

Introduce or formalize:

- `InterviewPlanSnapshot`
  - `snapshotId`
  - `source.jdId`, `source.resumeId`
  - `jdSnapshot`, `resumeSnapshot`
  - `mode`, `difficulty`, `focusAreas`, `allowFollowUps`
  - `createdAt`
- `InterviewSessionState`
  - `sessionId`
  - `planSnapshot`
  - `status`: `active | paused | completed | abandoned`
  - `currentQuestionId`
  - `questionGraph`
  - `transcript`
  - `scores`
  - `recap`
  - `rebindHistory`
- `QuestionNode`
  - `id`
  - `kind`: `main | follow_up | probe | clarification | reverse_question`
  - `parentId`
  - `reason`
  - `question`
  - `answerTurnIds`
  - `score`

