/**
 * 服务端 Run 上下文补齐（M1 缺口闭包，ADR-0026）。
 *
 * legacy directMode 时代由浏览器 page.tsx 拼接的 interview/rebind/guided
 * 提示词上下文，现在统一在服务端从持久化会话状态重建——服务器是唯一事实源，
 * 浏览器不再参与 prompt 组装。
 */
import type { InterviewSessionState } from "@/types";
import {
  classifyInterviewMaterialReference,
  formatInterviewRebindRuntimeDirective,
  matchInterviewMaterialReference,
  resolveInterviewRebindAction,
  type InterviewMaterialRecord,
  type InterviewRebindResolution,
} from "@/lib/agent/interview-rebind-policy";
import { getDataRepositories } from "@/lib/data-repositories";
import type { ExecutionPrincipal } from "@/lib/agent/runtime/durable-agent-run";
import {
  buildGuidedSessionRuntimeDirective,
  resolveActiveGuidedSession,
  type GuidedSessionState,
} from "@/lib/agent/guided-session-state";
import { countAnsweredInterviewRounds } from "@/lib/agent/interview-session-state";

function countAnsweredRounds(state: InterviewSessionState): number {
  try {
    return countAnsweredInterviewRounds(state);
  } catch {
    return 0;
  }
}

export function buildInterviewContext(interviewState: InterviewSessionState): string {
  if (!interviewState.planSnapshot) return "";
  const snapshot = interviewState.planSnapshot;
  return `

## Active Interview Session
This chat is running a mock interview. Treat the following snapshot as the source of truth and do not silently switch materials.
Company: ${snapshot.jdSnapshot?.company || "unknown"}
Role: ${snapshot.jdSnapshot?.role || "unknown"}
Mode: ${snapshot.mode}
Difficulty: ${snapshot.difficulty}
Focus areas: ${snapshot.focusAreas.join(", ") || "none"}
Allow follow-ups: ${snapshot.allowFollowUps ? "yes" : "no"}
Answered user turns: ${countAnsweredRounds(interviewState)}

JD snapshot excerpt:
${(snapshot.jdSnapshot?.body || "").slice(0, 1600) || "No JD snapshot available."}

Resume snapshot excerpt:
${(snapshot.resumeSnapshot?.body || "").slice(0, 1600) || "No resume snapshot available."}

Rules:
- This JD and resume remain binding across the whole mock interview, including after the user corrects your format.
- Ask exactly one interview question per assistant turn. Never list a batch of questions.
- Before the question, include four concise coaching lines: 题型, 考察点, JD 关联, 简历关联.
- Then ask exactly one question and stop. Wait for the user's answer.
- Attach follow-ups to the current question and the original JD/resume snapshot.
- Do not ask the user to repost JD/resume unless the snapshot is empty and no recent JD can be read.`;
}

export async function loadInterviewMaterialRecordsForPrincipal(
  principal: ExecutionPrincipal,
): Promise<InterviewMaterialRecord[]> {
  const repos = getDataRepositories();
  const [jdResult, refResult] = await Promise.allSettled([
    repos.jds.list(principal.userId),
    repos.referenceResumes.list(principal.userId),
  ]);
  const records: InterviewMaterialRecord[] = [];

  if (jdResult.status === "fulfilled") {
    for (const jd of jdResult.value) {
      records.push({
        id: (jd as { id?: number }).id,
        kind: "jd",
        title: `${(jd as { company?: string }).company || ""} ${(jd as { role?: string }).role || ""} JD`.trim(),
        company: String((jd as { company?: string }).company || ""),
        role: String((jd as { role?: string }).role || ""),
        body: String((jd as { body?: string }).body || ""),
        keywords: Array.isArray((jd as { keywords?: unknown }).keywords)
          ? ((jd as { keywords?: unknown }).keywords as unknown[]).filter((item): item is string => typeof item === "string")
          : [],
      });
    }
  }

  if (refResult.status === "fulfilled") {
    for (const resume of refResult.value) {
      const row = resume as unknown as Record<string, unknown>;
      const tags = Array.isArray(row.tags) ? row.tags.filter((item): item is string => typeof item === "string") : [];
      records.push({
        id: row.id as number | undefined,
        kind: "resume",
        title: String(row.name || ""),
        name: String(row.name || ""),
        label: String(row.source || ""),
        body: [row.notes, tags.join(" ")].filter(Boolean).join("\n"),
        keywords: tags,
      });
    }
  }

  return records;
}

export interface ServerRunContextDirectives {
  interviewContext: string;
  rebindContext: string;
  guidedDirective: string;
  interviewState: InterviewSessionState | undefined;
  interviewRebindAction: InterviewRebindResolution | null;
  activeGuidedSession: GuidedSessionState | null;
}

export async function buildServerRunContextDirectives(input: {
  principal: ExecutionPrincipal;
  conversationId: number | null;
  content: string;
  agentState?: Record<string, unknown>;
  /** Client-advertised bypass (explicit forced agent); mirrors shouldBypassConversationLocks. */
  bypassConversationLocks?: boolean;
}): Promise<ServerRunContextDirectives> {
  const interviewState = await loadInterviewState(input.principal, input.conversationId);
  const sessionAgentState = await loadSessionAgentState(input.principal, input.conversationId);
  const activeGuidedSession = resolveActiveGuidedSession({
    agentState: (input.agentState || sessionAgentState || undefined) as Parameters<typeof resolveActiveGuidedSession>[0]["agentState"],
    interviewState,
  });

  let interviewRebindAction: InterviewRebindResolution | null = null;
  if (!input.bypassConversationLocks && interviewState?.planSnapshot) {
    const decision = classifyInterviewMaterialReference(input.content);
    if (decision.intent !== "continue_current_session") {
      const materialRecords = await loadInterviewMaterialRecordsForPrincipal(input.principal);
      const match = matchInterviewMaterialReference(decision, materialRecords);
      interviewRebindAction = resolveInterviewRebindAction(decision, match);
    }
  }

  const interviewContext = input.bypassConversationLocks || !interviewState?.planSnapshot
    ? ""
    : buildInterviewContext(interviewState);
  const rebindContext = interviewRebindAction
    ? `\n\n${formatInterviewRebindRuntimeDirective(interviewRebindAction)}`
    : "";
  const guidedDirective = buildGuidedSessionRuntimeDirective({
    activeTask: activeGuidedSession,
    requiresSwitchConfirmation: false,
    clarificationQuestion: undefined,
  });

  return {
    interviewContext,
    rebindContext,
    guidedDirective,
    interviewState: input.bypassConversationLocks ? undefined : interviewState,
    interviewRebindAction,
    activeGuidedSession,
  };
}

async function loadInterviewState(
  principal: ExecutionPrincipal,
  conversationId: number | null,
): Promise<InterviewSessionState | undefined> {
  if (conversationId === null) return undefined;
  try {
    const row = await getDataRepositories().sessions.get(conversationId, principal.userId);
    if (!row) return undefined;
    const raw = (row as Record<string, unknown>).interview_state_json
      ?? (row as Record<string, unknown>).interviewState;
    if (!raw) return undefined;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && (parsed as InterviewSessionState).planSnapshot
      ? parsed as InterviewSessionState
      : undefined;
  } catch {
    return undefined;
  }
}

/** Load the persisted guided-session agentState from the conversation row. */
async function loadSessionAgentState(
  principal: ExecutionPrincipal,
  conversationId: number | null,
): Promise<Record<string, unknown> | undefined> {
  if (conversationId === null) return undefined;
  try {
    const row = await getDataRepositories().sessions.get(conversationId, principal.userId);
    if (!row) return undefined;
    const raw = (row as Record<string, unknown>).agent_state_json
      ?? (row as Record<string, unknown>).agentState;
    if (!raw) return undefined;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}
