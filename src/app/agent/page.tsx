"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
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
import type { AgentMessage, AgentInteraction, ChatSession } from "@/types";


/* ── Agent phase ── */

type AgentPhase = "understanding" | "executing" | "verifying" | "reflecting" | "responding" | "done" | "extracting_ocr" | "extracting_jd" | "jd_extracted" | "detecting_archetype" | "archetype_detected" | null;

/* ── Welcome message ── */

const WELCOME: AgentMessage = {
  role: "assistant",
  content:
    "你好！我是纸鸢，你的 AI 求职伙伴 🪁\n\n我可以帮你：\n• 查询投递记录和 Pipeline 状态\n• 评估职位 JD 和 Offer\n• 根据你的画像推荐岗位\n• 生成定制化简历\n• 导出求职报告\n\n也可以和你聊聊职业方向，帮你理清思路。\n\n直接告诉我你需要什么，或者随便聊聊吧！",
  timestamp: new Date().toISOString(),
};

/* ── Persistence ── */

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

  const abortRef = useRef<AbortController | null>(null);
  const streamContentRef = useRef("");
  const seenSignalKeys = useRef<Set<string>>(new Set());

  /* ── Detect if user is uploading a resume ── */
  const isResumeUpload = useCallback((content: string, images?: string[]) => {
    const resumeKeywords = /简历|CV|履历|resume|工作经历|教育背景|个人概述|求职意向/;
    if (resumeKeywords.test(content)) return true;
    // Also trigger for image uploads with resume-related prompts
    if (images?.length && content.length < 50) {
      // Short message + image = possibly a resume screenshot
      return true;
    }
    return false;
  }, []);
  const rafRef = useRef<number>(0);

  // rAF loop: copy ref → state at ~60fps for smooth typewriter effect
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
    migrateExploreToAgent().then(async () => {
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
      setMounted(true);
    });
     
  }, []);

  const sendMessage = useCallback(
    async (content: string, images?: string[]) => {
      const userMsg: AgentMessage = {
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      } as AgentMessage;
      if (images?.length) (userMsg as unknown as Record<string, unknown>).images = images;
      const updated = [...messages, userMsg];
      setMessages(updated);

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

      // Show thinking indicator IMMEDIATELY — before potentially slow resume import
      const assistantMsg: AgentMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };
      setMessages([...updated, assistantMsg]);
      streamContentRef.current = "";
      setStreamText("");
      setStreaming(true);
      setPhase("understanding");
      setExecutingTool(undefined);
      setThinkingContent("");
      setStartTime(Date.now());
      setEvalProgress([]);
      setCompletionInfo(null);

      /* ── Resume upload detection ── */
      if (isResumeUpload(content, images)) {
        // Try to import resume from uploaded files
        let resumeSections: Record<string, string> | null = null;
        if (images?.length) {
          try {
            const base64 = images[0];
            const mime = base64.startsWith("data:application/pdf") ? "application/pdf"
              : base64.startsWith("data:image/png") ? "image/png"
              : base64.startsWith("data:image/jpeg") ? "image/jpeg"
              : base64.startsWith("data:image/webp") ? "image/webp"
              : "image/png";
            // Efficient base64 → Blob using fetch (avoids byte-by-byte loop for large files)
            const res = await fetch(base64);
            const blob = await res.blob();
            const formData = new FormData();
            formData.append("file", blob, `resume.${mime.split("/")[1]}`);
            const importRes = await fetch("/api/cv/import", { method: "POST", body: formData });
            const importData = await importRes.json();
            if (importData.success) {
              resumeSections = importData.data.sections as Record<string, string>;
            }
          } catch { /* import failed, continue to normal flow */ }
        }

        if (resumeSections) {
          const sectionText = Object.entries(resumeSections)
            .filter(([, v]) => v)
            .map(([k, v]) => `【${k === "summary" ? "个人概述" : k === "experience" ? "工作经历" : k === "projects" ? "项目经验" : k === "education" ? "教育背景" : k === "skills" ? "技能" : k}】\n${v}`)
            .join("\n\n");
          content = `解析我的简历，填入对应栏位\n\n解析结果：\n${sectionText}\n\n请确认这些内容是否正确，并帮我把它们写入简历。`;
          images = undefined;
        }
      }
      setExecutingTool(undefined);
      setThinkingContent("");
      setStartTime(undefined);
      setEvalProgress([]);
      setCompletionInfo(null);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // ── Client-side orchestration: classify + agentLoopClient ──
        const sessionMessages = updated.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const memoryDigest = currentSessionId
          ? (await getSession(currentSessionId))?.memoryDigest
          : undefined;

        const { agent, systemPrompt, toolWhitelist, tools } = await orchestrate(content, {
          sessionId: currentSessionId,
          messages: sessionMessages,
          memoryDigest,
        });

        setActiveAgent(agent);

        let toolResultInfo: { name: string; result: string; success: boolean; data?: unknown; uiPayload?: Record<string, unknown> } | null = null;
        let assistantText = "";

        const msgList = updated.map((m) => ({ role: m.role, content: m.content }));

        let firstEvent = true;
        for await (const event of agentLoopClient(
          systemPrompt, msgList, undefined, controller.signal, undefined,
          toolWhitelist.length > 0 ? toolWhitelist : undefined, tools,
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
                    toolResult: { uiPayload, data: event.data },
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
                  const toolMsg: AgentMessage = { role: "tool", content: event.result, toolResult: event.result, toolName: event.name, timestamp: new Date().toISOString() };
                  const lastIdx = copy.length - 1;
                  if (copy[lastIdx]?.role === "tool" && copy[lastIdx]?.toolName === event.name) copy[lastIdx] = toolMsg;
                  else copy.push(toolMsg);
                }
                return copy;
              });
              break;
            case "tool_error": console.warn(`[agent] tool error: ${event.name} — ${event.error}`); break;
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
        setStreaming(false);
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
              const fullMessages = [...currentSession.messages];
              // Tag user message with agent_id
              const taggedUserMsg = agent.id !== "general"
                ? { ...userMsg, agent_id: agent.id }
                : userMsg;
              fullMessages.push(taggedUserMsg);
              if (toolResultInfo) {
                fullMessages.push({
                  role: "tool",
                  content: toolResultInfo.result,
                  toolName: toolResultInfo.name,
                  toolResult: toolResultInfo.uiPayload
                    ? { uiPayload: toolResultInfo.uiPayload }
                    : toolResultInfo.name === "get_profile" && toolResultInfo.data
                      ? { data: toolResultInfo.data }
                      : toolResultInfo.result,
                  agent_id: agent.id !== "general" ? agent.id : undefined,
                  timestamp: new Date().toISOString(),
                });
              }
              const taggedAssistant = agent.id !== "general"
                ? { ...finalAssistant, agent_id: agent.id }
                : finalAssistant;
              fullMessages.push(taggedAssistant);

              const isFirstUserMsg = currentSession.messages.filter((m) => m.role === "user").length === 0;
              const userMsgCount = fullMessages.filter((m) => m.role === "user").length;
              const memoryDigest = userMsgCount >= 5 ? generateMemoryDigest(fullMessages) : undefined;

              // Set title from FIRST user message (not current message)
              const needsTitle = isFirstUserMsg || !currentSession.title || currentSession.title === "新对话" || currentSession.title === "新的对话";
              let sessionTitle: string | undefined;
              if (needsTitle) {
                const firstUserMsg = fullMessages.find((m) => m.role === "user");
                const titleText = firstUserMsg ? firstUserMsg.content.trim() : content.trim();
                sessionTitle = titleText.length <= 6 ? titleText : titleText.slice(0, 6) + "...";
              }
              await updateSession(currentSessionId, {
                messages: fullMessages,
                title: sessionTitle,
                memoryDigest: memoryDigest ?? undefined,
              });
              // Refresh sessions list
              setSessions(await listSessions());
            }
          }

          // Auto-trigger profile update after each completed agent exchange
          triggerProfileUpdate({ force: true }).catch(() => {});

          // Best-effort legacy persist
          try { persistMessages([...updated, finalAssistant]); } catch { /* ok */ }
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
    [messages, currentSessionId],
  );

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

  return (
    <div className="flex gap-0 flex-1 min-h-0">
      {/* Desktop SessionList Sidebar (>=1280px) */}
      <div className="hidden lg:flex w-[220px] flex-shrink-0 border-r border-[var(--color-divider)] bg-[var(--color-bg)]/50 overflow-hidden pr-3">
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
      <div className="flex-1 flex flex-col min-w-0 ml-4 mr-2" style={{ cursor: "default" }}>
        {/* Header + Tab bar */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[var(--color-divider)]">
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
          suggestions={activeAgent?.suggestions?.length ? activeAgent.suggestions.map(s => ({ icon: null as unknown as React.ReactNode, label: s.label, prompt: s.prompt })) : DEFAULT_SUGGESTIONS}
          onSend={sendMessage}
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
