"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { HandwritingTitle, PaperCard, ScoreBadge } from "@/components/design";
import { StaggerList, StaggerItem } from "@/components/design/PageTransition";
import db from "@/lib/db";
import { normalizeReportBlocks, normalizeReportScores, parseJsonValue } from "@/lib/report-normalize";
import type { EvaluationReport } from "@/types";

export default function EvaluateHistoryPage() {
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/data/reports");
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mapped = json.data.map((r: Record<string, unknown>) => {
            const storedBlocks = parseJsonValue(r.blocks_json, {});
            return {
              id: r.id, reportNum: r.report_num, date: r.date, company: r.company,
              role: r.role, archetype: r.archetype, overallScore: r.overall_score,
              legitimacy: r.legitimacy, blocks: normalizeReportBlocks(storedBlocks),
              keywords: parseJsonValue(r.keywords_json, []),
              scores: normalizeReportScores(storedBlocks), createdAt: r.created_at ? new Date(r.created_at as string) : new Date(),
            };
          });
          setReports(mapped as EvaluationReport[]);
          setMounted(true);
          return;
        }
      } catch { /* fallback */ }
      db.reports.orderBy("createdAt").reverse().toArray().then(setReports).finally(() => setMounted(true));
    }
    load();
  }, []);

  const filtered = reports.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.company.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q) ||
      r.archetype.toLowerCase().includes(q)
    );
  });

  if (!mounted) return null;

  if (reports.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <HandwritingTitle as="h2">还没有评估记录</HandwritingTitle>
        <p className="text-[var(--color-muted)] text-sm">
          评估完 JD 后，报告会保存在这里
        </p>
        <Link
          href="/evaluate"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
        >
          去评估 <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HandwritingTitle as="h1">评估历史</HandwritingTitle>

      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]">
        <Search size={16} className="text-[var(--color-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索公司、岗位或 archetype..."
          className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
        />
      </div>

      <StaggerList className="space-y-2">
        {filtered.map((report) => (
          <StaggerItem key={report.id}>
            <Link href={`/evaluate?id=${report.id}`}>
              <PaperCard hover="lift" padding="sm">
                <div className="flex items-center gap-4">
                  <ScoreBadge score={report.overallScore} size="sm" showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {report.company}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] truncate">
                      {report.role} · {report.archetype}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--color-muted)]">{report.date}</span>
                </div>
              </PaperCard>
            </Link>
          </StaggerItem>
        ))}
      </StaggerList>
    </div>
  );
}
