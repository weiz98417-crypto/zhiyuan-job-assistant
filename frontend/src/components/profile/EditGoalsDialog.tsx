"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Lock, Unlock } from "lucide-react";
import type { ZhiyuanProfileGoals } from "@/types";

interface Props {
  open: boolean;
  goals: ZhiyuanProfileGoals | undefined;
  isLocked: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface RoleEntry {
  role: string;
  level: string;
}

export default function EditGoalsDialog({ open, goals, isLocked, onClose, onSaved }: Props) {
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [salaryMin, setSalaryMin] = useState(0);
  const [salaryMax, setSalaryMax] = useState(0);
  const [dealBreakers, setDealBreakers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && goals) {
      setRoles(goals.targetRoles?.length ? goals.targetRoles.map((r) => ({ role: r.role, level: r.level || "" })) : [{ role: "", level: "" }]);
      setSalaryMin(goals.salaryRange?.min || 0);
      setSalaryMax(goals.salaryRange?.max || 0);
      setDealBreakers(goals.dealBreakers || []);
      setError("");
    }
  }, [open, goals]);

  if (!open) return null;

  const addRole = () => setRoles([...roles, { role: "", level: "" }]);
  const removeRole = (i: number) => { if (roles.length > 1) setRoles(roles.filter((_, j) => j !== i)); };
  const updateRole = (i: number, field: "role" | "level", value: string) => {
    const next = [...roles];
    next[i] = { ...next[i], [field]: value };
    setRoles(next);
  };

  const addDealBreaker = () => setDealBreakers([...dealBreakers, ""]);
  const removeDealBreaker = (i: number) => setDealBreakers(dealBreakers.filter((_, j) => j !== i));
  const updateDealBreaker = (i: number, value: string) => {
    const next = [...dealBreakers];
    next[i] = value;
    setDealBreakers(next);
  };

  const handleSave = async () => {
    setError("");

    // Validation
    const validRoles = roles.filter((r) => r.role.trim());
    if (validRoles.length === 0) { setError("请至少填写一个目标岗位"); return; }
    if (salaryMin > 0 && salaryMax > 0 && salaryMin > salaryMax) { setError("最低薪资不能高于最高薪资"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/data/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals: {
            targetRoles: validRoles,
            salaryRange: { min: salaryMin, max: salaryMax },
            dealBreakers: dealBreakers.filter((d) => d.trim()),
            confirmedAt: new Date().toISOString(),
          },
          source: "manual",
        }),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        setError("保存失败，请重试");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-[var(--color-bg)] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-divider)]">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-display text-[var(--color-text)]">编辑求职目标</h2>
            {isLocked && <Lock size={14} className="text-[var(--color-primary)]" aria-label="手动锁定，AI 不会自动修改" />}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-bg-alt)]"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5">
          {/* Target Roles */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">目标岗位</label>
            {roles.map((r, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] text-sm text-[var(--color-text)]"
                  placeholder="岗位名称，如：AI产品经理"
                  value={r.role}
                  onChange={(e) => updateRole(i, "role", e.target.value)}
                />
                <select
                  className="w-28 px-2 py-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] text-sm text-[var(--color-text)]"
                  value={r.level}
                  onChange={(e) => updateRole(i, "level", e.target.value)}
                >
                  <option value="">级别</option>
                  <option value="初级">初级</option>
                  <option value="中级">中级</option>
                  <option value="高级">高级</option>
                  <option value="负责人">负责人</option>
                  <option value="专家">专家</option>
                </select>
                {roles.length > 1 && (
                  <button onClick={() => removeRole(i)} className="p-2 text-[var(--color-muted)] hover:text-red-500"><Trash2 size={16} /></button>
                )}
              </div>
            ))}
            <button onClick={addRole} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
              <Plus size={14} /> 添加岗位
            </button>
          </div>

          {/* Salary Range */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">薪资期望（K/月，税前）</label>
            <div className="flex items-center gap-2">
              <input
                type="number" className="w-24 px-3 py-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] text-sm"
                placeholder="最低" value={salaryMin || ""} onChange={(e) => setSalaryMin(Number(e.target.value))}
              />
              <span className="text-sm text-[var(--color-muted)]">—</span>
              <input
                type="number" className="w-24 px-3 py-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] text-sm"
                placeholder="最高" value={salaryMax || ""} onChange={(e) => setSalaryMax(Number(e.target.value))}
              />
              <span className="text-xs text-[var(--color-muted)]">K</span>
            </div>
          </div>

          {/* Deal Breakers */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">底线条件</label>
            {dealBreakers.map((d, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] text-sm"
                  placeholder="例如：五险一金全额、不加班"
                  value={d}
                  onChange={(e) => updateDealBreaker(i, e.target.value)}
                />
                <button onClick={() => removeDealBreaker(i)} className="p-2 text-[var(--color-muted)] hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
            <button onClick={addDealBreaker} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
              <Plus size={14} /> 添加底线条件
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-divider)]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">取消</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
