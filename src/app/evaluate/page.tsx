"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, BookOpen, ArrowRight, Bot, Sparkles } from "lucide-react";
import { HandwritingTitle, WarmButton, PaperCard } from "@/components/design";
import { StaggerList, StaggerItem } from "@/components/design/PageTransition";
import db from "@/lib/db";
import { getAllJDs } from "@/lib/jd-storage";

export default function EvaluatePage() {
  const [jdCount, setJdCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [avgScore, setAvgScore] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    async function load() {
      const jds = await getAllJDs();
      const reports = await db.reports.toArray();
      setJdCount(jds.length);
      setReportCount(reports.length);
      const scored = reports.filter((r) => r.overallScore > 0);
      setAvgScore(
        scored.length > 0
          ? Math.round((scored.reduce((s, r) => s + r.overallScore, 0) / scored.length) * 10) / 10
          : 0
      );
      setMounted(true);
    }
    load();
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-24 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  const hasData = jdCount > 0 || reportCount > 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[var(--color-muted)] text-sm mb-2">管理评估产物</p>
        <HandwritingTitle as="h1">JD 管理</HandwritingTitle>
        <p className="text-[var(--color-text-soft)] text-sm mt-2">
          浏览和管理已评估的 JD 和生成报告。新的评估请在 Agent 对话中进行。
        </p>
      </div>

      {/* Go to Agent CTA */}
      <Link href="/agent" className="block">
        <PaperCard hover="lift" padding="md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
              <Bot size={18} className="text-[var(--color-surface-raised)]" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[var(--color-text)] text-sm">前往 Agent Chat 评估新 JD</p>
              <p className="text-xs text-[var(--color-text-soft)] mt-0.5">
                粘贴 JD 文本/链接，或上传截图，Agent 会实时分析
              </p>
            </div>
            <ArrowRight size={18} className="text-[var(--color-muted)]" />
          </div>
        </PaperCard>
      </Link>

      {/* Stats overview */}
      {hasData ? (
        <StaggerList className="grid gap-4 sm:grid-cols-3">
          <StaggerItem>
            <Link href="/evaluate/jds">
              <PaperCard hover="lift" padding="md">
                <FileText size={20} className="text-[var(--color-primary)] mb-3" />
                <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
                  {jdCount}
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-1">JD 库</p>
              </PaperCard>
            </Link>
          </StaggerItem>
          <StaggerItem>
            <Link href="/evaluate/reports">
              <PaperCard hover="lift" padding="md">
                <BookOpen size={20} className="text-[var(--color-primary)] mb-3" />
                <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
                  {reportCount}
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-1">报告库</p>
              </PaperCard>
            </Link>
          </StaggerItem>
          <StaggerItem>
            <PaperCard padding="md">
              <Sparkles size={20} className="text-[var(--color-primary)] mb-3" />
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
                {avgScore || "—"}
              </p>
              <p className="text-sm text-[var(--color-muted)] mt-1">平均评分</p>
            </PaperCard>
          </StaggerItem>
        </StaggerList>
      ) : (
        <div className="text-center py-12 space-y-4">
          <Sparkles size={28} className="text-[var(--color-muted)] mx-auto" />
          <p className="text-[var(--color-muted)] text-sm">
            还没有评估记录。前往 Agent Chat 开始第一次评估 →
          </p>
          <Link href="/agent">
            <WarmButton variant="soft" size="sm">
              去评估
              <ArrowRight size={14} className="ml-1.5" />
            </WarmButton>
          </Link>
        </div>
      )}
    </div>
  );
}
