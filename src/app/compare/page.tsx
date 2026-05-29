"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bot, CheckSquare, FileText, HelpCircle, Plus, Scale, X } from "lucide-react";
import { HandwritingTitle, PaperCard, ScoreBadge, WarmButton } from "@/components/design";
import type { Offer, OfferEvaluationModule, OfferVerdict } from "@/types";

type OfferReportRow = {
  id: number;
  title: string;
  report_type: string;
  offer_id?: number | null;
  overall_score: number;
  verdict: OfferVerdict | "";
  summary: string;
  offer_snapshot_json: string;
  modules_json: string;
  red_flags_json: string;
  missing_info_json: string;
  negotiation_levers_json: string;
  hr_questions_json: string;
  assumptions_json: string;
  take_home_json: string;
  report_markdown: string;
  created_at: string;
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  if (!text || /^(unknown|未知公司|未知岗位|未填写)$/i.test(text)) return fallback;
  return text;
}

function totalAnnualComp(offer: Offer): number {
  const monthly = Number(offer.monthlySalary || 0);
  return monthly * ((offer.monthsPerYear || 12) + (offer.annualBonus || 0));
}

function normalizeMonthlySalaryK(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n >= 1000 ? Math.round((n / 1000) * 10) / 10 : n;
}

function formatMoney(value?: number): string {
  if (!value) return "未录入";
  return value >= 1000 ? `${Math.round((value / 1000) * 10) / 10}K` : `${value}K`;
}

function formatVerdict(verdict: OfferVerdict | ""): string {
  if (verdict === "accept") return "建议直接接受";
  if (verdict === "accept_after_negotiation") return "建议谈判后接受";
  if (verdict === "proceed_cautiously") return "建议谨慎推进";
  if (verdict === "decline") return "不建议接受";
  return "暂无";
}

function rowToOffer(row: Record<string, unknown>): Offer {
  return {
    id: Number(row.id),
    company: cleanText(row.company, "未命名公司"),
    role: cleanText(row.role, "未命名岗位"),
    location: cleanText(row.location),
    level: cleanText(row.level),
    monthlySalary: normalizeMonthlySalaryK(row.monthly_salary),
    monthsPerYear: Number(row.months_per_year || 12),
    annualBonus: Number(row.annual_bonus || 0),
    hasSocialInsurance: row.has_social_insurance !== 0,
    housingFundRate: Number(row.housing_fund_rate || 7),
    probationMonths: Number(row.probation_months || 3),
    startDate: cleanText(row.start_date) || undefined,
    options: cleanText(row.options) || undefined,
    otherBenefits: cleanText(row.other_benefits) || undefined,
    employmentForm: (cleanText(row.employment_form) || "unknown") as Offer["employmentForm"],
    employerName: cleanText(row.employer_name) || undefined,
    contractMonths: row.contract_months ? Number(row.contract_months) : undefined,
    overtimePolicy: (cleanText(row.overtime_policy) || "unknown") as Offer["overtimePolicy"],
    bonusGuarantee: (cleanText(row.bonus_guarantee) || "unknown") as Offer["bonusGuarantee"],
    equityType: cleanText(row.equity_type) || undefined,
    equityVesting: cleanText(row.equity_vesting) || undefined,
    commuteMinutes: row.commute_minutes ? Number(row.commute_minutes) : undefined,
    cityCostLevel: (cleanText(row.city_cost_level) || "unknown") as Offer["cityCostLevel"],
    jobNature: cleanText(row.job_nature) || undefined,
    latestReportId: row.latest_report_id ? Number(row.latest_report_id) : undefined,
    updatedAt: cleanText(row.updated_at) || undefined,
    createdAt: new Date(String(row.created_at || Date.now())),
  };
}

function reportSnapshot(report: OfferReportRow): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(report.offer_snapshot_json, {});
}

function reportOfferId(report: OfferReportRow): number | undefined {
  const fromReport = Number(report.offer_id || 0);
  if (fromReport) return fromReport;
  const fromSnapshot = Number(reportSnapshot(report).offerId || 0);
  return fromSnapshot || undefined;
}

function reportForOffer(offer: Offer, reports: OfferReportRow[]): OfferReportRow | null {
  if (offer.latestReportId) {
    const report = reports.find((r) => r.id === offer.latestReportId);
    if (report) return report;
  }
  return reports.find((r) => reportOfferId(r) === offer.id) || null;
}

function syntheticOfferFromReport(report: OfferReportRow): Offer | null {
  if (report.report_type !== "single") return null;
  const snapshot = reportSnapshot(report);
  const company = cleanText(snapshot.company, cleanText(report.title.replace(/Offer.*$/, ""), "未命名公司"));
  const role = cleanText(snapshot.role, "未命名岗位");
  if (!company && !role) return null;
  return {
    id: reportOfferId(report) || -report.id,
    company,
    role,
    location: cleanText(snapshot.location),
    level: cleanText(snapshot.level),
    monthlySalary: normalizeMonthlySalaryK(snapshot.monthlySalary),
    monthsPerYear: Number(snapshot.monthsPerYear || 12),
    annualBonus: Number(snapshot.annualBonus || 0),
    hasSocialInsurance: snapshot.hasSocialInsurance !== false,
    housingFundRate: Number(snapshot.housingFundRate || 7),
    probationMonths: Number(snapshot.probationMonths || 3),
    startDate: cleanText(snapshot.startDate) || undefined,
    options: cleanText(snapshot.options) || undefined,
    otherBenefits: cleanText(snapshot.otherBenefits) || undefined,
    employmentForm: (cleanText(snapshot.employmentForm) || "unknown") as Offer["employmentForm"],
    employerName: cleanText(snapshot.employerName) || undefined,
    contractMonths: snapshot.contractMonths ? Number(snapshot.contractMonths) : undefined,
    overtimePolicy: (cleanText(snapshot.overtimePolicy) || "unknown") as Offer["overtimePolicy"],
    bonusGuarantee: (cleanText(snapshot.bonusGuarantee) || "unknown") as Offer["bonusGuarantee"],
    equityType: cleanText(snapshot.equityType) || undefined,
    equityVesting: cleanText(snapshot.equityVesting) || undefined,
    commuteMinutes: snapshot.commuteMinutes ? Number(snapshot.commuteMinutes) : undefined,
    cityCostLevel: (cleanText(snapshot.cityCostLevel) || "unknown") as Offer["cityCostLevel"],
    jobNature: cleanText(snapshot.jobNature) || undefined,
    latestReportId: report.id,
    updatedAt: report.created_at,
    createdAt: new Date(report.created_at || Date.now()),
  };
}

function mergeOffersWithReports(offers: Offer[], reports: OfferReportRow[]): Offer[] {
  const byId = new Map<number, Offer>();
  for (const offer of offers) byId.set(offer.id!, offer);

  for (const report of reports) {
    const synthetic = syntheticOfferFromReport(report);
    if (!synthetic?.id) continue;
    const existing = byId.get(synthetic.id);
    if (!existing) {
      byId.set(synthetic.id, synthetic);
      continue;
    }
    byId.set(synthetic.id, {
      ...existing,
      company: cleanText(existing.company) === "未命名公司" ? synthetic.company : existing.company,
      role: cleanText(existing.role) === "未命名岗位" ? synthetic.role : existing.role,
      monthlySalary: existing.monthlySalary || synthetic.monthlySalary,
      monthsPerYear: existing.monthsPerYear || synthetic.monthsPerYear,
      annualBonus: existing.annualBonus || synthetic.annualBonus,
      latestReportId: existing.latestReportId || report.id,
    });
  }

  return [...byId.values()].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

function statusForOffer(offer: Offer, reports: OfferReportRow[]): "unevaluated" | "evaluated" | "stale" {
  const report = reportForOffer(offer, reports);
  if (!report) return "unevaluated";
  const offerUpdated = offer.updatedAt ? new Date(offer.updatedAt).getTime() : 0;
  const reportCreated = new Date(report.created_at).getTime();
  return offerUpdated > reportCreated + 1000 ? "stale" : "evaluated";
}

function statusBadge(status: "unevaluated" | "evaluated" | "stale") {
  const label = status === "evaluated" ? "已评估" : status === "stale" ? "待刷新" : "未评估";
  const color = status === "evaluated"
    ? "text-emerald-700 bg-emerald-50"
    : status === "stale"
      ? "text-amber-700 bg-amber-50"
      : "text-slate-600 bg-slate-100";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${color}`}>{label}</span>;
}

export default function ComparePage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [reports, setReports] = useState<OfferReportRow[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    company: "",
    role: "",
    monthlySalary: "",
    monthsPerYear: "12",
    annualBonus: "0",
    location: "",
    otherBenefits: "",
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [offerRes, reportRes] = await Promise.all([
        fetch("/api/offers"),
        fetch("/api/offer-reports"),
      ]);
      const offerJson = await offerRes.json();
      const reportJson = await reportRes.json();
      const loadedReports = reportJson.success && Array.isArray(reportJson.data)
        ? reportJson.data as OfferReportRow[]
        : [];
      const loadedOffers = offerJson.success && Array.isArray(offerJson.data)
        ? offerJson.data.map(rowToOffer)
        : [];
      const merged = mergeOffersWithReports(loadedOffers, loadedReports);
      setReports(loadedReports);
      setOffers(merged);
      setSelectedOfferId((current) => current ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedOffer = offers.find((o) => o.id === selectedOfferId) || null;
  const selectedReport = selectedOffer ? reportForOffer(selectedOffer, reports) : null;
  const selectedModules = selectedReport ? parseJson<OfferEvaluationModule[]>(selectedReport.modules_json, []) : [];
  const selectedRedFlags = selectedReport ? parseJson<string[]>(selectedReport.red_flags_json, []) : [];
  const selectedMissing = selectedReport ? parseJson<string[]>(selectedReport.missing_info_json, []) : [];
  const selectedLevers = selectedReport ? parseJson<string[]>(selectedReport.negotiation_levers_json, []) : [];
  const selectedQuestions = selectedReport ? parseJson<string[]>(selectedReport.hr_questions_json, []) : [];

  const stats = useMemo(() => {
    const evaluated = offers.filter((offer) => statusForOffer(offer, reports) === "evaluated").length;
    const stale = offers.filter((offer) => statusForOffer(offer, reports) === "stale").length;
    return { evaluated, stale };
  }, [offers, reports]);

  function toggleCompare(id: number) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  function goEvaluate(offer: Offer) {
    if (offer.id && offer.id > 0) {
      window.location.href = `/agent?offerId=${offer.id}&intent=evaluate`;
      return;
    }
    if (offer.latestReportId) {
      window.location.href = `/agent?offerReportId=${offer.latestReportId}&intent=explain`;
    }
  }

  function goNegotiation(reportId: number) {
    window.location.href = `/agent?offerReportId=${reportId}&intent=negotiate`;
  }

  function goHrQuestions(reportId: number) {
    window.location.href = `/agent?offerReportId=${reportId}&intent=ask_hr`;
  }

  async function deleteOffer(offerId: number) {
    const offer = offers.find((item) => item.id === offerId);
    if (!offer) return;
    const confirmed = window.confirm(`确定删除 Offer「${offer.company} - ${offer.role}」吗？`);
    if (!confirmed) return;
    const isSyntheticReportOnly = offerId < 0 && offer.latestReportId;
    const res = await fetch(isSyntheticReportOnly ? `/api/offer-reports/${offer.latestReportId}` : `/api/offers/${offerId}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) {
      setError(json.error || "删除失败");
      return;
    }
    setCompareIds((prev) => {
      const next = new Set(prev);
      next.delete(offerId);
      return next;
    });
    setSelectedOfferId((current) => (current === offerId ? null : current));
    await loadData();
  }

  async function deleteReport(reportId: number) {
    const report = reports.find((item) => item.id === reportId);
    if (!report) return;
    const confirmed = window.confirm(`确定删除这条报告「${report.title}」吗？`);
    if (!confirmed) return;
    const res = await fetch(`/api/offer-reports/${reportId}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) {
      setError(json.error || "删除失败");
      return;
    }
    await loadData();
  }

  async function addOffer() {
    if (!form.company.trim() || !form.role.trim()) return;
    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: form.company.trim(),
        role: form.role.trim(),
        monthly_salary: Number(form.monthlySalary || 0),
        months_per_year: Number(form.monthsPerYear || 12),
        annual_bonus: Number(form.annualBonus || 0),
        location: form.location.trim(),
        other_benefits: form.otherBenefits.trim(),
        benefits: {},
      }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error || "保存失败");
      return;
    }
    setShowForm(false);
    setForm({ company: "", role: "", monthlySalary: "", monthsPerYear: "12", annualBonus: "0", location: "", otherBenefits: "" });
    await loadData();
  }

  const selectedForCompare = offers.filter((offer) => compareIds.has(offer.id!));

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
        <div className="h-72 bg-[var(--color-divider)] rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PaperCard padding="md" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Offer Workspace</p>
            <HandwritingTitle as="h1">Offer 评估工作台</HandwritingTitle>
            <p className="mt-2 text-sm text-[var(--color-muted)] max-w-2xl">
              单个 Offer 在这里查看评估结果和报告，对比只作为独立选择模式；谈判策略和 HR 问询交给 Agent 继续生成。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <WarmButton variant="soft" size="sm" onClick={() => setShowForm(true)}>
              <Plus size={16} className="mr-1.5" />
              录入 Offer
            </WarmButton>
            {compareIds.size >= 2 && (
              <WarmButton variant={compareMode ? "primary" : "soft"} size="sm" onClick={() => setCompareMode(!compareMode)}>
                <Scale size={16} className="mr-1.5" />
                {compareMode ? "返回档案" : `对比 (${compareIds.size})`}
              </WarmButton>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <PaperCard padding="sm">
            <p className="text-xs text-[var(--color-muted)]">Offer 总数</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{offers.length}</p>
          </PaperCard>
          <PaperCard padding="sm">
            <p className="text-xs text-[var(--color-muted)]">已评估</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.evaluated}</p>
          </PaperCard>
          <PaperCard padding="sm">
            <p className="text-xs text-[var(--color-muted)]">待刷新</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{stats.stale}</p>
          </PaperCard>
          <PaperCard padding="sm">
            <p className="text-xs text-[var(--color-muted)]">已选对比</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-primary)]">{compareIds.size}</p>
          </PaperCard>
        </div>
      </PaperCard>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {compareMode ? (
        <PaperCard padding="md" className="space-y-4">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-[var(--color-primary)]" />
            <HandwritingTitle as="h2" className="text-lg">Offer 对比</HandwritingTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-divider)]">
                  <th className="text-left py-3 px-3 font-normal text-[var(--color-muted)]">维度</th>
                  {selectedForCompare.map((offer) => (
                    <th key={offer.id} className="text-left py-3 px-3 font-medium text-[var(--color-text)]">{offer.company}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-divider)]">
                {[
                  ["岗位", (o: Offer) => o.role],
                  ["城市", (o: Offer) => o.location || "未录入"],
                  ["税前月薪", (o: Offer) => o.monthlySalary ? `${o.monthlySalary}K` : "未录入"],
                  ["年总包", (o: Offer) => o.monthlySalary ? `${totalAnnualComp(o)}K` : "未录入"],
                  ["评估分", (o: Offer) => reportForOffer(o, reports)?.overall_score ? `${reportForOffer(o, reports)?.overall_score}/5` : "未评估"],
                ].map(([label, render]) => (
                  <tr key={label as string}>
                    <td className="py-3 px-3 text-[var(--color-muted)]">{label as string}</td>
                    {selectedForCompare.map((offer) => (
                      <td key={offer.id} className="py-3 px-3 text-[var(--color-text)]">{(render as (offer: Offer) => string)(offer)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PaperCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
          <PaperCard padding="md" className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-[var(--color-primary)]" />
              <HandwritingTitle as="h2" className="text-lg">Offer 档案</HandwritingTitle>
            </div>

            {offers.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-[var(--color-muted)]">还没有 Offer。可以先在 Agent 里评估，也可以手动录入一条。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {offers.map((offer) => {
                  const report = reportForOffer(offer, reports);
                  const status = statusForOffer(offer, reports);
                  const active = offer.id === selectedOfferId;
                  return (
                    <div
                      key={offer.id}
                      className={[
                        "rounded-[var(--radius-md)] border p-4 transition-colors",
                        active ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]/35" : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-primary)]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedOfferId(offer.id!)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-[var(--color-text)] truncate">{offer.company}</p>
                            {statusBadge(status)}
                          </div>
                          <p className="mt-1 text-sm text-[var(--color-muted)]">{offer.role}</p>
                          <p className="mt-2 text-sm text-[var(--color-text-soft)]">
                            {offer.monthlySalary ? `${offer.monthlySalary}K x ${offer.monthsPerYear || 12} | 年包 ${totalAnnualComp(offer)}K` : "薪资未录入"}
                          </p>
                        </button>
                        <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                          <input
                            type="checkbox"
                            checked={compareIds.has(offer.id!)}
                            disabled={compareIds.size >= 4 && !compareIds.has(offer.id!)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleCompare(offer.id!);
                            }}
                            className="h-4 w-4 accent-[var(--color-primary)]"
                          />
                          对比
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--color-text-soft)] hover:bg-[var(--color-primary-muted)]"
                          onClick={() => setSelectedOfferId(offer.id!)}
                        >
                          详情
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PaperCard>

          <PaperCard padding="md" className="space-y-4">
            {selectedOffer ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <HandwritingTitle as="h2" className="text-xl">{selectedOffer.company}</HandwritingTitle>
                      {statusBadge(statusForOffer(selectedOffer, reports))}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{selectedOffer.role}</p>
                    <p className="mt-2 text-sm text-[var(--color-text-soft)]">
                      {selectedOffer.location || "城市未录入"} · {selectedOffer.monthlySalary ? `${selectedOffer.monthlySalary}K x ${selectedOffer.monthsPerYear || 12}` : "薪资未录入"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedReport && (
                      <>
                        <WarmButton variant="soft" size="sm" onClick={() => goNegotiation(selectedReport.id)}>
                          <CheckSquare size={14} className="mr-1" />
                          谈判策略
                        </WarmButton>
                        <WarmButton variant="soft" size="sm" onClick={() => goHrQuestions(selectedReport.id)}>
                          <HelpCircle size={14} className="mr-1" />
                          HR 问询
                        </WarmButton>
                        <button
                          className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => deleteReport(selectedReport.id)}
                        >
                          删除报告
                        </button>
                      </>
                    )}
                    <button
                      className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => deleteOffer(selectedOffer.id!)}
                    >
                      删除 Offer
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <PaperCard padding="sm">
                    <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Offer 详情</p>
                    <div className="grid gap-2 text-sm text-[var(--color-text-soft)] sm:grid-cols-2">
                      <div>公司：{selectedOffer.company}</div>
                      <div>岗位：{selectedOffer.role}</div>
                      <div>城市：{selectedOffer.location || "未录入"}</div>
                      <div>级别：{selectedOffer.level || "未录入"}</div>
                      <div>税前月薪：{formatMoney(selectedOffer.monthlySalary)}</div>
                      <div>发薪月数：{selectedOffer.monthsPerYear || 12}</div>
                      <div>年终奖：{selectedOffer.annualBonus ?? 0} 个月</div>
                      <div>社保：{selectedOffer.hasSocialInsurance ? "有" : "无"}</div>
                      <div>公积金：{selectedOffer.housingFundRate}%</div>
                      <div>试用期：{selectedOffer.probationMonths} 个月</div>
                      <div>聘用形式：{selectedOffer.employmentForm || "unknown"}</div>
                      <div>用工主体：{selectedOffer.employerName || "未录入"}</div>
                      <div>合同月数：{selectedOffer.contractMonths || "未录入"}</div>
                      <div>加班情况：{selectedOffer.overtimePolicy || "unknown"}</div>
                      <div>保底：{selectedOffer.bonusGuarantee || "unknown"}</div>
                      <div>期权：{selectedOffer.options || "未录入"}</div>
                      <div>其他福利：{selectedOffer.otherBenefits || "未录入"}</div>
                    </div>
                  </PaperCard>

                  {selectedReport ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <PaperCard padding="sm">
                          <p className="text-xs text-[var(--color-muted)]">综合评分</p>
                          <div className="mt-2"><ScoreBadge score={selectedReport.overall_score || 0} size="sm" /></div>
                        </PaperCard>
                        <PaperCard padding="sm">
                          <p className="text-xs text-[var(--color-muted)]">结论</p>
                          <p className="mt-2 text-sm text-[var(--color-text)]">{formatVerdict(selectedReport.verdict)}</p>
                        </PaperCard>
                        <PaperCard padding="sm">
                          <p className="text-xs text-[var(--color-muted)]">报告时间</p>
                          <p className="mt-2 text-sm text-[var(--color-text)]">{new Date(selectedReport.created_at).toLocaleString("zh-CN")}</p>
                        </PaperCard>
                      </div>

                      <PaperCard padding="sm">
                        <p className="mb-2 text-sm font-medium text-[var(--color-text)]">报告摘要</p>
                        <p className="text-sm leading-6 text-[var(--color-text-soft)]">{selectedReport.summary || "暂无摘要"}</p>
                      </PaperCard>

                      {selectedModules.length > 0 && (
                        <PaperCard padding="sm">
                          <p className="mb-3 text-sm font-medium text-[var(--color-text)]">模块拆解</p>
                          <div className="grid gap-2 md:grid-cols-2">
                            {selectedModules.map((module) => (
                              <div key={module.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-[var(--color-text)]">{module.label}</span>
                                  <span className="text-xs text-[var(--color-muted)]">{module.score}/5</span>
                                </div>
                                <p className="mt-2 text-xs leading-5 text-[var(--color-text-soft)]">{module.notes}</p>
                              </div>
                            ))}
                          </div>
                        </PaperCard>
                      )}

                      <div className="grid gap-3 md:grid-cols-2">
                        {[
                          ["风险点", selectedRedFlags],
                          ["缺失信息", selectedMissing],
                          ["谈判抓手", selectedLevers],
                          ["HR 问询清单", selectedQuestions.slice(0, 6)],
                        ].map(([title, items]) => (
                          <PaperCard key={title as string} padding="sm">
                            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">{title as string}</p>
                            <ul className="space-y-1 text-sm text-[var(--color-text-soft)]">
                              {((items as string[]).length ? items as string[] : ["暂无"]).map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </PaperCard>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-6 text-center">
                      <p className="text-sm text-[var(--color-muted)]">这个 Offer 还没有评估报告。</p>
                      <WarmButton variant="soft" size="sm" className="mt-4" onClick={() => goEvaluate(selectedOffer)}>
                        <Bot size={14} className="mr-1" />
                        让 Agent 评估
                      </WarmButton>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--color-text-soft)] hover:bg-[var(--color-primary-muted)]"
                      onClick={() => setSelectedOfferId(null)}
                    >
                      收起详情
                    </button>
                  </div>
                </div>
              </>
            ) : (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-6 text-center">
                    <p className="text-sm text-[var(--color-muted)]">先点击左侧 Offer 查看详情。</p>
                  </div>
            )}
          </PaperCard>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-lg)]">
            <div className="mb-4 flex items-center justify-between">
              <HandwritingTitle as="h2">录入 Offer</HandwritingTitle>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-[var(--color-muted)]" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--color-text-soft)]">公司</span>
                  <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--color-text-soft)]">岗位</span>
                  <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--color-text-soft)]">月薪 K</span>
                  <input type="number" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--color-text-soft)]">发薪月数</span>
                  <input type="number" value={form.monthsPerYear} onChange={(e) => setForm({ ...form, monthsPerYear: e.target.value })} className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--color-text-soft)]">年终月数</span>
                  <input type="number" value={form.annualBonus} onChange={(e) => setForm({ ...form, annualBonus: e.target.value })} className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--color-text-soft)]">城市</span>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--color-text-soft)]">补充信息</span>
                <textarea value={form.otherBenefits} onChange={(e) => setForm({ ...form, otherBenefits: e.target.value })} rows={3} className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
              </label>
              <div className="flex justify-end gap-2">
                <WarmButton variant="ghost" size="sm" onClick={() => setShowForm(false)}>取消</WarmButton>
                <WarmButton variant="primary" size="sm" onClick={addOffer}>保存</WarmButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
