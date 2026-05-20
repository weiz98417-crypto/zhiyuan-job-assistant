"use client";

import { useEffect, useState, useRef } from "react";
import { Download, Upload, Trash2, User, Target, Banknote, Loader2, Database, Sparkles, Wrench, Heart, AlertTriangle, FileText, BellRing, Plus, X } from "lucide-react";
import { HandwritingTitle, WarmButton, PaperCard } from "@/components/design";
import Skeleton from "@/components/design/Skeleton";
import db from "@/lib/db";
import { exportApplicationsMD, downloadAsFile } from "@/lib/exporters";
import { parseApplicationsMD } from "@/lib/parsers";
import type { UserProfile, ApplicationStatus, EvaluationScores } from "@/types";

const DEFAULT_PROFILE: UserProfile = {
  fullName: "", email: "", phone: "", location: "",
  linkedin: "", github: "", portfolioUrl: "", targetRoles: [],
  headline: "", exitStory: "", superpowers: [],
  salaryMinK: 0, salaryMaxK: 0, salaryFlexibility: "open",
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [superpowerInput, setSuperpowerInput] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [cliImporting, setCliImporting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("zhiyuan-profile");
    if (stored) { try { setProfile(JSON.parse(stored)); } catch { /* ignore */ } }
    setMounted(true);
  }, []);

  /* ── News Settings ── */
  const [targetCompanies, setTargetCompanies] = useState<string[]>([]);
  const [companyInput, setCompanyInput] = useState("");
  const [refreshInterval, setRefreshInterval] = useState<string>("6h");
  const [newsSaving, setNewsSaving] = useState(false);

  useEffect(() => {
    // Load news settings from localStorage
    const stored = localStorage.getItem("zhiyuan-news-settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTargetCompanies(parsed.targetCompanies || []);
        setRefreshInterval(parsed.refreshInterval || "6h");
      } catch { /* ignore */ }
    }
  }, []);

  const saveNewsSettings = async (companies: string[], interval: string) => {
    setTargetCompanies(companies);
    setRefreshInterval(interval);
    const settings = { targetCompanies: companies, refreshInterval: interval };
    localStorage.setItem("zhiyuan-news-settings", JSON.stringify(settings));

    // Also persist to server profiles API
    setNewsSaving(true);
    try {
      await fetch("/api/data/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals: {
            target_companies: companies,
            news_refresh_interval: interval,
          },
        }),
      });
    } catch { /* non-critical */ }
    setNewsSaving(false);
  };

  const addCompany = () => {
    const name = companyInput.trim();
    if (!name || targetCompanies.includes(name)) return;
    const updated = [...targetCompanies, name];
    saveNewsSettings(updated, refreshInterval);
    setCompanyInput("");
  };

  const removeCompany = (name: string) => {
    saveNewsSettings(targetCompanies.filter((c) => c !== name), refreshInterval);
  };

  const saveProfile = (p: UserProfile) => {
    setProfile(p);
    localStorage.setItem("zhiyuan-profile", JSON.stringify(p));
  };

  const exportAllData = async () => {
    const apps = await db.applications.toArray();
    downloadAsFile(exportApplicationsMD(apps), "applications.md");
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.endsWith(".md")) {
        const apps = parseApplicationsMD(text);
        for (const app of apps) {
          const exists = await db.applications.where({ company: app.company, role: app.role }).first();
          if (!exists) await db.applications.add(app);
        }
        setImportStatus(`成功导入 ${apps.length} 条投递记录`);
      }
    } catch { setImportStatus("文件解析失败，请检查格式"); }
    setTimeout(() => setImportStatus(null), 3000);
    if (fileRef.current) fileRef.current.value = "";
  };

  const importFromCLI = async () => {
    setCliImporting(true);
    setImportStatus(null);
    try {
      const res = await fetch("/api/data/import");
      if (!res.ok) throw new Error("API 请求失败");
      const result = await res.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || "导入失败");
      }

      const { applications, reports, profile: cliProfile, summary } = result.data;
      let importedApps = 0;
      let importedReports = 0;

      // Bulk insert applications with dedup
      if (applications && applications.length > 0) {
        for (const app of applications) {
          const exists = await db.applications
            .where({ company: app.company as string, role: app.role as string })
            .first();
          if (!exists) {
            await db.applications.add({
              num: (app.num as number) || 0,
              date: (app.date as string) || "",
              company: (app.company as string) || "",
              role: (app.role as string) || "",
              score: parseFloat(app.score as string) || 0,
              status: ((app.status as string) || "evaluated") as ApplicationStatus,
              pdfGenerated: (app.pdf as string) === "✅",
              reportPath: (app.report as string) || "",
              notes: (app.notes as string) || "",
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            importedApps++;
          }
        }
      }

      // Import reports if available
      if (reports && reports.length > 0) {
        for (const report of reports) {
          const exists = await db.reports.where({ reportNum: report.reportNum as number }).first();
          if (!exists) {
            const emptyScores: EvaluationScores = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: "" };
            await db.reports.add({
              reportNum: report.reportNum as number,
              date: (report.header?.date as string) || "",
              company: (report.header?.company as string) || "未知",
              role: (report.header?.role as string) || "未知",
              archetype: (report.header?.archetype as string) || "",
              overallScore: parseFloat(report.header?.overallScore as string) || 0,
              legitimacy: report.header?.legitimacy as string || "不确定",
              scores: emptyScores,
              blocks: { a: "", b: "", c: "", d: "", e: "", f: "", g: "" },
              keywords: [],
              createdAt: new Date(),
            });
            importedReports++;
          }
        }
      }

      // Import profile from CLI if available and not already set locally
      if (cliProfile && Object.keys(cliProfile).length > 0) {
        const stored = localStorage.getItem("zhiyuan-profile");
        if (!stored) {
          const mapped: UserProfile = {
            ...DEFAULT_PROFILE,
            fullName: (cliProfile.full_name as string) || (cliProfile.name as string) || "",
            email: (cliProfile.email as string) || "",
            location: (cliProfile.location as string) || "",
            linkedin: (cliProfile.linkedin as string) || "",
            github: (cliProfile.github as string) || "",
            portfolioUrl: (cliProfile.portfolio_url as string) || "",
            targetRoles: typeof cliProfile.target_roles === "string"
              ? (cliProfile.target_roles as string).split(",").map((s: string) => ({
                  name: s.trim(),
                  level: "",
                  fit: "adjacent" as const,
                }))
              : DEFAULT_PROFILE.targetRoles,
            headline: (cliProfile.headline as string) || "",
            salaryMinK: parseInt(cliProfile.salary_min_k as string) || 0,
            salaryMaxK: parseInt(cliProfile.salary_max_k as string) || 0,
          };
          saveProfile(mapped);
        }
      }

      const parts: string[] = [];
      if (importedApps > 0) parts.push(`${importedApps} 条投递记录`);
      if (importedReports > 0) parts.push(`${importedReports} 份报告`);
      if (parts.length > 0) {
        setImportStatus(`从 CLI 成功导入 ${parts.join("、")}`);
      } else if (result.data.hasData) {
        setImportStatus("数据已存在，无需重复导入");
      } else {
        setImportStatus("CLI 端暂无数据。请先运行 CLI 系统生成数据文件。");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      setImportStatus(`CLI 导入失败：${message}。请确保 CLI 系统已运行过。`);
    } finally {
      setCliImporting(false);
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const clearAll = () => {
    if (!confirm("确定清除所有数据？建议先导出备份。")) return;
    db.applications.clear(); db.reports.clear(); db.offers.clear();
    db.stories.clear(); db.interviews.clear();
    localStorage.removeItem("zhiyuan-profile");
    setProfile(DEFAULT_PROFILE);
  };

  if (!mounted) return <div className="py-8"><Skeleton lines={5} /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <HandwritingTitle as="h1">个人设置</HandwritingTitle>

      {/* Zhiyuan Profile Card — from explore summary */}
      {(profile.archetype || profile.narrative) && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <Sparkles size={16} /> 求职画像
          </h2>
          <PaperCard>
            <div className="space-y-4">
              {/* Archetype */}
              {profile.archetype && (
                <div className="text-sm">
                  <span className="text-xs text-[var(--color-muted)]">匹配类型</span>
                  <p className="text-[var(--color-primary)] font-medium">{profile.archetype}</p>
                </div>
              )}

              {/* Target Roles */}
              {profile.targetRoles.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text)] mb-2 flex items-center gap-1.5">
                    <Target size={12} className="text-[var(--color-primary)]" /> 推荐方向
                  </h3>
                  <div className="space-y-2">
                    {profile.targetRoles.map((r) => (
                      <div key={r.name} className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
                        <span className="text-sm">{r.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.fit === "primary" ? "bg-[var(--color-primary-muted)] text-[var(--color-text)]" : "bg-[var(--color-divider)] text-[var(--color-muted)]"}`}>
                          {r.fit === "primary" ? "首选" : "备选"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {profile.superpowers.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text)] mb-2 flex items-center gap-1.5">
                    <Wrench size={12} className="text-[var(--color-primary)]" /> 优势技能
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.superpowers.map((s) => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text)]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preferences */}
              {profile.preferences && (profile.preferences.companyType || profile.preferences.industry || profile.preferences.culture) && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text)] mb-2 flex items-center gap-1.5">
                    <Heart size={12} className="text-[var(--color-primary)]" /> 工作偏好
                  </h3>
                  <div className="text-xs space-y-1 text-[var(--color-text-soft)]">
                    {profile.preferences.companyType && <p>公司类型: {profile.preferences.companyType}</p>}
                    {profile.preferences.industry && <p>行业: {profile.preferences.industry}</p>}
                    {profile.preferences.culture && <p>文化: {profile.preferences.culture}</p>}
                    {profile.preferences.workStyle && <p>方式: {profile.preferences.workStyle}</p>}
                  </div>
                </div>
              )}

              {/* Constraints */}
              {profile.constraints && (profile.constraints.salary || profile.constraints.location || profile.constraints.hours || (Array.isArray(profile.constraints.other) && profile.constraints.other.length > 0)) && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text)] mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-[var(--color-primary)]" /> 硬约束
                  </h3>
                  <div className="text-xs space-y-1 text-[var(--color-text-soft)]">
                    {profile.constraints.salary && <p>薪资: {profile.constraints.salary}</p>}
                    {profile.constraints.location && <p>地点: {profile.constraints.location}</p>}
                    {profile.constraints.hours && <p>工时: {profile.constraints.hours}</p>}
                    {Array.isArray(profile.constraints.other) && profile.constraints.other.map((o) => <p key={o}>· {o}</p>)}
                  </div>
                </div>
              )}

              {/* Narrative */}
              {profile.narrative && profile.narrative !== "未提及" && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text)] mb-2 flex items-center gap-1.5">
                    <FileText size={12} className="text-[var(--color-primary)]" /> 求职叙事
                  </h3>
                  <p className="text-xs text-[var(--color-text-soft)] leading-relaxed bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-2">
                    {profile.narrative}
                  </p>
                </div>
              )}
            </div>
          </PaperCard>
        </section>
      )}

      {/* Basic Info */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]"><User size={16} /> 基本信息</h2>
        <PaperCard>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="姓名" value={profile.fullName} onChange={(v) => saveProfile({ ...profile, fullName: v })} />
            <Field label="邮箱" value={profile.email} onChange={(v) => saveProfile({ ...profile, email: v })} />
            <Field label="电话" value={profile.phone} onChange={(v) => saveProfile({ ...profile, phone: v })} />
            <Field label="城市" value={profile.location} onChange={(v) => saveProfile({ ...profile, location: v })} />
            <Field label="LinkedIn" value={profile.linkedin || ""} onChange={(v) => saveProfile({ ...profile, linkedin: v })} />
            <Field label="GitHub" value={profile.github || ""} onChange={(v) => saveProfile({ ...profile, github: v })} />
            <div className="sm:col-span-2">
              <Field label="作品集" value={profile.portfolioUrl || ""} onChange={(v) => saveProfile({ ...profile, portfolioUrl: v })} />
            </div>
          </div>
        </PaperCard>
      </section>

      {/* Zhiyuan */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]"><Target size={16} /> 职业定位</h2>
        <PaperCard>
          <div className="space-y-4">
            <Field label="职业头衔" value={profile.headline}
              onChange={(v) => saveProfile({ ...profile, headline: v })} placeholder="如：10年产品人转型AI产品" />
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">职业故事</label>
              <textarea value={profile.exitStory}
                onChange={(e) => saveProfile({ ...profile, exitStory: e.target.value })} rows={3}
                className="w-full p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] resize-y" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">核心优势</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {profile.superpowers.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] text-[var(--color-text-soft)]">
                    {s}
                    <button onClick={() => saveProfile({ ...profile, superpowers: profile.superpowers.filter((_, j) => j !== i) })} className="hover:text-red-400">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={superpowerInput} onChange={(e) => setSuperpowerInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && superpowerInput.trim()) { saveProfile({ ...profile, superpowers: [...profile.superpowers, superpowerInput.trim()] }); setSuperpowerInput(""); e.preventDefault(); } }}
                  placeholder="添加优势" className="flex-1 p-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-primary)]" />
                <WarmButton size="sm" variant="soft" onClick={() => { if (superpowerInput.trim()) { saveProfile({ ...profile, superpowers: [...profile.superpowers, superpowerInput.trim()] }); setSuperpowerInput(""); } }}>添加</WarmButton>
              </div>
            </div>
          </div>
        </PaperCard>
      </section>

      {/* Salary */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]"><Banknote size={16} /> 薪资（税前月薪/K）</h2>
        <PaperCard>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">最低 (K)</label>
              <input type="number" value={profile.salaryMinK || ""} onChange={(e) => saveProfile({ ...profile, salaryMinK: Number(e.target.value) })}
                className="w-full p-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">最高 (K)</label>
              <input type="number" value={profile.salaryMaxK || ""} onChange={(e) => saveProfile({ ...profile, salaryMaxK: Number(e.target.value) })}
                className="w-full p-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {(["open", "firm"] as const).map((opt) => (
              <button key={opt} onClick={() => saveProfile({ ...profile, salaryFlexibility: opt })}
                className={`px-4 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${profile.salaryFlexibility === opt ? "bg-[var(--color-primary-soft)] text-[var(--color-text)]" : "bg-[var(--color-divider)] text-[var(--color-muted)]"}`}>
                {opt === "open" ? "可谈" : "不接受低于区间"}
              </button>
            ))}
          </div>
        </PaperCard>
      </section>

      {/* News Settings */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]"><BellRing size={16} /> 快讯设置</h2>
        <PaperCard>
          <div className="space-y-4">
            {/* Target Companies */}
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">目标公司</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {targetCompanies.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text)]">
                    {c}
                    <button onClick={() => removeCompany(c)} className="hover:text-red-400 transition-colors">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {targetCompanies.length === 0 && (
                  <span className="text-xs text-[var(--color-muted)] py-1">尚未添加目标公司</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCompany(); }}
                  placeholder="输入公司名称"
                  className="flex-1 p-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  onClick={addCompany}
                  disabled={!companyInput.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] text-[var(--color-text)] hover:bg-[var(--color-primary-soft)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={14} /> 添加
                </button>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1.5">添加关注的公司后，首页将展示其招聘动态</p>
            </div>

            {/* Refresh Interval */}
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">刷新频次</label>
              <div className="flex gap-2 flex-wrap">
                {(["6h", "12h", "24h", "manual"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => saveNewsSettings(targetCompanies, opt)}
                    className={`px-3 py-1.5 text-xs rounded-[var(--radius-sm)] transition-colors ${
                      refreshInterval === opt
                        ? "bg-[var(--color-primary-soft)] text-[var(--color-text)]"
                        : "bg-[var(--color-divider)] text-[var(--color-muted)] hover:bg-[var(--color-primary-muted)]"
                    }`}
                  >
                    {opt === "6h" ? "每 6 小时" : opt === "12h" ? "每 12 小时" : opt === "24h" ? "每天" : "手动"}
                  </button>
                ))}
              </div>
              {newsSaving && <p className="text-xs text-[var(--color-muted)] mt-1">保存中...</p>}
            </div>
          </div>
        </PaperCard>
      </section>

      {/* Data */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]"><Download size={16} /> 数据管理</h2>
        <PaperCard>
          <div className="flex flex-wrap gap-3">
            <WarmButton variant="soft" size="sm" onClick={exportAllData}><Download size={16} className="mr-1.5" />导出数据</WarmButton>
            <label><WarmButton variant="soft" size="sm" onClick={() => fileRef.current?.click()}><Upload size={16} className="mr-1.5" />导入文件</WarmButton>
              <input ref={fileRef} type="file" accept=".md,.json" onChange={importData} className="hidden" /></label>
            <WarmButton variant="soft" size="sm" onClick={importFromCLI} disabled={cliImporting}>
              {cliImporting ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Database size={16} className="mr-1.5" />}
              {cliImporting ? "导入中..." : "从 CLI 导入"}
            </WarmButton>
            <WarmButton variant="ghost" size="sm" onClick={clearAll}><Trash2 size={16} className="mr-1.5" />清除数据</WarmButton>
          </div>
          {importStatus && <p className="text-xs mt-3 bg-[var(--color-primary-muted)] px-3 py-2 rounded-[var(--radius-sm)]">{importStatus}</p>}
          <p className="text-xs text-[var(--color-muted)] mt-3">数据存储在浏览器本地。「从 CLI 导入」可一键读取 CLI 系统中的 applications.md、报告和配置。支持文件导入。建议定期备份。</p>
        </PaperCard>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-muted)] mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full p-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]" />
    </div>
  );
}
