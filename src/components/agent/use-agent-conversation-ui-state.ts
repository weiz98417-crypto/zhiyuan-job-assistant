"use client";

/**
 * Agent Conversation 的界面状态(spec 35 第二片抽出):纯展示 state,
 * 不含任何业务判断;生命周期主干经同名解构继续使用。
 */
import { useState } from "react";
import type { EvalBlockProgress, CompletionInfo } from "@/components/agent/AgentChat";
import type { AnalystCanvasPayload } from "@/components/agent/AnalystCanvas";
import type { AgentPhase } from "./use-agent-conversation-helpers";

export function useAgentConversationUiState() {
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [phase, setPhase] = useState<AgentPhase>(null);
  const [executingTool, setExecutingTool] = useState<string | undefined>(undefined);
  const [thinkingContent, setThinkingContent] = useState<string>("");
  const [startTime, setStartTime] = useState<number | undefined>(undefined);
  const [undoToast, setUndoToast] = useState<{ id: number; title: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [evalProgress, setEvalProgress] = useState<EvalBlockProgress[]>([]);
  const [programProgress, setProgramProgress] = useState<{ done: number; total: number } | null>(null);
  const [analystCanvas, setAnalystCanvas] = useState<{ open: boolean; maximized: boolean; payload: AnalystCanvasPayload | null }>({ open: false, maximized: false, payload: null });
  const [completionInfo, setCompletionInfo] = useState<CompletionInfo | null>(null);
  const [resultQuality, setResultQuality] = useState<string | null>(null);
  return {
    streaming, setStreaming,
    streamText, setStreamText,
    phase, setPhase,
    executingTool, setExecutingTool,
    thinkingContent, setThinkingContent,
    startTime, setStartTime,
    undoToast, setUndoToast,
    mounted, setMounted,
    evalProgress, setEvalProgress,
    programProgress, setProgramProgress,
    analystCanvas, setAnalystCanvas,
    completionInfo, setCompletionInfo,
    resultQuality, setResultQuality,
  };
}
