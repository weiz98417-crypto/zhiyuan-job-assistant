"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  MessageSquare,
  AlertTriangle,
  Send,
  Save,
  CheckCircle2,
} from "lucide-react";
import { PaperCard, WarmButton } from "@/components/design";
import type {
  InterviewQuestion,
  CoachMode,
  CoachMessage,
  PracticeRecord,
} from "@/types";
import { COACH_MODES } from "@/types";

interface PracticePanelProps {
  question: InterviewQuestion | null;
  jdSummary: string;
  cvSummary: string;
  mode: CoachMode;
  onBack: () => void;
  onSaved: (record: PracticeRecord) => void;
  isRePractice?: boolean;
}

export default function PracticePanel({
  question,
  jdSummary,
  cvSummary,
  mode,
  onBack,
  onSaved,
  isRePractice = false,
}: PracticePanelProps) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingSections, setStreamingSections] = useState<
    { key: string; label: string; content: string }[]
  >([]);
  const [followUps, setFollowUps] = useState<{ question: string; hint: string }[]>([]);
  const [riskWarnings, setRiskWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingSections]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [question]);

  const trimMessages = (msgs: CoachMessage[]): CoachMessage[] => {
    const MAX_PAIRS = 8;
    const nonSystem = msgs.filter((m) => m.role !== "system");
    if (nonSystem.length <= MAX_PAIRS * 2) return msgs;
    const systemMsgs = msgs.filter((m) => m.role === "system");
    const recent = nonSystem.slice(-(MAX_PAIRS * 2));
    return [...systemMsgs.slice(-1), ...recent];
  };

  const parseSSEStream = async (
    res: Response,
    onSection: (s: { key: string; label: string; content: string }) => void,
    onFollowUps: (q: { question: string; hint: string }[], rw: string[]) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let lineBuf = "";
    let currentEvent = "";
    let currentData = "";

    const flushEvent = () => {
      if (!currentEvent || !currentData) return;
      try {
        const parsed = JSON.parse(currentData);
        switch (currentEvent) {
          case "section":
            onSection({
              key: parsed.key || "",
              label: parsed.label || "",
              content: parsed.content || "",
            });
            break;
          case "followUps":
            onFollowUps(parsed.questions || [], parsed.riskWarnings || []);
            break;
          case "done":
            onDone();
            break;
          case "error":
            onError(parsed.error || "未知错误");
            break;
        }
      } catch {
        // skip unparseable data
      }
      currentEvent = "";
      currentData = "";
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuf += decoder.decode(value, { stream: true });
        const lines = lineBuf.split("\n");
        lineBuf = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // flush previous event if any
            flushEvent();
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6).trim();
          } else if (line === "") {
            // empty line = SSE event boundary
            flushEvent();
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    // Flush any remaining event in buffer
    flushEvent();
    // If we get here without done event, still call onDone
    onDone();
  };

  const runChat = useCallback(
    async (userContent: string, existingMessages?: CoachMessage[]) => {
      const baseMessages = existingMessages ?? messages;
      const userMsg: CoachMessage = { role: "user", content: userContent };
      const sysMsg: CoachMessage = {
        role: "system",
        content: `面试模式: ${COACH_MODES[mode].label}`,
      };
      const allMessages =
        baseMessages.length === 0
          ? [sysMsg, userMsg]
          : [...baseMessages, userMsg];
      const trimmed = trimMessages(allMessages);

      setMessages(trimmed);
      setLoading(true);
      setStreamingSections([]);
      setFollowUps([]);
      setRiskWarnings([]);
      setInput("");

      const sectionsAccum: { key: string; label: string; content: string }[] = [];

      // Build question context
      const questionContext = question
        ? {
            question: question.question,
            context: question.context,
            storyHint: question.storyHint,
            jdSummary,
            cvSummary,
          }
        : undefined;

      try {
        const res = await fetch("/api/interview/coach/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: trimmed,
            mode,
            questionContext,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || "请求失败");
        }

        await parseSSEStream(
          res,
          (section) => {
            sectionsAccum.push(section);
            setStreamingSections([...sectionsAccum]);
          },
          (questions, rw) => {
            setFollowUps(questions);
            setRiskWarnings(rw);
          },
          () => {
            if (sectionsAccum.length > 0) {
              const fullContent = sectionsAccum
                .map((s) => `**${s.label}**\n${s.content}`)
                .join("\n\n");
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: fullContent },
              ]);
            }
            setStreamingSections([]);
          },
          (err) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `❌ ${err}` },
            ]);
          },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "流式请求失败";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${msg}` },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, mode, question, jdSummary, cvSummary],
  );

  const handleSend = () => {
    if (!input.trim() || loading) return;
    runChat(input.trim());
  };

  const handleFollowUpClick = (fuq: string) => {
    const msg = `请现在切换为面试官角色，向我提出以下追问：\n\n「${fuq}」\n\n只需要提出问题，不要帮我准备答案。等我回答后，再切换回教练角色对我的回答进行评分和指导。`;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "user" && lastMsg.content === msg) return;
    setFollowUps([]);
    setRiskWarnings([]);
    runChat(msg);
  };

  const handleSave = () => {
    if (!question) return;
    const userMsgs = messages.filter((m) => m.role === "user");
    if (userMsgs.length === 0) return;
    const answer = userMsgs.map((m) => m.content).join("\n\n");
    const record: PracticeRecord = {
      question: question.question,
      questionCategory: question.category,
      answer,
      jdCompany: jdSummary ? "关联JD" : undefined,
      tags: [question.category],
      createdAt: new Date(),
    };
    onSaved(record);
    setSaved(true);
  };

  const hasUserMessages = messages.some((m) => m.role === "user");

  const displayMessages = messages.filter((m) => m.role !== "system");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ArrowLeft size={16} />
          返回题目列表
        </button>
      </div>

      {/* Question context bar */}
      {question && (
        <PaperCard padding="sm">
          <div className="flex items-start gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] shrink-0 mt-0.5">
              当前题目
            </span>
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {question.question}
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {question.context}
              </p>
            </div>
          </div>
        </PaperCard>
      )}

      {/* Chat area */}
      <PaperCard padding="md">
        <div className="min-h-[320px] max-h-[480px] overflow-y-auto space-y-4 mb-4">
          {/* Empty state */}
          {displayMessages.length === 0 && !loading && (
            <div className="text-center py-12">
              <MessageSquare size={32} className="mx-auto text-[var(--color-muted)] mb-3" />
              <p className="text-[var(--color-muted)] text-sm">
                在下方输入你的回答，AI 教练会给出结构化反馈
              </p>
            </div>
          )}

          {/* Messages */}
          {displayMessages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-[var(--radius-md)] px-4 py-3 ${
                    isUser
                      ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                      : "bg-[var(--color-divider)] text-[var(--color-text)]"
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : msg.content.startsWith("❌") ? (
                    <span className="text-sm text-red-500">{msg.content}</span>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content.split("\n\n").map((block, j) => {
                        const labelMatch = block.match(/^\*\*(.+?)\*\*\n/);
                        if (labelMatch) {
                          return (
                            <div key={j} className="mb-2">
                              <p className="text-xs font-medium text-[var(--color-primary)] mb-0.5">
                                {labelMatch[1]}
                              </p>
                              <p>{block.slice(labelMatch[0].length)}</p>
                            </div>
                          );
                        }
                        return <p key={j} className="mb-1">{block}</p>;
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Streaming sections */}
          {streamingSections.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-[var(--radius-md)] px-4 py-3 bg-[var(--color-divider)]">
                {streamingSections.map((sec) => (
                  <div key={sec.key} className="mb-2">
                    <p className="text-xs font-medium text-[var(--color-primary)] mb-0.5">
                      {sec.label}
                    </p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {sec.content}
                    </p>
                  </div>
                ))}
                {loading && (
                  <span className="inline-block w-2 h-4 bg-[var(--color-primary)] animate-pulse rounded-sm" />
                )}
              </div>
            </div>
          )}

          {/* Loading spinner (no sections yet) */}
          {loading && streamingSections.length === 0 && (
            <div className="flex justify-start">
              <div className="bg-[var(--color-divider)] rounded-[var(--radius-md)] px-4 py-3">
                <Loader2 size={18} className="animate-spin text-[var(--color-primary)]" />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Follow-up buttons */}
        {followUps.length > 0 && !loading && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium text-[var(--color-muted)] flex items-center gap-1">
              <MessageSquare size={12} />
              面试官可能追问（点击发送）
            </p>
            {followUps.map((fu, i) => (
              <button
                key={i}
                onClick={() => handleFollowUpClick(fu.question)}
                className="w-full text-left p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] hover:bg-[var(--color-divider)] transition-colors group"
              >
                <span className="text-sm text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                  {i + 1}. {fu.question}
                </span>
                <span className="text-xs text-[var(--color-muted)] block mt-0.5">
                  {fu.hint}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Risk warnings */}
        {riskWarnings.length > 0 && !loading && (
          <div className="mb-4 p-3 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50">
            <p className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
              <AlertTriangle size={12} /> 风险提示
            </p>
            <ul className="space-y-0.5">
              {riskWarnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Input area */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              question
                ? "输入你对于这道题的回答..."
                : "描述一段你的真实工作经历..."
            }
            rows={2}
            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
            disabled={loading}
          />
          <WarmButton
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </WarmButton>
        </div>
      </PaperCard>

      {/* Save button — only when user has sent at least one message */}
      {hasUserMessages && question && (
        <div className="flex justify-end">
          <WarmButton
            variant={saved ? "ghost" : "soft"}
            size="sm"
            onClick={handleSave}
            disabled={saved}
          >
            {saved ? (
              <>
                <CheckCircle2 size={14} className="mr-1" />
                已保存
              </>
            ) : (
              <>
                <Save size={14} className="mr-1" />
                保存到题库
              </>
            )}
          </WarmButton>
        </div>
      )}
    </div>
  );
}
