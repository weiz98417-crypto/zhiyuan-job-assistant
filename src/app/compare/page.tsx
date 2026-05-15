"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  ChevronDown,
  X,
  TrendingUp,
  ShieldCheck,
  BarChart3,
  Calculator,
  Lightbulb,
} from "lucide-react";
import {
  HandwritingTitle,
  WarmButton,
  PaperCard,
  ScoreBadge,
} from "@/components/design";
import db from "@/lib/db";
import type { Offer, Application } from "@/types";

/* ── Radar dimension definition ── */
interface Dimension {
  key: string;
  label: string;
  score: number; // 1-5
}

const DIMENSION_LABELS: Record<string, string> = {
  salary: "薪资",
  growth: "成长空间",
  wlb: "WLB",
  outlook: "公司前景",
  match: "团队匹配",
  risk: "风险",
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  salary: 25,
  growth: 25,
  wlb: 15,
  outlook: 15,
  match: 10,
  risk: 10,
};

function totalAnnualComp(offer: Offer): number {
  const months = offer.monthsPerYear || 12;
  const bonusMonths = offer.annualBonus || 0;
  return offer.monthlySalary * (months + bonusMonths);
}

function fiveInsOneFundCost(offer: Offer): number {
  // Approximate personal contribution: ~10.5% + housing fund
  const housingRate = (offer.housingFundRate || 7) / 100;
  const socialRate = 0.105;
  const base = offer.hasSocialInsurance
    ? offer.monthlySalary
    : offer.monthlySalary * 0.3; // minimum base assumption
  return Math.round(base * (socialRate + housingRate) * 12);
}

export default function ComparePage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [showWeights, setShowWeights] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [form, setForm] = useState<Partial<Offer>>({
    monthlySalary: 0,
    monthsPerYear: 12,
    annualBonus: 0,
    hasSocialInsurance: true,
    housingFundRate: 7,
    probationMonths: 3,
  });

  useEffect(() => {
    async function load() {
      const [local, apps] = await Promise.all([
        db.offers.toArray(),
        db.applications.where("status").equals("offer").toArray(),
      ]);
      // Also fetch SQLite offers (saved by agent)
      let remote: Offer[] = [];
      try {
        const res = await fetch("/api/offers");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          remote = json.data.map((r: Record<string, unknown>) => ({
            id: r.id as number,
            company: r.company as string || "",
            role: r.role as string || "",
            monthlySalary: (r.monthly_salary as number) || 0,
            monthsPerYear: (r.months_per_year as number) || 12,
            annualBonus: (r.annual_bonus as number) || 0,
            location: r.location as string || "",
            level: r.level as string || "",
            hasSocialInsurance: (r.has_social_insurance as number) !== 0,
            housingFundRate: (r.housing_fund_rate as number) || 7,
            probationMonths: (r.probation_months as number) || 3,
            options: r.options as string || undefined,
            otherBenefits: r.other_benefits as string || undefined,
            startDate: r.start_date as string || undefined,
            createdAt: new Date((r.created_at as string) || Date.now()),
          }));
        }
      } catch { /* non-fatal */ }
      // Merge: local + remote (dedup by id)
      const all = [...local];
      for (const r of remote) {
        if (!all.find(o => o.id === r.id)) all.push(r);
      }
      setOffers(all);
      setApplications(apps);
      setMounted(true);
    }
    load();
  }, []);

  const addOffer = async () => {
    if (!form.company || !form.role || !form.monthlySalary || form.monthlySalary <= 0) return;
    const id = await db.offers.add({
      ...(form as Required<Omit<Offer, "id" | "createdAt">>),
      monthlySalary: Number(form.monthlySalary) || 0,
      monthsPerYear: Number(form.monthsPerYear) || 12,
      annualBonus: Number(form.annualBonus) || 0,
      hasSocialInsurance: form.hasSocialInsurance ?? true,
      housingFundRate: Number(form.housingFundRate) || 7,
      probationMonths: Number(form.probationMonths) || 3,
      createdAt: new Date(),
    });
    // Also save to SQLite with full fields
    fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: form.company,
        role: form.role,
        monthly_salary: Number(form.monthlySalary),
        months_per_year: Number(form.monthsPerYear) || 12,
        annual_bonus: Number(form.annualBonus) || 0,
        has_social_insurance: form.hasSocialInsurance ?? true,
        housing_fund_rate: Number(form.housingFundRate) || 7,
        options: (form as Record<string,unknown>).options || null,
        probation_months: Number(form.probationMonths) || 3,
        start_date: (form as Record<string,unknown>).startDate || null,
        other_benefits: (form as Record<string,unknown>).otherBenefits || null,
        location: (form as Record<string,unknown>).location || "",
        level: "",
        benefits: {},
      }),
    }).catch(() => {});
    const saved = await db.offers.get(id);
    if (saved) setOffers((prev) => [...prev, saved]);
    setShowForm(false);
    resetForm();
  };

  const deleteOffer = async (id: number) => {
    await db.offers.delete(id);
    setOffers((prev) => prev.filter((o) => o.id !== id));
    const next = new Set(selectedIds);
    next.delete(id);
    setSelectedIds(next);
  };

  const importFromApp = async (app: Application) => {
    setForm({
      company: app.company,
      role: app.role,
      monthlySalary: 0,
      monthsPerYear: 12,
      annualBonus: 0,
      hasSocialInsurance: true,
      housingFundRate: 7,
      probationMonths: 3,
      applicationId: app.id,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      monthlySalary: 0,
      monthsPerYear: 12,
      annualBonus: 0,
      hasSocialInsurance: true,
      housingFundRate: 7,
      probationMonths: 3,
    });
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else if (next.size < 4) next.add(id);
    setSelectedIds(next);
  };

  const selectedOffers = offers.filter((o) => selectedIds.has(o.id!));
  const selectedForCompare = compareMode ? selectedOffers : offers.filter((o) => selectedIds.has(o.id!));

  /* ── Dimension scoring (user-editable mock based on offer quality) ── */
  const getDimensions = (offer: Offer): Dimension[] => {
    const comp = totalAnnualComp(offer);
    const salaryScore = comp >= 600 ? 5 : comp >= 400 ? 4 : comp >= 250 ? 3 : comp >= 150 ? 2 : 1;
    return [
      { key: "salary", label: "薪资", score: salaryScore },
      { key: "growth", label: "成长空间", score: 3 },
      { key: "wlb", label: "WLB", score: offer.probationMonths <= 3 ? 4 : 3 },
      { key: "outlook", label: "公司前景", score: 3 },
      { key: "match", label: "团队匹配", score: 3 },
      { key: "risk", label: "风险", score: offer.hasSocialInsurance ? 4 : 2 },
    ];
  };

  const weightedScore = (offer: Offer): number => {
    const dims = getDimensions(offer);
    let total = 0;
    let weightSum = 0;
    for (const d of dims) {
      const w = weights[d.key] || 0;
      total += d.score * w;
      weightSum += w;
    }
    return weightSum > 0 ? Math.round((total / weightSum) * 10) / 10 : 0;
  };

  const sortedOffers = [...selectedForCompare].sort(
    (a, b) => weightedScore(b) - weightedScore(a)
  );

  /* ── Export report helpers ── */
  const buildReportMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# Offer 对比报告`);
    lines.push(`\n> 生成时间：${new Date().toLocaleString("zh-CN")} | 共 ${selectedForCompare.length} 个 Offer\n`);

    // Summary table
    lines.push(`## 概览\n`);
    lines.push(`| # | 公司 | 岗位 | 税前月薪 | 发薪月数 | 年终奖 | 年总包 | 公积金 | 五险一金 | 试用期 | 期权 | 加权评分 |`);
    lines.push(`|---|------|------|----------|----------|--------|--------|--------|----------|--------|------|----------|`);
    for (const [i, o] of sortedOffers.entries()) {
      lines.push(`| ${i + 1} | ${o.company} | ${o.role} | ${o.monthlySalary}K | ${o.monthsPerYear || 12}薪 | ${o.annualBonus || 0}个月 | ${totalAnnualComp(o)}K | ${o.housingFundRate || 7}% | ${o.hasSocialInsurance ? "全额" : "最低基数"} | ${o.probationMonths || 3}个月 | ${o.options || "—"} | ${weightedScore(o).toFixed(1)} |`);
    }

    // Detailed dimension breakdown
    lines.push(`\n## 维度评分\n`);
    for (const o of sortedOffers) {
      lines.push(`### ${o.company} — ${o.role}\n`);
      const dims = getDimensions(o);
      lines.push(`| 维度 | 评分 | 权重 |`);
      lines.push(`|------|------|------|`);
      for (const d of dims) {
        lines.push(`| ${d.label} | ${"★".repeat(d.score)}${"☆".repeat(5 - d.score)} (${d.score}/5) | ${weights[d.key] || 0}% |`);
      }
      lines.push(`| **加权总分** | **${weightedScore(o).toFixed(1)}** | |\n`);
    }

    // Rankings
    lines.push(`## 排名\n`);
    for (const [i, o] of sortedOffers.entries()) {
      lines.push(`${i + 1}. **${o.company}** — ${o.role}（加权 ${weightedScore(o).toFixed(1)}/5，年总包 ${totalAnnualComp(o)}K）`);
    }

    // Negotiation tips
    if (sortedOffers.length > 0) {
      lines.push(`\n## 谈判建议\n`);
      const tips = NegotiationTips({ topOffer: sortedOffers[0] });
      for (const tip of tips) {
        lines.push(`- ${tip}`);
      }
    }

    // Radar chart description
    lines.push(`\n## 雷达图维度说明\n`);
    lines.push(`| 维度 | 说明 |`);
    lines.push(`|------|------|`);
    lines.push(`| 薪资 | 年总包在市场中的竞争力 |`);
    lines.push(`| 成长空间 | 职级含金量、晋升通道、技术栈匹配度 |`);
    lines.push(`| WLB | 工作强度、加班文化、双休/大小周/996 |`);
    lines.push(`| 公司前景 | 融资阶段、业务稳定性、裁员风险 |`);
    lines.push(`| 团队匹配 | 岗位匹配度、团队氛围、汇报线 |`);
    lines.push(`| 风险 | 五险一金、竞业限制、试用期条款 |`);

    lines.push(`\n---\n*本报告由 筝筝纸鸢 AI 求职助手自动生成*`);
    return lines.join("\n");
  };

  const buildReportHTML = () => {
    const md = buildReportMarkdown();
    // Simple markdown-to-HTML conversion
    let html = md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^\| (.+) \|$/gm, (line) => {
        const cells = line.slice(1, -1).split("|").map(c => c.trim());
        const tag = line.includes("---") ? "th" : "td";
        return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
      })
      .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    html = html.replace(/<tr>/g, '<table><tr>').replace(/<\/tr>/g, '</tr></table>');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Offer 对比报告</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; line-height: 1.7; }
  h1 { font-size: 1.5em; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  h2 { font-size: 1.15em; margin-top: 28px; color: #1e40af; }
  h3 { font-size: 1.05em; margin-top: 20px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 0.9em; }
  th { background: #f0f4ff; font-weight: 600; }
  blockquote { border-left: 3px solid #2563eb; padding-left: 12px; color: #666; margin: 12px 0; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
${html}
</body>
</html>`;
  };

  const exportMarkdown = async () => {
    const content = buildReportMarkdown();
    const filename = `offer-compare-${selectedForCompare.map(o => o.company).join("-").slice(0, 60)}-${new Date().toISOString().slice(0, 10)}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);

    // Persist to SQLite
    try {
      await fetch("/api/offer-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Offer 对比报告`,
          offers_json: selectedForCompare.map(o => ({
            company: o.company,
            role: o.role,
            monthlySalary: o.monthlySalary,
            monthsPerYear: o.monthsPerYear,
            annualBonus: o.annualBonus,
            hasSocialInsurance: o.hasSocialInsurance,
            housingFundRate: o.housingFundRate,
            options: o.options,
            probationMonths: o.probationMonths,
          })),
          report_markdown: content,
        }),
      });
      // Also sync to export-file API for server-side download
      await fetch("/api/export-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filename, format: "md" }),
      });
    } catch { /* non-critical */ }
  };

  const exportPDF = async () => {
    const html = buildReportHTML();
    const w = window.open("", "_blank");
    if (!w) { alert("浏览器拦截了弹窗，请允许弹窗后重试"); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 800);

    // Also persist to SQLite
    const md = buildReportMarkdown();
    try {
      await fetch("/api/offer-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Offer 对比报告",
          offers_json: selectedForCompare.map(o => ({
            company: o.company,
            role: o.role,
            monthlySalary: o.monthlySalary,
            monthsPerYear: o.monthsPerYear,
            annualBonus: o.annualBonus,
          })),
          report_markdown: md,
        }),
      });
    } catch { /* non-critical */ }
  };

  /* ── Radar Chart (SVG) ── */
  function RadarChart({ offers: radarOffers }: { offers: Offer[] }) {
    const dims = ["salary", "growth", "wlb", "outlook", "match", "risk"];
    const n = dims.length;
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 24;
    const levels = 5;

    const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
    const point = (i: number, value: number) => {
      const a = angle(i);
      const dist = (r * value) / levels;
      return { x: cx + dist * Math.cos(a), y: cy + dist * Math.sin(a) };
    };

    const colors = [
      "oklch(75% 0.12 75)",
      "oklch(55% 0.15 260)",
      "oklch(60% 0.14 160)",
      "oklch(50% 0.13 30)",
    ];

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px] mx-auto">
        {/* Grid levels */}
        {Array.from({ length: levels }, (_, l) => l + 1).map((lv) => {
          const pts = dims
            .map((_, i) => {
              const p = point(i, lv);
              return `${p.x},${p.y}`;
            })
            .join(" ");
          return (
            <polygon
              key={lv}
              points={pts}
              fill="none"
              stroke="var(--color-divider)"
              strokeWidth="1"
            />
          );
        })}
        {/* Axes */}
        {dims.map((_, i) => {
          const p = point(i, levels);
          return (
            <line
              key={`a-${i}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-divider)"
              strokeWidth="1"
            />
          );
        })}
        {/* Labels */}
        {dims.map((d, i) => {
          const p = point(i, levels + 0.6);
          return (
            <text
              key={`l-${d}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--color-text-soft)]"
              fontSize="11"
              fontFamily="var(--font-body)"
            >
              {DIMENSION_LABELS[d]}
            </text>
          );
        })}
        {/* Data polygons */}
        {radarOffers.map((offer, idx) => {
          const dimsData = getDimensions(offer);
          const pts = dims
            .map((dk, i) => {
              const d = dimsData.find((dd) => dd.key === dk);
              const p = point(i, d ? d.score : 0);
              return `${p.x},${p.y}`;
            })
            .join(" ");
          return (
            <polygon
              key={offer.id}
              points={pts}
              fill={colors[idx % colors.length]}
              fillOpacity="0.15"
              stroke={colors[idx % colors.length]}
              strokeWidth="2"
            />
          );
        })}
        {/* Data points */}
        {radarOffers.map((offer, idx) => {
          const dimsData = getDimensions(offer);
          return dims.map((dk, i) => {
            const d = dimsData.find((dd) => dd.key === dk);
            const p = point(i, d ? d.score : 0);
            return (
              <circle
                key={`${offer.id}-${dk}`}
                cx={p.x}
                cy={p.y}
                r="4"
                fill={colors[idx % colors.length]}
              />
            );
          });
        })}
      </svg>
    );
  }

  /* ── Negotiation Tips ── */
  function NegotiationTips({ topOffer }: { topOffer: Offer }) {
    const annual = totalAnnualComp(topOffer);
    const tips: string[] = [];
    if (!topOffer.hasSocialInsurance) {
      tips.push("要求五险一金全额缴纳——按最低基数缴，实际损失可达年薪的10-15%。");
    }
    if ((topOffer.housingFundRate || 7) < 12) {
      tips.push(`公积金比例 ${topOffer.housingFundRate}% 低于市场最高标准 12%，可争取上调——公积金是实打实的免税收入。`);
    }
    if ((topOffer.annualBonus || 0) < 2) {
      tips.push("年终奖可争取保底条款（如'最低2个月'），而非'视经营情况'的模糊表述。");
    }
    if (topOffer.probationMonths > 3) {
      tips.push(`试用期${topOffer.probationMonths}个月偏长，建议谈回3个月或争取试用期薪资不打折。`);
    }
    tips.push(`基于市场数据，该级别${topOffer.role}岗位的年总包大致在 ${Math.round(annual * 0.85)}-${Math.round(annual * 1.2)}K 区间。如果当前偏低，可以此为锚点谈判。`);
    tips.push("谈判时先谈年终奖和公积金，再谈月薪基数——顺序影响心理锚定。");
    return tips;
  }

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--color-divider)] rounded w-40" />
        <div className="h-64 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[var(--color-muted)] text-sm mb-1">
            {offers.length} 个 Offer
          </p>
          <HandwritingTitle as="h1">Offer 对比</HandwritingTitle>
        </div>
        <div className="flex gap-2">
          {selectedIds.size >= 2 && (
            <WarmButton
              variant={compareMode ? "primary" : "soft"}
              size="sm"
              onClick={() => setCompareMode(!compareMode)}
            >
              {compareMode ? "返回列表" : `对比 (${selectedIds.size})`}
            </WarmButton>
          )}
          <WarmButton variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={16} className="mr-1.5" />
            添加 Offer
          </WarmButton>
        </div>
      </div>

      {/* ── Offer Form Modal ── */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/20 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-[var(--shadow-lg)]"
                initial={{ scale: 0.95, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 16 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <HandwritingTitle as="h2">录入 Offer</HandwritingTitle>
                  <button onClick={() => setShowForm(false)}>
                    <X size={20} className="text-[var(--color-muted)]" />
                  </button>
                </div>

                {/* Import from tracker */}
                {applications.length > 0 && (
                  <PaperCard padding="sm" className="mb-4">
                    <p className="text-sm text-[var(--color-text-soft)] mb-2">
                      从已获 Offer 导入
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {applications.map((app) => (
                        <button
                          key={app.id}
                          onClick={() => importFromApp(app)}
                          className="text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] text-[var(--color-text)] hover:bg-[var(--color-primary-soft)] transition-colors"
                        >
                          {app.company} — {app.role}
                        </button>
                      ))}
                    </div>
                  </PaperCard>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">公司</label>
                      <input
                        value={form.company || ""}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">岗位</label>
                      <input
                        value={form.role || ""}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">税前月薪 (K)</label>
                      <input
                        type="number"
                        value={form.monthlySalary || ""}
                        onChange={(e) => setForm({ ...form, monthlySalary: Number(e.target.value) })}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">发薪月数</label>
                      <input
                        type="number"
                        value={form.monthsPerYear || 12}
                        onChange={(e) => setForm({ ...form, monthsPerYear: Number(e.target.value) })}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">年终奖 (月数)</label>
                      <input
                        type="number"
                        value={form.annualBonus || 0}
                        onChange={(e) => setForm({ ...form, annualBonus: Number(e.target.value) })}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">公积金比例 (%)</label>
                      <select
                        value={form.housingFundRate || 7}
                        onChange={(e) => setForm({ ...form, housingFundRate: Number(e.target.value) })}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)]"
                      >
                        {[5, 7, 8, 10, 12].map((v) => (
                          <option key={v} value={v}>{v}%</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-[var(--color-text-soft)] mb-1">试用期 (月)</label>
                      <select
                        value={form.probationMonths || 3}
                        onChange={(e) => setForm({ ...form, probationMonths: Number(e.target.value) })}
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)]"
                      >
                        {[1, 2, 3, 6].map((v) => (
                          <option key={v} value={v}>{v}个月</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.hasSocialInsurance ?? true}
                        onChange={(e) => setForm({ ...form, hasSocialInsurance: e.target.checked })}
                        className="w-4 h-4 accent-[var(--color-primary)]"
                      />
                      <span className="text-[var(--color-text-soft)]">五险一金全额缴纳</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">期权/股票 (可选)</label>
                    <input
                      value={form.options || ""}
                      onChange={(e) => setForm({ ...form, options: e.target.value })}
                      placeholder="如：期权10万股/4年"
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[var(--color-text-soft)] mb-1">其他福利 (可选)</label>
                    <textarea
                      value={form.otherBenefits || ""}
                      onChange={(e) => setForm({ ...form, otherBenefits: e.target.value })}
                      placeholder="如：补充医疗保险、房补、餐补、交通补贴..."
                      rows={2}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)] resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <WarmButton variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                      取消
                    </WarmButton>
                    <WarmButton variant="primary" size="sm" onClick={addOffer}>
                      保存 Offer
                    </WarmButton>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Compare Mode ── */}
      {compareMode && selectedForCompare.length >= 2 ? (
        <div className="space-y-6">
          {/* Export action bar */}
          <div className="flex items-center gap-3 justify-between">
            <p className="text-sm text-[var(--color-muted)]">
              对比 {selectedForCompare.length} 个 Offer
            </p>
            <div className="flex gap-2">
              <button
                onClick={exportMarkdown}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] text-[var(--color-text)] hover:bg-[var(--color-primary-soft)] transition-colors"
              >
                📄 导出 Markdown
              </button>
              <button
                onClick={exportPDF}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
              >
                🖨️ 导出 PDF
              </button>
            </div>
          </div>

          {/* Side-by-side table */}
          <PaperCard padding="md">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-divider)]">
                    <th className="text-left py-3 px-4 text-[var(--color-muted)] font-normal">维度</th>
                    {selectedForCompare.map((offer) => (
                      <th key={offer.id} className="text-center py-3 px-4">
                        <span className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)]">
                          {offer.company}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-divider)]">
                  {[
                    { label: "税前月薪", render: (o: Offer) => `${o.monthlySalary}K` },
                    { label: "发薪月数", render: (o: Offer) => `${o.monthsPerYear || 12}薪` },
                    { label: "年终奖", render: (o: Offer) => `${o.annualBonus || 0}个月` },
                    {
                      label: "年总包 (税前)",
                      render: (o: Offer) => (
                        <span className="font-[family-name:var(--font-display)] font-bold text-[var(--color-primary)]">
                          {totalAnnualComp(o)}K
                        </span>
                      ),
                    },
                    {
                      label: "五险一金个人年缴",
                      render: (o: Offer) => `${fiveInsOneFundCost(o)}K`,
                    },
                    { label: "公积金比例", render: (o: Offer) => `${o.housingFundRate || 7}%` },
                    { label: "试用期", render: (o: Offer) => `${o.probationMonths || 3}个月` },
                    { label: "五险一金全额", render: (o: Offer) => (o.hasSocialInsurance ? "✅" : "⚠️ 最低基数") },
                    { label: "期权/股票", render: (o: Offer) => o.options || "—" },
                    { label: "加权评分", render: (o: Offer) => <ScoreBadge score={weightedScore(o)} size="sm" /> },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-[var(--color-primary-muted)]/30 transition-colors">
                      <td className="py-2.5 px-4 text-[var(--color-text-soft)]">{row.label}</td>
                      {selectedForCompare.map((offer) => (
                        <td key={offer.id} className="text-center py-2.5 px-4 text-[var(--color-text)]">
                          {row.render(offer)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PaperCard>

          {/* Radar Chart */}
          <PaperCard padding="md">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={18} className="text-[var(--color-primary)]" />
              <HandwritingTitle as="h3" className="text-lg">多维度雷达图</HandwritingTitle>
            </div>
            {/* eslint-disable-next-line */}
            <RadarChart offers={selectedForCompare} />
            {/* Legend */}
            <div className="flex justify-center gap-6 mt-3">
              {selectedForCompare.map((offer, i) => {
                const colors = [
                  "oklch(75% 0.12 75)",
                  "oklch(55% 0.15 260)",
                  "oklch(60% 0.14 160)",
                  "oklch(50% 0.13 30)",
                ];
                return (
                  <div key={offer.id} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors[i] }}
                    />
                    <span className="text-[var(--color-text)]">{offer.company}</span>
                  </div>
                );
              })}
            </div>
          </PaperCard>

          {/* Decision Matrix */}
          <PaperCard padding="md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-[var(--color-primary)]" />
                <HandwritingTitle as="h3" className="text-lg">决策矩阵</HandwritingTitle>
              </div>
              <WarmButton variant="ghost" size="sm" onClick={() => setShowWeights(!showWeights)}>
                调整权重
                <ChevronDown
                  size={14}
                  className={`ml-1 transition-transform ${showWeights ? "rotate-180" : ""}`}
                />
              </WarmButton>
            </div>

            {/* Weight sliders */}
            <AnimatePresence>
              {showWeights && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-3 gap-3 mb-4 p-4 bg-[var(--color-primary-muted)] rounded-[var(--radius-md)]">
                    {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-text-soft)] w-16">{label}</span>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={weights[key] || 0}
                          onChange={(e) =>
                            setWeights({ ...weights, [key]: Number(e.target.value) })
                          }
                          className="flex-1 accent-[var(--color-primary)]"
                        />
                        <span className="text-xs font-[family-name:var(--font-display)] text-[var(--color-text)] w-8 text-right">
                          {weights[key]}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ranked results */}
            <div className="space-y-2">
              {sortedOffers.map((offer, idx) => (
                <div
                  key={offer.id}
                  className="flex items-center gap-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-primary-muted)]"
                >
                  <span className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--color-primary)] w-8 text-center">
                    #{idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-medium text-[var(--color-text)]">{offer.company}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {offer.role} · {totalAnnualComp(offer)}K/年
                    </p>
                  </div>
                  <ScoreBadge score={weightedScore(offer)} size="sm" />
                </div>
              ))}
            </div>
          </PaperCard>

          {/* Negotiation Tips */}
          {sortedOffers.length > 0 && (
            <PaperCard padding="md">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb size={18} className="text-[var(--color-primary)]" />
                <HandwritingTitle as="h3" className="text-lg">谈判建议</HandwritingTitle>
              </div>
              <ul className="space-y-2">
                {NegotiationTips({ topOffer: sortedOffers[0] }).map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-soft)]">
                    <span className="text-[var(--color-primary)] mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </PaperCard>
          )}
        </div>
      ) : (
        /* ── Offer List ── */
        <div className="space-y-3">
          {offers.length === 0 ? (
            <div className="max-w-xl mx-auto py-16 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center">
                <TrendingUp size={24} className="text-[var(--color-primary)]" />
              </div>
              <div>
                <HandwritingTitle as="h2">还没有 Offer 记录</HandwritingTitle>
                <p className="text-[var(--color-muted)] text-sm mt-2">
                  点击"添加 Offer"录入你的第一个 Offer
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--color-muted)]">
                勾选 2-4 个 Offer，点击"对比"开始比较 · 共 {offers.length} 个
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {offers.map((offer) => (
                  <PaperCard
                    key={offer.id}
                    padding="md"
                    hover="lift"
                    className={selectedIds.has(offer.id!) ? "ring-2 ring-[var(--color-primary)]" : ""}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1" onClick={() => toggleSelect(offer.id!)}>
                        <div className="flex items-center gap-3 mb-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(offer.id!)}
                            onChange={() => toggleSelect(offer.id!)}
                            disabled={!selectedIds.has(offer.id!) && selectedIds.size >= 4}
                            className="w-4 h-4 accent-[var(--color-primary)]"
                          />
                          <h3 className="font-[family-name:var(--font-display)] font-bold text-[var(--color-text)]">
                            {offer.company}
                          </h3>
                        </div>
                        <p className="text-sm text-[var(--color-muted)] ml-7">{offer.role}</p>
                        <div className="flex items-center gap-4 mt-3 ml-7 text-sm">
                          <span className="font-[family-name:var(--font-display)] font-bold text-[var(--color-primary)]">
                            {totalAnnualComp(offer)}K/年
                          </span>
                          <span className="text-[var(--color-text-soft)]">
                            {offer.monthlySalary}K × {offer.monthsPerYear || 12}月
                          </span>
                          {!offer.hasSocialInsurance && (
                            <span className="text-xs text-amber-600">⚠️ 最低基数</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteOffer(offer.id!)}
                        className="p-1.5 text-[var(--color-muted)] hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </PaperCard>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
