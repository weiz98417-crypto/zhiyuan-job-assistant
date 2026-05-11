"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Check, Target } from "lucide-react";
import { WarmButton } from "@/components/design";
import { loadProfile, saveProfile } from "@/lib/profile-storage";
import { createEmptyProfile } from "@/lib/profile-storage";
import type { ZhiyuanProfileGoals } from "@/types";

interface GoalSettingWizardProps {
  onClose: () => void;
  onComplete: () => void;
  existingGoals?: ZhiyuanProfileGoals;
}

const ROLES = [
  "产品经理", "后端工程师", "前端工程师", "数据工程师",
  "AI/算法工程师", "运营", "市场/增长", "设计", "其他",
];
const LEVELS = ["初级", "中级", "高级", "专家/负责人", "管理"];
const DEAL_BREAKERS = [
  "不接受 996/大小周", "不接受出差", "不接受外包/劳务派遣",
  "必须有公积金", "试用期 ≤ 3 个月", "无竞业限制",
];
const COMPANY_SIZES = ["大厂(1000+)", "中型(100-999)", "小型(50-99)", "初创(<50)", "外企", "国企"];
const INDUSTRIES = ["AI/大模型", "互联网", "电商", "金融科技", "教育科技", "医疗健康", "游戏", "企业服务", "其他"];
const WORK_STYLES = ["远程办公", "混合办公", "现场办公"];

const TOTAL_STEPS = 5;

export default function GoalSettingWizard({ onClose, onComplete, existingGoals }: GoalSettingWizardProps) {
  const [step, setStep] = useState(1);
  const [roles, setRoles] = useState<string[]>(existingGoals?.targetRoles.map((r) => r.role) ?? []);
  const [level, setLevel] = useState(existingGoals?.targetRoles[0]?.level ?? "");
  const [salaryMin, setSalaryMin] = useState(existingGoals?.salaryRange.min ?? 15);
  const [salaryMax, setSalaryMax] = useState(existingGoals?.salaryRange.max ?? 40);
  const [dealBreakers, setDealBreakers] = useState<string[]>(existingGoals?.dealBreakers ?? []);
  const [customBreaker, setCustomBreaker] = useState("");
  const [customBreakers, setCustomBreakers] = useState<string[]>(
    existingGoals?.dealBreakers?.filter((d) => !DEAL_BREAKERS.includes(d)) ?? [],
  );
  const [sizePrefs, setSizePrefs] = useState<string[]>(existingGoals?.companyPrefs?.size ?? []);
  const [industryPrefs, setIndustryPrefs] = useState<string[]>(existingGoals?.companyPrefs?.industry ?? []);
  const [workStylePrefs, setWorkStylePrefs] = useState<string[]>(existingGoals?.companyPrefs?.workStyle ?? []);

  const toggle = (arr: string[], set: (v: string[]) => void, item: string) => {
    set(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const handleConfirm = async () => {
    const goals: ZhiyuanProfileGoals = {
      targetRoles: roles.map((role) => ({ role, level: level || "中级" })),
      salaryRange: { min: salaryMin, max: salaryMax },
      dealBreakers: [...dealBreakers, ...customBreakers],
      companyPrefs: { size: sizePrefs, industry: industryPrefs, workStyle: workStylePrefs },
    };

    let profile = await loadProfile();
    if (!profile) profile = createEmptyProfile();
    profile.goals = goals;
    profile.history.push({
      timestamp: new Date().toISOString(),
      event: existingGoals ? "更新了求职目标" : "设定了求职目标",
      changes: [
        `目标角色: ${roles.join("、")}`,
        `薪资范围: ${salaryMin}K-${salaryMax}K`,
        `底线条件: ${dealBreakers.length + customBreakers.length} 项`,
      ],
    });
    await saveProfile(profile);
    onComplete();
  };

  const canNext = () => {
    switch (step) {
      case 1: return roles.length > 0 && !!level;
      case 2: return salaryMin > 0 && salaryMax >= salaryMin;
      default: return true;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-display text-[var(--color-text)]">
            {existingGoals ? "调整求职目标" : "设定求职目标"}
          </h2>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-3 flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i + 1 <= step ? "bg-[var(--color-primary)]" : "bg-[var(--color-divider)]"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 py-4 min-h-[260px]">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text)] font-medium">
                你想找什么样的工作？
              </p>
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-2">角色（可多选）</p>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => toggle(roles, setRoles, r)}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                        roles.includes(r)
                          ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                          : "bg-[var(--color-divider)] text-[var(--color-text-soft)]"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-2">级别</p>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                        level === l
                          ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                          : "bg-[var(--color-divider)] text-[var(--color-text-soft)]"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text)] font-medium">你的薪资期望？</p>
              <div>
                <label className="text-xs text-[var(--color-muted)]">税前月薪范围 (K)</label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(Number(e.target.value))}
                    className="w-20 text-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-2 text-sm"
                    min={5}
                    max={100}
                  />
                  <span className="text-[var(--color-muted)]">—</span>
                  <input
                    type="number"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(Number(e.target.value))}
                    className="w-20 text-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-2 text-sm"
                    min={5}
                    max={100}
                  />
                  <span className="text-xs text-[var(--color-muted)]">K/月</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(Math.min(Number(e.target.value), salaryMax))}
                  className="w-full mt-3 accent-[var(--color-primary)]"
                />
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(Math.max(Number(e.target.value), salaryMin))}
                  className="w-full mt-1 accent-[var(--color-primary)]"
                />
                <p className="text-xs text-[var(--color-muted)] mt-2">
                  {salaryMin}K - {salaryMax}K / 月（税前）
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text)] font-medium">
                哪些条件不能妥协？
              </p>
              <div className="flex flex-wrap gap-2">
                {DEAL_BREAKERS.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggle(dealBreakers, setDealBreakers, d)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                      dealBreakers.includes(d)
                        ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                        : "bg-[var(--color-divider)] text-[var(--color-text-soft)]"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customBreaker}
                  onChange={(e) => setCustomBreaker(e.target.value)}
                  placeholder="自定义条件..."
                  className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customBreaker.trim()) {
                      setCustomBreakers([...customBreakers, customBreaker.trim()]);
                      setCustomBreaker("");
                    }
                  }}
                />
                <WarmButton variant="ghost" size="sm" onClick={() => {
                  if (customBreaker.trim()) {
                    setCustomBreakers([...customBreakers, customBreaker.trim()]);
                    setCustomBreaker("");
                  }
                }}>
                  添加
                </WarmButton>
              </div>
              {customBreakers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customBreakers.map((c) => (
                    <span key={c} className="text-xs px-2 py-1 rounded-full bg-[var(--color-primary-muted)] text-[var(--color-text-soft)] flex items-center gap-1">
                      {c}
                      <button onClick={() => setCustomBreakers(customBreakers.filter((x) => x !== c))}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <p className="text-sm text-[var(--color-text)] font-medium">你对公司有什么偏好？</p>
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-2">公司规模</p>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggle(sizePrefs, setSizePrefs, s)}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                        sizePrefs.includes(s)
                          ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                          : "bg-[var(--color-divider)] text-[var(--color-text-soft)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-2">行业</p>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      onClick={() => toggle(industryPrefs, setIndustryPrefs, ind)}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                        industryPrefs.includes(ind)
                          ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                          : "bg-[var(--color-divider)] text-[var(--color-text-soft)]"
                      }`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)] mb-2">工作方式</p>
                <div className="flex flex-wrap gap-2">
                  {WORK_STYLES.map((w) => (
                    <button
                      key={w}
                      onClick={() => toggle(workStylePrefs, setWorkStylePrefs, w)}
                      className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                        workStylePrefs.includes(w)
                          ? "bg-[var(--color-primary)] text-[var(--color-surface-raised)]"
                          : "bg-[var(--color-divider)] text-[var(--color-text-soft)]"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text)] font-medium flex items-center gap-2">
                <Target size={16} className="text-[var(--color-primary)]" />
                确认你的求职目标
              </p>
              <div className="space-y-3 text-sm">
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-3">
                  <span className="text-xs text-[var(--color-muted)]">目标角色</span>
                  <p className="text-[var(--color-text)] mt-0.5">
                    {roles.length > 0 ? roles.join("、") : "未选择"} · {level || "未选择"}
                  </p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-3">
                  <span className="text-xs text-[var(--color-muted)]">薪资期望</span>
                  <p className="text-[var(--color-text)] mt-0.5">{salaryMin}K - {salaryMax}K / 月（税前）</p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-3">
                  <span className="text-xs text-[var(--color-muted)]">底线条件</span>
                  <p className="text-[var(--color-text)] mt-0.5">
                    {[...dealBreakers, ...customBreakers].length > 0
                      ? [...dealBreakers, ...customBreakers].join("、")
                      : "无特殊要求"}
                  </p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-3">
                  <span className="text-xs text-[var(--color-muted)]">公司偏好</span>
                  <p className="text-[var(--color-text)] mt-0.5">
                    {sizePrefs.length > 0 ? `规模: ${sizePrefs.join("、")}` : "规模不限"}
                    {industryPrefs.length > 0 ? ` · 行业: ${industryPrefs.join("、")}` : ""}
                    {workStylePrefs.length > 0 ? ` · 工作方式: ${workStylePrefs.join("、")}` : ""}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
            上一步
          </button>
          <span className="text-xs text-[var(--color-muted)]">{step}/{TOTAL_STEPS}</span>
          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="flex items-center gap-1 text-sm text-[var(--color-primary)] hover:opacity-80 disabled:opacity-30 transition-colors"
            >
              下一步
              <ChevronRight size={14} />
            </button>
          ) : (
            <WarmButton variant="primary" size="sm" onClick={handleConfirm}>
              <Check size={14} className="mr-1" />
              确认
            </WarmButton>
          )}
        </div>
      </div>
    </div>
  );
}
