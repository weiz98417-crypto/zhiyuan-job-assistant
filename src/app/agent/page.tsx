"use client";

import { Suspense } from "react";
import Link from "next/link";
import { User, Bot } from "lucide-react";
import { HandwritingTitle, WarmButton } from "@/components/design";
import BrandLogo from "@/components/brand/BrandLogo";
import AgentChat from "@/components/agent/AgentChat";
import { DEFAULT_SUGGESTIONS } from "@/components/agent/SuggestionChips";
import type { SuggestionChip } from "@/components/agent/SuggestionChips";
import AgentPhaseTrack from "@/components/agent/assistant-ui/AgentPhaseTrack";
import { AgentRunToolbar, RollbackProposalBanner } from "@/components/agent/AgentRunToolbar";
import { AnalystCanvas } from "@/components/agent/AnalystCanvas";
import { Group as ResizeGroup, Panel as ResizePanel, Separator as ResizeSeparator } from "react-resizable-panels";
import SessionList from "@/components/agent/SessionList";
import { WorkbenchRailPortal, useWorkbenchRailControls } from "@/components/shell/WorkbenchShell";
import { useAgentConversation } from "@/components/agent/use-agent-conversation";

export type { CompletionInfo, EvalBlockProgress } from "@/components/agent/AgentDomainCards";
export type { AgentPhase } from "@/components/agent/assistant-chat";

function AgentPageInner() {
  const {
    searchParams,
    messages,
    setMessages,
    streaming,
    setStreaming,
    streamText,
    setStreamText,
    phase,
    setPhase,
    executingTool,
    setExecutingTool,
    thinkingContent,
    setThinkingContent,
    startTime,
    setStartTime,
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    undoToast,
    setUndoToast,
    mounted,
    setMounted,
    activeAgent,
    setActiveAgent,
    agentSwitchedAt,
    setAgentSwitchedAt,
    evalProgress,
    setEvalProgress,
    programProgress,
    setProgramProgress,
    analystCanvas,
    setAnalystCanvas,
    completionInfo,
    setCompletionInfo,
    resultQuality,
    setResultQuality,
    sessionLoadError,
    setSessionLoadError,
    storedRunNotice,
    setActiveRunNotice,
    activeRunNotice,
    activeRunAction,
    setActiveRunAction,
    latestRollbackProposal,
    setLatestRollbackProposal,
    rollbackAction,
    setRollbackAction,
    abortRef,
    streamContentRef,
    interviewBootstrapRef,
    seenSignalKeys,
    seenSignalSessionRef,
    handoffKeyRef,
    handoffSessionCreateKeyRef,
    createdHandoffSessionIdRef,
    manualSessionSwitchRef,
    durableRunCursorsRef,
    pendingRunInputRef,
    currentSessionIdRef,
    sessionGenerationRef,
    observerGenerationRef,
    turnGenerationRef,
    itemAssemblerRef,
    itemSequenceRef,
    turnItemPrefixRef,
    rafRef,
    clearSessionActivity,
    makeSessionTitle,
    generateMemoryDigestWithStatus,
    renameSessionFromFirstUserMessage,
    appendAssistantStatusMessage,
    handleGateDecision,
    refreshLatestRollbackProposal,
    clearConsumedHandoffParams,
    replaceUrlForSelectedSession,
    handleResumeActiveRun,
    handlePauseActiveRun,
    handleRollbackLatestProposal,
    handleCancelActiveRun,
    sendMessage,
    handleStopStreaming,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoDelete,
    handlePinSession,
    currentSession,
    showActiveRunToolbar,
    displayMessages,
  } = useAgentConversation();
  const { closeMobileRail } = useWorkbenchRailControls();
  const journeyRailNode = (
    <SessionList
      sessions={sessions}
      currentSessionId={currentSessionId}
      onSelect={(id) => {
        handleSelectSession(id);
        closeMobileRail();
      }}
      onNew={() => {
        handleNewSession();
        closeMobileRail();
      }}
      onDelete={handleDeleteSession}
      onUndoDelete={handleUndoDelete}
      onPin={handlePinSession}
      showUndoToast={undoToast}
    />
  );

  return (
    <>
    <WorkbenchRailPortal>{journeyRailNode}</WorkbenchRailPortal>
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 gap-0 overflow-hidden">
      {/* Chat Area(旅程栏已由 WorkbenchShell rail slot 承接) */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ cursor: "default" }}>
        {/* Header + Tab bar */}
        <div className="flex flex-shrink-0 flex-col items-stretch gap-3 border-b border-[var(--color-divider)] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div>
              <p className="text-[var(--color-muted)] text-sm mb-1">
                AI 求职伙伴
              </p>
              <div className="flex items-center gap-2">
                <BrandLogo variant="mark" size="sm" />
                <HandwritingTitle as="h1" className="truncate">纸鸢 Agent</HandwritingTitle>
                {activeAgent && activeAgent.id !== "general" && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary-hover)] dark:text-[var(--color-primary)]"
                    title={agentSwitchedAt ? "本轮由事件方言 agent_switch 决定主责" : "当前主责"}
                  >
                    <Bot size={12} />
                    {activeAgent.name}
                    {agentSwitchedAt && Date.now() - agentSwitchedAt < 5 * 60 * 1000 ? " · 刚刚交接" : ""}
                    <button
                      onClick={() => {
                        setActiveAgent(null);
                        setAgentSwitchedAt(null);
                      }}
                      className="ml-1 opacity-60 hover:opacity-100"
                      title="退出当前模式"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
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
              disabled={streaming && !activeRunNotice}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mr-1">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              新建对话
            </WarmButton>
          </div>
        </div>

        {/* 样张 v2 对话脸:阶段轨道(✓理解/●执行/校验/回应 + 判据 n/m),仅 Run 活跃时渲染 */}
        <div className="mt-2">
          <AgentPhaseTrack phase={phase} streaming={streaming} criteria={programProgress} />
        </div>

        {activeRunNotice && showActiveRunToolbar && (
          <AgentRunToolbar
            status={activeRunNotice.status}
            phase={activeRunNotice.phase}
            artifacts={activeRunNotice.artifacts}
            action={activeRunAction}
            onResume={handleResumeActiveRun}
            onPause={handlePauseActiveRun}
            onCancel={handleCancelActiveRun}
          />
        )}

        {latestRollbackProposal && (
          <RollbackProposalBanner
            sectionId={latestRollbackProposal.sectionId}
            updatedAt={latestRollbackProposal.updatedAt}
            rollingBack={rollbackAction === "rollback"}
            disabled={streaming || rollbackAction !== null}
            onRollback={handleRollbackLatestProposal}
          />
        )}

        {/* 0.12.0 双面画布:对话脸 + 分析面(分析面可拖宽;对话脸恒定窄列是 ADR-0037 语义;最大化脱离分栏独占整行) */}
        {(() => {
          const chatElement = (
          <AgentChat
          currentSessionId={currentSessionId}
          messages={displayMessages}
          streaming={streaming}
          phase={phase}
          thinkingContent={thinkingContent}
          startTime={startTime}
          evalProgress={evalProgress}
          completionInfo={completionInfo}
          resultQuality={resultQuality}
          runStatus={activeRunNotice?.status}
          contextArtifacts={activeRunNotice?.artifacts}
          interviewState={currentSession?.interviewState}
          suggestions={activeAgent?.suggestions?.length ? activeAgent.suggestions.map(s => ({ icon: null as unknown as React.ReactNode, label: s.label, prompt: s.prompt })) : DEFAULT_SUGGESTIONS}
          onSend={sendMessage}
          onGateDecision={handleGateDecision}
          onStop={handleStopStreaming}
          emptyState={null}
          />
          );
          const canvasElement = (
          <AnalystCanvas
            payload={analystCanvas.payload}
            maximized={analystCanvas.maximized}
            onClose={() => setAnalystCanvas((current) => ({ ...current, open: false, maximized: false }))}
            onMaximize={() => setAnalystCanvas((current) => ({ ...current, maximized: !current.maximized }))}
          />
          );
          if (analystCanvas.open && analystCanvas.maximized) {
            return <div className="flex min-h-0 flex-1">{canvasElement}</div>;
          }
          if (analystCanvas.open) {
            return (
              <ResizeGroup orientation="horizontal" className="flex min-h-0 flex-1">
                <ResizePanel defaultSize="62%" minSize="36%" className="flex min-h-0 min-w-0 flex-col">
                  {chatElement}
                </ResizePanel>
                <ResizeSeparator className="w-1.5 rounded-full bg-transparent transition-colors hover:bg-[var(--color-primary-muted)]" />
                <ResizePanel defaultSize="38%" minSize="24%" className="flex min-h-0 min-w-0">
                  {canvasElement}
                </ResizePanel>
              </ResizeGroup>
            );
          }
          return <div className="flex min-h-0 flex-1">{chatElement}</div>;
        })()}

        {/* ⌘K 命令面板已由 WorkbenchShell 全局承载(0.12.0 S1) */}
      </div>

    </div>
    </>
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
