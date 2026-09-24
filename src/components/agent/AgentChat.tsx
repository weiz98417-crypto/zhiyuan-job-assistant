"use client";

/**
 * AgentChat — assistant-ui 换芯后的聊天壳(0.11.0-D2,ADR-0031)。
 *
 * 通用聊天问题(滚动、输入、IME、可达性)由 @assistant-ui/react 的
 * ExternalStoreRuntime 模式承担;消息源仍是 page.tsx 的合并层
 * (mergeServerTranscript 输出),worker 是唯一写者,Run 状态驱动运行态。
 * 领域卡片见 AgentDomainCards / assistant-ui/AgentToolCards。
 *
 * 语义冻结:不提供 onEdit/onReload/分支回调(durable Run 不可变)。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantRuntimeProvider, useExternalStoreRuntime, useAui } from "@assistant-ui/react";
import type { AppendMessage } from "@assistant-ui/react";
import type { AgentMessage, InterviewSessionState } from "@/types";
import type { AgentArtifactRef } from "@/lib/agent/task-journey";
import { isRunActive, appendMessageToSubmission, convertTranscript, type AgentPhase } from "./assistant-chat";
import { EvalCompletionNotice, InterviewBindingBar } from "./AgentDomainCards";
import type { CompletionInfo, EvalBlockProgress } from "./AgentDomainCards";
import AgentActivityTrack from "./AgentActivityTrack";
import SuggestionChips from "./SuggestionChips";
import type { SuggestionChip } from "./SuggestionChips";
import { AgentShellActionsContext } from "./assistant-ui/AgentToolCards";
import { AgentThreadMessages } from "./assistant-ui/AgentThreadMessages";
import { AgentComposer, type ComposerAttachment } from "./assistant-ui/AgentComposer";

export type { CompletionInfo, EvalBlockProgress } from "./AgentDomainCards";
export type { AgentPhase } from "./assistant-chat";

const MAX_IMAGES = 5;
const VALID_FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const ACTIVITY_RUN_STATUSES = new Set([
  "queued",
  "running",
  "waiting_user",
  "recovering",
  "verifying",
  "cancel_requested",
  "paused",
]);

interface AgentChatProps {
  currentSessionId: number | null;
  /** mergeServerTranscript 合并层输出的对话投影(worker 为唯一写者)。 */
  messages: AgentMessage[];
  streaming: boolean;
  phase: AgentPhase;
  thinkingContent?: string;
  /** Timestamp when current agent run started (for elapsed timer) */
  startTime?: number;
  /** Per-block evaluation progress (from stream events) */
  evalProgress?: EvalBlockProgress[];
  /** Evaluation completion info (after persist) */
  completionInfo?: CompletionInfo | null;
  /** Tool result quality (good/empty/irrelevant/garbled) — drives verification indicator */
  resultQuality?: string | null;
  /** Durable Run state used by the activity track. */
  runStatus?: string;
  /** Safe versioned materials bound to the current Run. */
  contextArtifacts?: AgentArtifactRef[];
  /** Active mock interview binding from the persisted chat session. */
  interviewState?: InterviewSessionState;

  suggestions?: SuggestionChip[];
  onSend: (content: string, images?: string[]) => Promise<void>;
  onGateDecision?: (gateId: string, decision: "approved" | "denied") => Promise<void>;
  onStop?: () => void;
  emptyState: React.ReactNode;
}

type PendingImage = ComposerAttachment;

interface ChatDraft {
  input: string;
  images: PendingImage[];
  evalPlaceholder: boolean;
}

const EMPTY_CHAT_DRAFT: ChatDraft = { input: "", images: [], evalPlaceholder: false };

export default function AgentChat({
  currentSessionId,
  messages,
  streaming,
  phase,
  thinkingContent,
  startTime,
  evalProgress,
  completionInfo,
  resultQuality,
  runStatus,
  contextArtifacts,
  interviewState,
  suggestions,
  onSend,
  onGateDecision,
  onStop,
  emptyState,
}: AgentChatProps) {
  const isRunning = isRunActive(streaming, phase);
  const draftKey = currentSessionId === null ? "new" : String(currentSessionId);
  const [draftsBySession, setDraftsBySession] = useState<Record<string, ChatDraft>>({});
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const draft = draftsBySession[draftKey] || EMPTY_CHAT_DRAFT;
  const hasRealChat = messages.some((m) => m.role === "user");

  const updateDraft = useCallback((key: string, update: (current: ChatDraft) => ChatDraft) => {
    setDraftsBySession((current) => ({ ...current, [key]: update(current[key] || EMPTY_CHAT_DRAFT) }));
  }, []);

  /* ── 附件 ── */
  const addFiles = useCallback(async (files: File[]) => {
    const newItems: PendingImage[] = [];
    for (const file of files) {
      if (!VALID_FILE_TYPES.includes(file.type)) continue;
      if (file.size > 5 * 1024 * 1024) continue;
      if (newItems.length >= MAX_IMAGES) break;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const base64 = await toBase64(file);
      const previewUrl = file.type === "application/pdf" ? "" : base64;
      newItems.push({ id, base64, previewUrl, name: file.name, size: file.size, type: file.type });
    }
    if (newItems.length === 0) return;
    updateDraft(draftKey, (current) => ({ ...current, images: [...current.images, ...newItems].slice(0, MAX_IMAGES) }));
  }, [draftKey, updateDraft]);

  // Ctrl+V 粘贴截图(与旧壳一致:body 或输入框为落点)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (e.target !== document.body && e.target !== textareaRef.current) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) void addFiles(files);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [addFiles]);

  /* ── Runtime 接线(任务 2.2/2.3) ── */
  const threadMessages = useMemo(
    () => convertTranscript(messages, { isRunning, idPrefix: `s${currentSessionId ?? "new"}` }),
    [messages, isRunning, currentSessionId],
  );
  const runtime = useExternalStoreRuntime({
    // isRunning = streaming && phase 活跃(任务 2.2;phase==="done" 或等待用户时不运行)
    isRunning,
    messages: threadMessages,
    convertMessage: (message) => message,
    onNew: async (message: AppendMessage) => {
      const { content, images } = appendMessageToSubmission(message);
      // adapter 经 useExternalStoreRuntime 的 setAdapter effect 与最新渲染保持同步,
      // 闭包读到的 draft 即当次提交可见的附件。
      const attachments = draft.images;
      const outgoingImages = [...images, ...attachments.map((item) => item.base64)];
      const outgoingInput = content;
      const outgoingEvalPlaceholder = draft.evalPlaceholder;
      updateDraft(draftKey, () => EMPTY_CHAT_DRAFT);
      setSendErrors((current) => ({ ...current, [draftKey]: "" }));
      try {
        await onSend(content, outgoingImages.length > 0 ? outgoingImages : undefined);
      } catch {
        // 发送失败:文本/附件回填,与旧壳一致
        runtime.thread.composer.setText(outgoingInput);
        updateDraft(draftKey, (current) => ({
          ...current,
          images: [...attachments, ...current.images].slice(0, MAX_IMAGES),
          evalPlaceholder: outgoingEvalPlaceholder || current.evalPlaceholder,
        }));
        setSendErrors((current) => ({ ...current, [draftKey]: "消息发送失败，内容已保留，请重试。" }));
      }
    },
    onCancel: async () => {
      onStop?.();
    },
    // 任务 2.3:不注册 onEdit/onReload/分支回调 —— durable Run 不可变。
  });

  const actions = useMemo(
    () => ({ currentSessionId, onSend, onGateDecision }),
    [currentSessionId, onSend, onGateDecision],
  );

  const handleChipSelect = (prompt: string, label: string) => {
    updateDraft(draftKey, (current) => ({ ...current, input: prompt, evalPlaceholder: label === "评估JD" }));
    // 输入文本由 composer runtime 持有;chip 直接写入,旧壳语义为「选中即填入输入框」。
    runtime.thread.composer.setText(prompt);
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AgentShellActionsContext.Provider value={actions}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <InterviewBindingBar state={interviewState} />

          {/* Messages(滚动与粘底由 Viewport 承担) */}
          <AgentThreadMessages />

          {/* 运行轨道/完成提示/空态:随消息流滚动,与旧壳位置一致 */}
          <div className="px-0">
            {(streaming || (runStatus && ACTIVITY_RUN_STATUSES.has(runStatus))) && (
              <div className="pb-2">
                <AgentActivityTrack
                  streaming={streaming}
                  status={runStatus}
                  phase={phase}
                  thinkingContent={thinkingContent}
                  startTime={startTime}
                  artifacts={contextArtifacts}
                  evalProgress={evalProgress}
                  resultQuality={resultQuality}
                />
              </div>
            )}
            {!streaming && completionInfo && (
              <div className="pb-2">
                <EvalCompletionNotice info={completionInfo} />
              </div>
            )}
            {!hasRealChat && !streaming && emptyState}
          </div>

          {/* Input area */}
          <div className="mt-auto">
            {suggestions && !hasRealChat && !streaming && (
              <div className="mb-3">
                <SuggestionChips
                  suggestions={suggestions}
                  disabled={streaming}
                  onSelect={(prompt, label) => handleChipSelect(prompt, label)}
                />
              </div>
            )}
            <AgentComposer
              attachments={draft.images}
              onAddFiles={(files) => void addFiles(files)}
              onRemoveAttachment={(id) =>
                updateDraft(draftKey, (current) => ({ ...current, images: current.images.filter((item) => item.id !== id) }))
              }
              streaming={streaming}
              onStop={onStop}
              maxAttachments={MAX_IMAGES}
              evalPlaceholder={draft.evalPlaceholder}
              textareaRef={textareaRef}
            />
            {sendErrors[draftKey] && <p role="alert" className="mt-1 text-xs text-red-600">{sendErrors[draftKey]}</p>}
          </div>

          {/* 跨会话草稿:文本随 composer,附件/占位随 draftsBySession */}
          <ComposerDraftSync
            draftKey={draftKey}
            readDraft={() => draftsBySession[draftKey] || EMPTY_CHAT_DRAFT}
            writeDraft={(key, input) => updateDraft(key, (current) => ({ ...current, input }))}
            restoreDraft={draft}
          />
        </div>
      </AgentShellActionsContext.Provider>
    </AssistantRuntimeProvider>
  );
}

/**
 * 会话切换时保留输入草稿(与旧壳 draftsBySession 语义一致):
 * 文本经 composer.setText 换入换出,附件与 evalPlaceholder 已在 shell 状态里。
 */
function ComposerDraftSync({
  draftKey,
  readDraft,
  writeDraft,
  restoreDraft,
}: {
  draftKey: string;
  readDraft: (key: string) => ChatDraft;
  writeDraft: (key: string, input: string) => void;
  restoreDraft: ChatDraft;
}) {
  const aui = useAui();
  const previousKeyRef = useRef(draftKey);
  const handlersRef = useRef({ readDraft, writeDraft });

  useEffect(() => {
    handlersRef.current = { readDraft, writeDraft };
  });

  useEffect(() => {
    const previousKey = previousKeyRef.current;
    if (previousKey === draftKey) return;
    previousKeyRef.current = draftKey;
    const outgoingText = aui.composer.getState().text ?? "";
    if (outgoingText.trim()) handlersRef.current.writeDraft(previousKey, outgoingText);
    const incoming = handlersRef.current.readDraft(draftKey);
    aui.composer.setText(incoming.input);
  }, [draftKey, aui]);

  // 首次挂载时恢复当前会话草稿
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (restoreDraft.input) aui.composer.setText(restoreDraft.input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
