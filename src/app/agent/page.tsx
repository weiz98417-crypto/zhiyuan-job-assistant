"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, User, Bot } from "lucide-react";
import { HandwritingTitle, WarmButton } from "@/components/design";
import AgentChat from "@/components/agent/AgentChat";
import type { EvalBlockProgress, CompletionInfo } from "@/components/agent/AgentChat";
import SessionList from "@/components/agent/SessionList";
import { DEFAULT_SUGGESTIONS } from "@/components/agent/SuggestionChips";
import type { SuggestionChip } from "@/components/agent/SuggestionChips";
import { logInteraction } from "@/lib/agent/memory";
import { migrateExploreToAgent } from "@/lib/agent/migrate";
import { orchestrate } from "@/lib/agent/orchestrator";
import { agentLoopClient } from "@/lib/agent/loop/client-runner";
import { inferPreferredDocumentTypeFromText, type ImageIntakeResult } from "@/lib/agent/image-intake";
import { buildImageIntakeStatusText, buildImageIntakeToolSummary, routeImageIntake } from "@/lib/agent/image-intake-router";
import type { AgentDefinition } from "@/lib/agent/registry/types";
import { triggerProfileUpdate } from "@/lib/profile-update";
import { scanMessage, deduplicateSignals, maybeRawContext } from "@/lib/agent/signal-extractor";
import type { ExtractedSignal } from "@/lib/agent/signal-extractor";
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  softDeleteSession,
  undoDeleteSession,
  pinSession,
  ensureDefaultSession,
  generateMemoryDigest,
} from "@/lib/agent/sessions";
import {
  persistInterviewRecap,
  shouldPersistInterviewRecap,
  updateInterviewStateWithAssistantMessage,
  updateInterviewStateWithExchange,
  updateInterviewStateWithToolResult,
} from "@/lib/agent/interview-session-state";
import {
  classifyInterviewMaterialReference,
  formatInterviewRebindRuntimeDirective,
  matchInterviewMaterialReference,
  resolveInterviewRebindAction,
  type InterviewMaterialRecord,
  type InterviewRebindResolution,
} from "@/lib/agent/interview-rebind-policy";
import { markOfferStateStaleFromText } from "@/lib/agent/offer-session-state";
import {
  buildPendingReferenceResumeSave,
  buildPendingReferenceResumeSaveFromImage,
  buildReferenceResumeRoleQuestion,
  isPendingReferenceResumeSaveCancelled,
  type PendingReferenceResumeSaveAction,
  type ReferenceResumeSaveSessionState,
} from "@/lib/agent/reference-resume-save-flow";
import type { AgentMessage, AgentInteraction, ChatSession } from "@/types";


/* ── Agent phase ── */

type AgentPhase = "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done" | "extracting_ocr" | "extracting_jd" | "jd_extracted" | "detecting_archetype" | "archetype_detected" | null;

async function loadInterviewMaterialRecords(): Promise<InterviewMaterialRecord[]> {
  const [jdResult, refResult] = await Promise.allSettled([
    fetch("/api/data/jds", { cache: "no-store" }).then((res) => res.json()),
    fetch("/api/cv/references", { cache: "no-store" }).then((res) => res.json()),
  ]);
  const records: InterviewMaterialRecord[] = [];

  if (jdResult.status === "fulfilled" && jdResult.value?.success && Array.isArray(jdResult.value.data)) {
    for (const jd of jdResult.value.data as Array<Record<string, unknown>>) {
      records.push({
        id: jd.id as number | undefined,
        kind: "jd",
        title: `${jd.company || ""} ${jd.role || ""} JD`.trim(),
        company: String(jd.company || ""),
        role: String(jd.role || ""),
        body: String(jd.body || ""),
        keywords: Array.isArray(jd.keywords) ? jd.keywords.filter((item): item is string => typeof item === "string") : [],
      });
    }
  }

  if (refResult.status === "fulfilled" && refResult.value?.success && Array.isArray(refResult.value.data)) {
    for (const resume of refResult.value.data as Array<Record<string, unknown>>) {
      const tags = Array.isArray(resume.tags) ? resume.tags.filter((item): item is string => typeof item === "string") : [];
      records.push({
        id: resume.id as number | undefined,
        kind: "resume",
        title: String(resume.name || ""),
        name: String(resume.name || ""),
        label: String(resume.source || ""),
        body: [resume.notes, tags.join(" ")].filter(Boolean).join("\n"),
        keywords: tags,
      });
    }
  }

  return records;
}

/* ── Welcome message ── */

const WELCOME: AgentMessage = {
  role: "assistant",
  content:
    "你好！我是纸鸢，你的 AI 求职伙伴。\n\n" +
    "我可以帮你：\n" +
    "- 查询投递记录和 Pipeline 状态\n" +
    "- 评估职位 JD 和 Offer\n" +
    "- 根据你的画像推荐岗位\n" +
    "- 生成定制化简历\n" +
    "- 导出求职报告\n\n" +
    "也可以和你聊聊职业方向，帮你理清思路。\n\n" +
    "直接告诉我你需要什么，或者随便聊聊吧。",
  timestamp: new Date().toISOString(),
};

async function persistMessages(messages: AgentMessage[]): Promise<void> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastUser) return;

  try {
    await logInteraction({
      timestamp: new Date(lastUser.timestamp),
      trigger: "user_query",
      contextSnapshot: {
        profileVersion: "",
        pipelineSummary: "",
        recentActivityCount: 0,
      },
      reasoning: {
        thought: lastAssistant?.content || "",
        toolsConsidered: [],
        toolsUsed: [],
      },
      output: {
        type: "answer",
        summary: lastUser.content,
      },
    } as AgentInteraction);
  } catch {
    /* best-effort persistence */
  }
}

/* ── Inner page ── */

function AgentPageInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [phase, setPhase] = useState<AgentPhase>(null);
  const [executingTool, setExecutingTool] = useState<string | undefined>(undefined);
  const [thinkingContent, setThinkingContent] = useState<string>("");
  const [startTime, setStartTime] = useState<number | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [undoToast, setUndoToast] = useState<{ id: number; title: string } | null>(null);
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentDefinition | null>(null);
  const [evalProgress, setEvalProgress] = useState<EvalBlockProgress[]>([]);
  const [completionInfo, setCompletionInfo] = useState<CompletionInfo | null>(null);
  const [resultQuality, setResultQuality] = useState<string | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamContentRef = useRef("");
  const interviewBootstrapRef = useRef<number | null>(null);
  const seenSignalKeys = useRef<Set<string>>(new Set());
  const handoffKeyRef = useRef<string>("");

  const rafRef = useRef<number>(0);

  const makeSessionTitle = useCallback((text: string) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return "新对话";
    return cleaned.length <= 10 ? cleaned : cleaned.slice(0, 10) + "...";
  }, []);

  const renameSessionFromFirstUserMessage = useCallback(async (sessionId: number, firstText: string) => {
    const session = await getSession(sessionId);
    if (!session) return;
    if (session.interviewState?.planSnapshot) return;
    if (session.messages.some((m) => m.role === "user")) return;
    await updateSession(sessionId, { title: makeSessionTitle(firstText) });
    setSessions(await listSessions());
  }, [makeSessionTitle]);

  // rAF loop: copy ref -> state at ~60fps for smooth typewriter effect
  useEffect(() => {
    if (!streaming) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const latest = streamContentRef.current;
      setStreamText((prev) => (prev !== latest ? latest : prev));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [streaming]);

  useEffect(() => {
    // Best-effort migration from legacy localStorage
    migrateExploreToAgent()
      .then(async () => {
        const loaded = await listSessions();
        setSessions(loaded);

        if (loaded.length > 0) {
          const latest = loaded[0];
          setCurrentSessionId(latest.id!);
          setMessages(latest.messages);
        } else {
          // Create default session with welcome message
          const id = await createSession([WELCOME]);
          setCurrentSessionId(id);
          setMessages([WELCOME]);
          setSessions(await listSessions());
        }
      })
      .catch((error) => {
        setSessionLoadError(error instanceof Error ? error.message : "Failed to load sessions");
      })
      .finally(() => setMounted(true));
     
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const requestedSessionId = searchParams.get("sessionId");
    if (!requestedSessionId) return;
    const id = Number(requestedSessionId);
    if (!Number.isFinite(id)) return;
    if (currentSessionId === id) return;

    getSession(id).then((session) => {
      if (!session) return;
      setCurrentSessionId(id);
      setMessages(session.messages);
      setStreamText("");
      setThinkingContent("");
      streamContentRef.current = "";
    });
  }, [mounted, searchParams, currentSessionId]);

  const sendMessage = useCallback(
    async (content: string, images?: string[], options?: { hideUserMessage?: boolean }) => {
      const hideUserMessage = options?.hideUserMessage === true;
      const userMsg: AgentMessage = {
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      } as AgentMessage;
      if (images?.length) userMsg.images = images;
      const updated = [...messages, userMsg];
      if (!hideUserMessage) setMessages(updated);
      if (currentSessionId && !hideUserMessage) {
        const isFirstUserMsg = messages.filter((m) => m.role === "user").length === 0;
        if (isFirstUserMsg) {
          renameSessionFromFirstUserMessage(currentSessionId, content).catch(() => {});
        }
      }

      /* ── Auto-scan user message for profile signals ── */
      const sesId = currentSessionId ? String(currentSessionId) : "default";
      const extracted = deduplicateSignals(scanMessage(content, sesId), seenSignalKeys.current);

      // If regex found few signals but message is substantial, add raw_context for LLM enrichment
      const rawCtx = maybeRawContext(content, extracted.length, sesId);
      if (rawCtx) {
        const rawDeduped = deduplicateSignals([rawCtx], seenSignalKeys.current);
        if (rawDeduped.length > 0) extracted.push(rawDeduped[0]);
      }

      if (extracted.length > 0) {
        fetch("/api/data/signals/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signals: extracted }),
        }).catch(() => { /* fire-and-forget */ });
      }

      // Show thinking indicator immediately
      const assistantMsg: AgentMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };
      setMessages([...(hideUserMessage ? messages : updated), assistantMsg]);
      streamContentRef.current = "";
      setStreamText("");
      setStreaming(true);
      setPhase("understanding");
      setExecutingTool(undefined);
      setThinkingContent("");
      setStartTime(Date.now());
      setEvalProgress([]);
      setCompletionInfo(null);

      const imageDataUris = (images || []).filter((src) => typeof src === "string" && src.startsWith("data:image/"));
      const imageIntakeToolTimestamp = imageDataUris.length ? new Date().toISOString() : "";
      let imageIntakeToolMessage: AgentMessage | null = null;

      const upsertImageIntakeToolMessage = (message: AgentMessage) => {
        imageIntakeToolMessage = message;
        setMessages((prev) => {
          const copy = [...prev];
          const existingIndex = copy.findIndex((item) =>
            item.role === "tool" &&
            item.toolName === "recognize_document_image" &&
            item.timestamp === imageIntakeToolTimestamp
          );
          if (existingIndex >= 0) {
            copy[existingIndex] = message;
            return copy;
          }
          const anchorIndex = copy.length > 0 && copy[copy.length - 1]?.role === "assistant" && copy[copy.length - 1]?.content === ""
            ? copy.length - 1
            : copy.length;
          copy.splice(anchorIndex, 0, message);
          return copy;
        });
      };

      if (imageDataUris.length > 0) {
        setPhase("extracting_ocr");
        setExecutingTool("recognize_document_image");
        upsertImageIntakeToolMessage({
          role: "tool",
          toolName: "recognize_document_image",
          content: `正在识别 ${imageDataUris.length} 张图片...`,
          toolResult: {
            success: true,
            result: `正在识别 ${imageDataUris.length} 张图片...`,
            uiPayload: {
              type: "image_intake",
              status: "running",
              imagesCount: imageDataUris.length,
            },
          },
          timestamp: imageIntakeToolTimestamp,
        });
      }

      // ── File preprocessing: extract text from PDFs, keep images as context ──
      let fileContext = "";
      if (images?.length) {
        for (const b64 of images) {
          const isPdf = b64.startsWith("data:application/pdf");
          if (isPdf) {
            try {
              const res = await fetch(b64);
              const blob = await res.blob();
              const fd = new FormData();
              fd.append("file", blob, "resume.pdf");
              const importRes = await fetch("/api/cv/import", { method: "POST", body: fd });
              const importData = await importRes.json();
              if (importData.success) {
                const sections = importData.data.sections as Record<string, string>;
                fileContext += "\n\n---\n已解析的简历内容：\n" + Object.entries(sections)
                  .filter(([, v]) => v).map(([k, v]) => `【${k}】\n${v}`).join("\n\n");
              }
            } catch { /* preprocess failed, agent handles it */ }
          }
        }
      }

      if (fileContext) {
        content = content + fileContext;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // ── Client-side orchestration: classify + agentLoopClient ──
        const sessionMessages = updated.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const currentSessionForRun = currentSessionId ? await getSession(currentSessionId) : undefined;
        const memoryDigest = currentSessionForRun?.memoryDigest;
        const agentState = markOfferStateStaleFromText(currentSessionForRun?.agentState, content) || currentSessionForRun?.agentState;
        let rebindResolution: InterviewRebindResolution | null = null;
        if (currentSessionForRun?.interviewState?.planSnapshot) {
          const decision = classifyInterviewMaterialReference(content);
          if (decision.intent !== "continue_current_session") {
            const materialRecords = await loadInterviewMaterialRecords();
            const match = matchInterviewMaterialReference(decision, materialRecords);
            rebindResolution = resolveInterviewRebindAction(decision, match);
          }
        }

        const preferredDocumentType = imageDataUris.length
          ? inferPreferredDocumentTypeFromText(content)
          : undefined;
        let imageIntake: ImageIntakeResult | null = null;
        if (imageDataUris.length > 0) {
          const intakeController = new AbortController();
          const intakeTimeout = window.setTimeout(() => intakeController.abort(), 35_000);
          let intakeFailure = "";
          try {
            const intakeRes = await fetch("/api/agent/image-intake", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: intakeController.signal,
              body: JSON.stringify({
                images: imageDataUris,
                userText: content,
              }),
            });
            const intakeJson = await intakeRes.json().catch(() => ({}));
            if (intakeRes.ok && intakeJson.success) {
              imageIntake = intakeJson.data as ImageIntakeResult;
            } else {
              intakeFailure = String(intakeJson.error || `image intake HTTP ${intakeRes.status}`);
            }
          } catch (err) {
            intakeFailure = err instanceof Error ? err.message : "image intake failed";
          } finally {
            window.clearTimeout(intakeTimeout);
          }
          if (!imageIntake) {
            imageIntake = {
              documentType: "unknown",
              confidence: 0,
              extractedText: "",
              quality: "unknown",
              reason: intakeFailure || "图片识别失败",
              errors: [intakeFailure || "图片识别失败"],
              perImage: [],
            };
          }
          const intakeDecision = routeImageIntake(content, imageIntake);
          upsertImageIntakeToolMessage({
            role: "tool",
            toolName: "recognize_document_image",
            content: buildImageIntakeStatusText(content, imageIntake),
            toolResult: {
              success: intakeDecision.route !== "retry_image",
              result: buildImageIntakeToolSummary(intakeDecision, imageIntake),
              data: imageIntake,
              uiPayload: {
                type: "image_intake",
                status: intakeDecision.route === "retry_image" ? "failed" : "done",
                imagesCount: imageDataUris.length,
                documentType: intakeDecision.documentType,
                route: intakeDecision.route,
                confidence: intakeDecision.confidence,
                quality: intakeDecision.quality || "unknown",
                reason: intakeDecision.reason,
                clarificationQuestion: intakeDecision.clarificationQuestion,
                retryHint: intakeDecision.retryHint,
                preview: imageIntake.extractedText ? imageIntake.extractedText.slice(0, 180) : "",
                perImage: imageIntake.perImage || [],
              },
            },
            timestamp: imageIntakeToolTimestamp,
          });
          setPhase("understanding");
          setExecutingTool(undefined);
        }

        const currentReferenceResumeSaveState =
          (agentState?.referenceResumeSave && typeof agentState.referenceResumeSave === "object"
            ? agentState.referenceResumeSave
            : undefined) as ReferenceResumeSaveSessionState | undefined;
        let pendingReferenceResumeSaveForRun: PendingReferenceResumeSaveAction | undefined =
          currentReferenceResumeSaveState?.pending;
        const detectedReferenceResumeSave = imageDataUris.length > 0
          ? buildPendingReferenceResumeSaveFromImage(content, imageDataUris.length, imageIntake)
          : buildPendingReferenceResumeSave({
              userText: content,
              resumeText: content,
              source: "paste",
            });

        if (detectedReferenceResumeSave) {
          if (!detectedReferenceResumeSave.roleCategory) {
            const askedPending: PendingReferenceResumeSaveAction = {
              ...detectedReferenceResumeSave,
              askedRoleCategoryAt: new Date().toISOString(),
            };
            const roleQuestion = buildReferenceResumeRoleQuestion(askedPending);
            const finalAssistant: AgentMessage = {
              ...assistantMsg,
              content: roleQuestion,
              agent_id: "resume",
            };
            streamContentRef.current = roleQuestion;
            setStreamText(roleQuestion);
            setPhase(null);
            setExecutingTool(undefined);
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant" && last.content === "") copy[copy.length - 1] = finalAssistant;
              else copy.push(finalAssistant);
              return copy;
            });

            if (currentSessionId && currentSessionForRun) {
              const fullMessages = [...currentSessionForRun.messages];
              const taggedUserMsg = { ...userMsg, agent_id: "resume" };
              if (!hideUserMessage) fullMessages.push(taggedUserMsg);
              const persistedImageIntakeToolMessage = imageIntakeToolMessage as AgentMessage | null;
              if (!hideUserMessage && persistedImageIntakeToolMessage) {
                fullMessages.push({ ...persistedImageIntakeToolMessage, agent_id: "resume" });
              }
              fullMessages.push(finalAssistant);

              const isFirstUserMsg = currentSessionForRun.messages.filter((m) => m.role === "user").length === 0;
              const needsTitle =
                !currentSessionForRun.interviewState?.planSnapshot &&
                (isFirstUserMsg ||
                  !currentSessionForRun.title ||
                  currentSessionForRun.title === "新对话" ||
                  currentSessionForRun.title === "新的对话");
              const userMsgCount = fullMessages.filter((m) => m.role === "user").length;
              await updateSession(currentSessionId, {
                messages: fullMessages,
                title: needsTitle ? makeSessionTitle(content) : undefined,
                memoryDigest: userMsgCount >= 5 ? generateMemoryDigest(fullMessages) || undefined : memoryDigest,
                interviewState: currentSessionForRun.interviewState,
                agentState: {
                  ...(agentState || {}),
                  referenceResumeSave: { pending: askedPending },
                },
              });
              setSessions(await listSessions());
            }

            triggerProfileUpdate({ force: true }).catch(() => {});
            return;
          }

          pendingReferenceResumeSaveForRun = detectedReferenceResumeSave;
        }

        const routedContent = content;

        const { agent, systemPrompt, toolWhitelist, tools } = await orchestrate(routedContent, {
          sessionId: currentSessionId,
          messages: sessionMessages,
          memoryDigest,
          agentState,
          imageIntake,
          preferredDocumentType,
          forcedAgentId: pendingReferenceResumeSaveForRun
            ? "resume"
            : currentSessionForRun?.interviewState?.planSnapshot
            ? "interview"
            : undefined,
        });

        const interviewState = currentSessionForRun?.interviewState;
        const interviewContext = interviewState?.planSnapshot
          ? `\n\n## Active Interview Session
This chat is running a mock interview. Treat the following snapshot as the source of truth and do not silently switch materials.
Company: ${interviewState.planSnapshot.jdSnapshot?.company || "unknown"}
Role: ${interviewState.planSnapshot.jdSnapshot?.role || "unknown"}
Mode: ${interviewState.planSnapshot.mode}
Difficulty: ${interviewState.planSnapshot.difficulty}
Focus areas: ${interviewState.planSnapshot.focusAreas.join(", ") || "none"}
Allow follow-ups: ${interviewState.planSnapshot.allowFollowUps ? "yes" : "no"}
Answered user turns: ${interviewState.transcript.filter((t) => t.role === "user").length}

JD snapshot excerpt:
${(interviewState.planSnapshot.jdSnapshot?.body || "").slice(0, 1600) || "No JD snapshot available."}

Resume snapshot excerpt:
${(interviewState.planSnapshot.resumeSnapshot?.body || "").slice(0, 1600) || "No resume snapshot available."}

Rules:
- This JD and resume remain binding across the whole mock interview, including after the user corrects your format.
- Ask exactly one interview question per assistant turn. Never list a batch of questions.
- Before the question, include four concise coaching lines: 题型, 考察点, JD 关联, 简历关联.
- Then ask exactly one question and stop. Wait for the user's answer.
- Attach follow-ups to the current question and the original JD/resume snapshot.
- Do not ask the user to repost JD/resume unless the snapshot is empty and no recent JD can be read.`
          : "";
        const rebindContext = rebindResolution
          ? `\n\n${formatInterviewRebindRuntimeDirective(rebindResolution)}`
          : "";
        const activeSystemPrompt = `${systemPrompt}${interviewContext}${rebindContext}`;

        setActiveAgent(agent);

        let toolResultInfo: { name: string; result: string; success: boolean; data?: unknown; uiPayload?: Record<string, unknown> } | null = null;
        let assistantText = "";
        let nextOfferState = agentState?.offer;

        const msgList = updated.map((m, index) => ({
          role: m.role,
          content: m.content,
          images: m.images,
        }));

        let firstEvent = true;
        for await (const event of agentLoopClient(
          activeSystemPrompt, msgList, undefined, controller.signal, undefined,
          toolWhitelist.length > 0 ? toolWhitelist : undefined, tools,
          {
            imageIntake,
            preferredDocumentType,
            interviewState,
            interviewRebindAction: rebindResolution?.action,
            pendingReferenceResumeSave: pendingReferenceResumeSaveForRun,
          },
        )) {
          if (firstEvent) { setStartTime(Date.now()); firstEvent = false; }
          switch (event.type) {
            case "phase": setPhase(event.phase); break;
            case "intent": break;
            case "agent_switch": break;
            case "thinking_content": setThinkingContent(event.content); break;
            case "tool_call": setExecutingTool(event.name); setResultQuality(null); break;
            case "tool_result":
              toolResultInfo = { name: event.name, result: event.result, success: event.success, data: event.data, uiPayload: (event as { uiPayload?: Record<string, unknown> }).uiPayload };
              const offerPayload = (event as { uiPayload?: Record<string, unknown> }).uiPayload;
              if (offerPayload?.type === "offer_evaluation" || offerPayload?.type === "offer_report") {
                nextOfferState = {
                  activeOfferId: Number(offerPayload.offerId || offerPayload.activeOfferId || 0) || nextOfferState?.activeOfferId,
                  activeOfferReportId: Number(offerPayload.reportId || offerPayload.reportNum || 0) || nextOfferState?.activeOfferReportId,
                  lastUserIntent: "evaluate",
                  lastEvaluationSummary: {
                    company: String(offerPayload.company || ""),
                    role: String(offerPayload.role || ""),
                    overallScore: Number(offerPayload.overallScore || 0),
                    verdict: String(offerPayload.verdict || "proceed_cautiously") as "accept" | "accept_after_negotiation" | "proceed_cautiously" | "decline",
                    summary: String(offerPayload.summary || ""),
                  },
                  missingInfo: Array.isArray(offerPayload.missingInfo) ? (offerPayload.missingInfo as string[]) : nextOfferState?.missingInfo,
                  redFlags: Array.isArray(offerPayload.redFlags) ? (offerPayload.redFlags as string[]) : nextOfferState?.redFlags,
                  updatedAt: new Date().toISOString(),
                };
              } else if (offerPayload?.type === "offer_negotiation_strategy") {
                nextOfferState = {
                  ...(nextOfferState || {}),
                  lastUserIntent: "negotiate",
                  activeOfferReportId: Number(offerPayload.reportId || nextOfferState?.activeOfferReportId || 0) || nextOfferState?.activeOfferReportId,
                  updatedAt: new Date().toISOString(),
                };
              } else if (offerPayload?.type === "offer_hr_question_list") {
                nextOfferState = {
                  ...(nextOfferState || {}),
                  lastUserIntent: "ask_hr",
                  activeOfferReportId: Number(offerPayload.reportId || nextOfferState?.activeOfferReportId || 0) || nextOfferState?.activeOfferReportId,
                  updatedAt: new Date().toISOString(),
                };
              }
              // Show tool cards: use uiPayload if available (structured rendering), else fall back to text
              setMessages((prev) => {
                const copy = [...prev];
                const uiPayload = (event as { uiPayload?: Record<string, unknown> }).uiPayload;
                if (uiPayload) {
                  // Structured tool result: uiPayload drives component rendering
                  const toolMsg: AgentMessage = {
                    role: "tool" as const,
                    toolName: event.name,
                    content: event.result,
                    toolResult: { uiPayload, data: event.data, success: event.success },
                    timestamp: new Date().toISOString(),
                  };
                  const lastIdx = copy.length - 1;
                  if (copy[lastIdx]?.role === "tool" && copy[lastIdx]?.toolName === event.name) copy[lastIdx] = toolMsg;
                  else copy.push(toolMsg);
                } else if (event.name === "evaluate_jd_full" && (event as { data?: unknown }).data) {
                  // Legacy: evaluate_jd_full stores JSON data
                  const raw = (event as { data?: Record<string, unknown> }).data;
                  copy.push({
                    role: "tool" as const,
                    toolName: "evaluate_jd_full",
                    content: JSON.stringify({
                      company: raw?.company || "unknown",
                      role: raw?.role || "unknown",
                      overallScore: raw?.overallScore || 0,
                      archetype: raw?.archetype || "",
                      blocks: raw?.blocks || {},
                      jdText: raw?.jdText || "",
                      reportNum: raw?.reportNum || 0,
                    }),
                    timestamp: new Date().toISOString(),
                  });
                } else {
                  // Plain text tool result
                  const toolMsg: AgentMessage = {
                    role: "tool",
                    content: event.result,
                    toolResult: { success: event.success, result: event.result, data: event.data },
                    toolName: event.name,
                    timestamp: new Date().toISOString(),
                  };
                  const lastIdx = copy.length - 1;
                  if (copy[lastIdx]?.role === "tool" && copy[lastIdx]?.toolName === event.name) copy[lastIdx] = toolMsg;
                  else copy.push(toolMsg);
                }
                return copy;
              });
              break;
            case "tool_error": console.warn(`[agent] tool error: ${event.name} -> ${event.error}`); break;
            case "result_quality": setResultQuality(event.quality); break;
            case "text": assistantText += event.content; streamContentRef.current = assistantText; setStreamText(assistantText); break;
            case "block_start":
              setEvalProgress(prev => {
                const filtered = prev.filter(p => p.block !== event.block);
                return [...filtered, { block: event.block, label: event.label || event.block, status: "running" }];
              });
              break;
            case "block_done":
              setEvalProgress(prev => prev.map(p => p.block === event.block ? { ...p, status: "done" } : p));
              break;
            case "score":
              setEvalProgress(prev => prev.map(p => p.block === event.block ? { ...p, score: event.score } : p));
              break;
            case "overall_score": break;
            case "search_start":
              // Show risk scan / external search as a progress step
              if (event.source === "risk-scan" || event.source === "web") {
                setEvalProgress(prev => {
                  const filtered = prev.filter(p => p.block !== "search");
                  return [...filtered, { block: "search", label: `🔍 ${event.query.slice(0, 12)}`, status: "running" }];
                });
              }
              break;
            case "search_result":
              setEvalProgress(prev => prev.map(p => p.block === "search" ? { ...p, status: "done", score: event.count } : p));
              break;
            case "persist_done":
              setCompletionInfo({
                reportNum: event.reportNum,
                company: event.company,
                role: event.role,
                score: event.score,
              });
              break;
            case "done": break;
          }
        }

        // ── Finalize ──
        streamContentRef.current = assistantText;
        setStreamText(assistantText);
        setPhase(null);
        setExecutingTool(undefined);
        setEvalProgress([]);

        if (assistantText || toolResultInfo) {
          // Build final assistant
          const finalAssistant: AgentMessage = {
            ...assistantMsg,
            content: assistantText || "操作完成。",
          };

          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = finalAssistant;
            } else {
              copy.push(finalAssistant);
            }
            return copy;
          });

          // Save to current session
          if (currentSessionId) {
            const currentSession = await getSession(currentSessionId);
            if (currentSession) {
              const currentAgentState = currentSession.agentState || currentSessionForRun?.agentState || {};
              const fullMessages = [...currentSession.messages];
              // Tag user message with agent_id
              const taggedUserMsg = agent.id !== "general"
                ? { ...userMsg, agent_id: agent.id }
                : userMsg;
              if (!hideUserMessage) fullMessages.push(taggedUserMsg);
              const persistedImageIntakeToolMessage = imageIntakeToolMessage as AgentMessage | null;
              if (!hideUserMessage && persistedImageIntakeToolMessage) {
                fullMessages.push({
                  ...persistedImageIntakeToolMessage,
                  agent_id: agent.id !== "general" ? agent.id : undefined,
                });
              }
              let persistedToolMessage: AgentMessage | undefined;
              if (toolResultInfo) {
                persistedToolMessage = {
                  role: "tool",
                  content: toolResultInfo.result,
                  toolName: toolResultInfo.name,
                  toolResult: toolResultInfo.uiPayload
                    ? { uiPayload: toolResultInfo.uiPayload, data: toolResultInfo.data, success: toolResultInfo.success }
                    : toolResultInfo.name === "get_profile" && toolResultInfo.data
                      ? { data: toolResultInfo.data, success: toolResultInfo.success }
                      : { success: toolResultInfo.success, result: toolResultInfo.result, data: toolResultInfo.data },
                  agent_id: agent.id !== "general" ? agent.id : undefined,
                  timestamp: new Date().toISOString(),
                };
                fullMessages.push(persistedToolMessage);
              }
              const taggedAssistant = agent.id !== "general"
                ? { ...finalAssistant, agent_id: agent.id }
                : finalAssistant;
              fullMessages.push(taggedAssistant);

              let nextInterviewState = hideUserMessage
                ? updateInterviewStateWithAssistantMessage(currentSession.interviewState, taggedAssistant)
                : updateInterviewStateWithExchange(
                    currentSession.interviewState,
                    taggedUserMsg,
                    taggedAssistant,
                  );
              if (nextInterviewState && persistedToolMessage) {
                nextInterviewState = updateInterviewStateWithToolResult(nextInterviewState, persistedToolMessage);
              } else if (persistedToolMessage) {
                nextInterviewState = updateInterviewStateWithToolResult(currentSession.interviewState, persistedToolMessage);
              }
              if (nextInterviewState && !hideUserMessage && shouldPersistInterviewRecap(taggedUserMsg.content)) {
                nextInterviewState = persistInterviewRecap(nextInterviewState, taggedAssistant.content);
              }
              const isFirstUserMsg = currentSession.messages.filter((m) => m.role === "user").length === 0;
              const userMsgCount = fullMessages.filter((m) => m.role === "user").length;
              const memoryDigest = userMsgCount >= 5 ? generateMemoryDigest(fullMessages) : undefined;

              // Set title from FIRST user message (not current message)
              const needsTitle =
                !currentSession.interviewState?.planSnapshot &&
                (isFirstUserMsg ||
                  !currentSession.title ||
                  currentSession.title === "新对话" ||
                  currentSession.title === "新的对话");
              let sessionTitle: string | undefined;
              if (needsTitle) {
                const firstUserMsg = fullMessages.find((m) => m.role === "user");
                const titleText = firstUserMsg ? firstUserMsg.content.trim() : content.trim();
                sessionTitle = makeSessionTitle(titleText);
              }
              const shouldClearReferenceResumeSave =
                (toolResultInfo?.name === "save_reference_resume" && toolResultInfo.success) ||
                Boolean(pendingReferenceResumeSaveForRun && isPendingReferenceResumeSaveCancelled(content));
              const nextReferenceResumeSave = shouldClearReferenceResumeSave
                ? undefined
                : currentAgentState.referenceResumeSave as ReferenceResumeSaveSessionState | undefined;
              await updateSession(currentSessionId, {
                messages: fullMessages,
                title: sessionTitle,
                memoryDigest: memoryDigest ?? undefined,
                interviewState: nextInterviewState,
                agentState: {
                  ...currentAgentState,
                  offer: nextOfferState,
                  referenceResumeSave: nextReferenceResumeSave,
                },
              });
              // Refresh sessions list
              setSessions(await listSessions());
            }
          }

          // Auto-trigger profile update after each completed agent exchange
          triggerProfileUpdate({ force: true }).catch(() => {});

          // Best-effort legacy persist
          if (!hideUserMessage) {
            try { persistMessages([...updated, finalAssistant]); } catch { /* ok */ }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const errorMsg = err instanceof Error ? err.message : "未知错误";
        console.error("Stream error:", errorMsg);
        setStreaming(false);
        setPhase(null);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant" && last.content === "") {
            copy[copy.length - 1] = {
              ...last,
              content: `⚠️ 连接中断：${errorMsg}`,
            };
          }
          return copy;
        });
      } finally {
        setStreaming(false);
        setPhase(null);
        abortRef.current = null;
      }
    },
    [messages, currentSessionId, makeSessionTitle, renameSessionFromFirstUserMessage],
  );

  useEffect(() => {
    if (!mounted || streaming || !currentSessionId || messages.length > 0) return;

    let cancelled = false;
    const bootstrapInterview = async () => {
      const session = await getSession(currentSessionId);
      if (cancelled || !session?.interviewState?.planSnapshot) return;
      if (session.messages.some((m) => m.role === "user" || m.role === "assistant")) return;
      if (interviewBootstrapRef.current === currentSessionId) return;

      interviewBootstrapRef.current = currentSessionId;
      await sendMessage("开始模拟面试：请根据当前面试准备快照直接出第一题，不要先解释。", undefined, { hideUserMessage: true });
    };

    bootstrapInterview().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mounted, streaming, currentSessionId, messages.length, sendMessage]);

  const handleStopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setPhase(null);
    setExecutingTool(undefined);
    setThinkingContent("");
    setActiveAgent(null);
  }, []);

  const handleNewSession = useCallback(async () => {
    // Save current session before switching
    if (currentSessionId) {
      const currentSession = await getSession(currentSessionId);
      if (currentSession) {
        await updateSession(currentSessionId, { messages });
      }
    }
    // Trigger profile update before switching
    triggerProfileUpdate({ force: true }).catch(() => {});

    // Abort any streaming
    abortRef.current?.abort();
    setStreaming(false);
    setPhase(null);
    setActiveAgent(null);

    const id = await createSession([WELCOME]);
    setCurrentSessionId(id);
    setMessages([WELCOME]);
    setStreamText("");
    setThinkingContent("");
    streamContentRef.current = "";
    setSessions(await listSessions());
  }, [currentSessionId, messages]);

  useEffect(() => {
    if (!mounted || streaming || !currentSessionId) return;
    const jdId = searchParams.get("jdId");
    const intent = searchParams.get("intent");
    if (!jdId || intent !== "evaluate") return;
    const handoffKey = `${currentSessionId}:${jdId}`;
    if (handoffKeyRef.current === handoffKey) return;
    handoffKeyRef.current = handoffKey;
    sendMessage(`请结合我的简历评估 JD 库里的这份职位。先调用 get_recent_jd_context 读取 jdId=${jdId}，不要让我重新粘贴 JD。`).catch(() => {});
  }, [mounted, streaming, currentSessionId, searchParams, sendMessage]);

  useEffect(() => {
    if (!mounted || streaming || !currentSessionId) return;
    const offerId = searchParams.get("offerId");
    const offerReportId = searchParams.get("offerReportId");
    const intent = searchParams.get("intent");
    if (!offerId && !offerReportId) return;

    const handoffKey = `${currentSessionId}:offer:${intent || "open"}:${offerId || ""}:${offerReportId || ""}`;
    if (handoffKeyRef.current === handoffKey) return;
    handoffKeyRef.current = handoffKey;

    if (offerId && intent === "evaluate") {
      sendMessage(`请评估 Offer 工作台里的 offerId=${offerId}。直接调用 evaluate_offer，不要让我重新粘贴 Offer。`, undefined, { hideUserMessage: true }).catch(() => {});
      return;
    }
    if (offerReportId && intent === "negotiate") {
      sendMessage(`请基于已保存的 Offer 报告 offerReportId=${offerReportId} 生成谈判策略。优先调用 generate_offer_negotiation_strategy，不要重新评估 Offer。`, undefined, { hideUserMessage: true }).catch(() => {});
      return;
    }
    if (offerReportId && intent === "ask_hr") {
      sendMessage(`请基于已保存的 Offer 报告 offerReportId=${offerReportId} 生成 HR 问询清单。优先调用 generate_offer_hr_question_list，不要重新评估 Offer。`, undefined, { hideUserMessage: true }).catch(() => {});
      return;
    }
    if (offerReportId) {
      sendMessage(`请读取并解释已保存的 Offer 报告 offerReportId=${offerReportId}。优先调用 read_offer_report，不要重新评估 Offer。`, undefined, { hideUserMessage: true }).catch(() => {});
    }
  }, [mounted, streaming, currentSessionId, searchParams, sendMessage]);

  const handleSelectSession = useCallback(async (id: number) => {
    if (id === currentSessionId) return;
    // Save current session
    if (currentSessionId) {
      const currentSession = await getSession(currentSessionId);
      if (currentSession) {
        await updateSession(currentSessionId, { messages });
      }
    }
    // Trigger profile update before switching
    triggerProfileUpdate({ force: true }).catch(() => {});

    // Abort streaming
    abortRef.current?.abort();
    setStreaming(false);
    setPhase(null);
    setActiveAgent(null);

    // Load selected session
    const session = await getSession(id);
    if (session) {
      setCurrentSessionId(id);
      setMessages(session.messages);
      setStreamText("");
      setThinkingContent("");
      streamContentRef.current = "";
    }
  }, [currentSessionId, messages]);

  const handleDeleteSession = useCallback(async (id: number) => {
    const session = await getSession(id);
    if (!session) return;
    await softDeleteSession(id);
    setUndoToast({ id, title: session.title });

    // Trigger profile update after deleting session
    triggerProfileUpdate({ force: true }).catch(() => {});

    // If deleting current session, switch to another
    if (id === currentSessionId) {
      const remaining = await listSessions();
      if (remaining.length > 0) {
        setCurrentSessionId(remaining[0].id!);
        setMessages(remaining[0].messages);
      } else {
        const newId = await createSession([WELCOME]);
        setCurrentSessionId(newId);
        setMessages([WELCOME]);
      }
    }
    setSessions(await listSessions());
  }, [currentSessionId]);

  const handleUndoDelete = useCallback(async (id: number) => {
    await undoDeleteSession(id);
    setUndoToast(null);
    setSessions(await listSessions());
    // If no current session (deleted was the only one), select restored
    if (!currentSessionId) {
      const session = await getSession(id);
      if (session) {
        setCurrentSessionId(id);
        setMessages(session.messages);
      }
    }
  }, [currentSessionId]);

  const handlePinSession = useCallback(async (id: number, pinned: boolean) => {
    await pinSession(id, pinned);
    setSessions(await listSessions());
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-96 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (sessionLoadError) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-soft)]">
        会话数据加载失败：{sessionLoadError}
      </div>
    );
  }

  const currentSession = currentSessionId
    ? sessions.find((session) => session.id === currentSessionId)
    : undefined;

  return (
    <div className="flex h-[calc(100vh-(var(--space-section)*2))] min-h-[560px] max-h-[calc(100vh-(var(--space-section)*2))] flex-1 gap-0 overflow-hidden">
      {/* Desktop SessionList Sidebar (>=1280px) */}
      <div className="hidden h-full w-[220px] flex-shrink-0 overflow-hidden border-r border-[var(--color-divider)] bg-[var(--color-bg)]/50 pr-3 lg:flex">
        <SessionList
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleDeleteSession}
          onUndoDelete={handleUndoDelete}
          onPin={handlePinSession}
          showUndoToast={undoToast}
        />
      </div>

      {/* Mobile SessionList Drawer */}
      <AnimatePresence>
        {sessionSidebarOpen && (
          <motion.aside
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            className="lg:hidden fixed left-0 top-0 bottom-0 z-40 bg-[var(--color-surface)] border-r border-[var(--color-divider)] w-[280px] overflow-hidden"
          >
            <SessionList
              sessions={sessions}
              currentSessionId={currentSessionId}
              onSelect={(id) => {
                handleSelectSession(id);
                setSessionSidebarOpen(false);
              }}
              onNew={() => {
                handleNewSession();
                setSessionSidebarOpen(false);
              }}
              onDelete={handleDeleteSession}
              onUndoDelete={handleUndoDelete}
              onPin={handlePinSession}
              showUndoToast={undoToast}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div className="ml-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ cursor: "default" }}>
        {/* Header + Tab bar */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-divider)] pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSessionSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg)] text-[var(--color-muted)]"
              title="会话列表"
            >
              <Menu size={18} />
            </button>
            <div>
              <p className="text-[var(--color-muted)] text-sm mb-1">
                AI 求职伙伴
              </p>
              <div className="flex items-center gap-2">
                <HandwritingTitle as="h1">纸鸢 Agent</HandwritingTitle>
                {activeAgent && activeAgent.id !== "general" && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Bot size={12} />
                    {activeAgent.name}
                    <button
                      onClick={() => setActiveAgent(null)}
                      className="ml-1 hover:text-blue-800 dark:hover:text-blue-200"
                      title="退出当前模式"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              在线
            </span>
            <Link
              href="/profile"
              className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
              title="求职档案"
            >
              <User size={16} />
            </Link>
            <WarmButton
              variant="ghost"
              size="sm"
              onClick={handleNewSession}
              disabled={streaming}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mr-1">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              新建对话
            </WarmButton>
          </div>
        </div>

        {/* AgentChat */}
        <AgentChat
          messages={messages}
          streaming={streaming}
          streamText={streamText}
          phase={phase}
          executingTool={executingTool}
          thinkingContent={thinkingContent}
          activeAgentId={activeAgent?.id}
          startTime={startTime}
          evalProgress={evalProgress}
          completionInfo={completionInfo}
          resultQuality={resultQuality}
          interviewState={currentSession?.interviewState}
          suggestions={activeAgent?.suggestions?.length ? activeAgent.suggestions.map(s => ({ icon: null as unknown as React.ReactNode, label: s.label, prompt: s.prompt })) : DEFAULT_SUGGESTIONS}
          onSend={sendMessage}
          onStop={handleStopStreaming}
          emptyState={null}
        />
      </div>

    </div>
  );
}

/* ── Page export with Suspense boundary ── */

export default function AgentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-pulse">
          <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
          <div className="h-96 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
        </div>
      }
    >
      <AgentPageInner />
    </Suspense>
  );
}

