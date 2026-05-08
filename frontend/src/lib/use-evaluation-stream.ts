"use client";

import { useState, useRef, useCallback } from "react";

/* ── Types ── */

export interface BlockState {
  status: "pending" | "streaming" | "done" | "error";
  content: string;
  score: number;
  label: string;
}

export interface OCRProgress {
  current: number;
  total: number;
  partialText?: string;
  error?: string;
  notJD?: boolean;
}

export interface SearchResult {
  query: string;
  source: string;
  summary: string;
}

export interface EvalStreamState {
  phase: string;
  source?: string;
  ocrProgress: OCRProgress | null;
  blocks: Record<string, BlockState>;
  searchResults: SearchResult[];
  overallScore: number;
  company: string;
  role: string;
  archetype: string;
  jdText: string;
  reportPath: string;
  error: string | null;
  done: boolean;
}

export interface EvalStreamInput {
  jdText?: string;
  jdUrl?: string;
  images?: string[];
  language?: "zh" | "en";
}

const BLOCK_LABELS: Record<string, string> = {
  a: "A · 职位概览", b: "B · 简历匹配", c: "C · 职级与策略",
  d: "D · 薪资与市场", e: "E · 定制化方案", f: "F · 面试准备", g: "G · 职位合法性",
};

function initialBlocks(): Record<string, BlockState> {
  const r: Record<string, BlockState> = {};
  for (const bk of Object.keys(BLOCK_LABELS)) {
    r[bk] = { status: "pending", content: "", score: 0, label: BLOCK_LABELS[bk] };
  }
  return r;
}

/* ── Hook ── */

export function useEvaluationStream() {
  const [state, setState] = useState<EvalStreamState>({
    phase: "",
    ocrProgress: null,
    blocks: initialBlocks(),
    searchResults: [],
    overallScore: 0,
    company: "",
    role: "",
    archetype: "",
    jdText: "",
    reportPath: "",
    error: null,
    done: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const blocksRef = useRef<Record<string, BlockState>>(initialBlocks());

  const start = useCallback(async (input: EvalStreamInput) => {
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset state
    const freshBlocks = initialBlocks();
    blocksRef.current = freshBlocks;
    setState({
      phase: "connecting", ocrProgress: null, blocks: freshBlocks, searchResults: [],
      overallScore: 0, company: "", role: "", archetype: "", jdText: "",
      reportPath: "", error: null, done: false,
    });

    try {
      const res = await fetch("/api/evaluate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setState((prev) => ({ ...prev, error: err.error || "请求失败", done: true }));
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            handleEvent(evt);
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        error: `连接中断: ${err instanceof Error ? err.message : "未知错误"}`,
        done: true,
      }));
    }
  }, []);

  const handleEvent = useCallback((evt: Record<string, unknown>) => {
    const type = evt.type as string;
    setState((prev) => {
      const next = { ...prev, blocks: { ...prev.blocks } };

      switch (type) {
        case "phase":
          next.phase = evt.phase as string;
          if (evt.company) next.company = evt.company as string;
          if (evt.role) next.role = evt.role as string;
          if (evt.archetype) next.archetype = evt.archetype as string;
          break;

        case "ocr_progress":
          next.ocrProgress = {
            current: evt.current as number,
            total: evt.total as number,
            partialText: evt.partialText as string | undefined,
            error: evt.error as string | undefined,
            notJD: evt.notJD as boolean | undefined,
          };
          break;

        case "block_start": {
          const bk = evt.block as string;
          next.blocks[bk] = { ...next.blocks[bk], status: "streaming", label: evt.label as string || next.blocks[bk].label };
          // Update ref too
          blocksRef.current[bk] = next.blocks[bk];
          break;
        }

        case "block_chunk": {
          const bk = evt.block as string;
          const newContent = blocksRef.current[bk].content + (evt.content as string || "");
          blocksRef.current[bk] = { ...blocksRef.current[bk], content: newContent };
          next.blocks[bk] = blocksRef.current[bk];
          break;
        }

        case "block_done": {
          const bk = evt.block as string;
          blocksRef.current[bk] = { ...blocksRef.current[bk], status: "done" };
          next.blocks[bk] = blocksRef.current[bk];
          break;
        }

        case "score": {
          const bk = evt.block as string;
          blocksRef.current[bk] = { ...blocksRef.current[bk], score: evt.score as number };
          next.blocks[bk] = blocksRef.current[bk];
          break;
        }

        case "overall_score":
          next.overallScore = evt.score as number;
          break;

        case "search_start":
          next.searchResults = [...prev.searchResults, { query: evt.query as string, source: evt.source as string, summary: "" }];
          break;

        case "search_result": {
          const last = next.searchResults[next.searchResults.length - 1];
          if (last) last.summary = evt.summary as string;
          break;
        }

        case "report_saved":
          next.reportPath = evt.path as string;
          break;

        case "error":
          next.error = evt.message as string || null;
          if (evt.block) {
            const bk = evt.block as string;
            blocksRef.current[bk] = { ...blocksRef.current[bk], status: "error", content: `*生成失败: ${evt.message}*` };
            next.blocks[bk] = blocksRef.current[bk];
          }
          break;

        case "done":
          next.done = true;
          next.company = (evt.company as string) || next.company;
          next.role = (evt.role as string) || next.role;
          next.archetype = (evt.archetype as string) || next.archetype;
          next.jdText = (evt.jdText as string) || next.jdText;
          next.overallScore = (evt.overallScore as number) || next.overallScore;
          break;
      }

      return next;
    });
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { state, start, abort };
}
