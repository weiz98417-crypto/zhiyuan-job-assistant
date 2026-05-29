"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Lock, Unlock } from "lucide-react";
import type { ProfileSkill } from "@/types";

interface Props {
  open: boolean;
  skills: ProfileSkill[];
  onClose: () => void;
  onSaved: () => void;
}

interface SkillEntry extends ProfileSkill {
  dirty: boolean; // modified by user in this session
}

export default function EditSkillsDialog({ open, skills, onClose, onSaved }: Props) {
  const [entries, setEntries] = useState<SkillEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setEntries(skills.map((s) => ({ ...s, dirty: false })));
      setError("");
    }
  }, [open, skills]);

  if (!open) return null;

  const addSkill = () => {
    setEntries([...entries, { name: "", proficiency: 50, evidence: [], source: "manual", dirty: true }]);
  };

  const removeSkill = (i: number) => {
    if (deleteConfirm === i) {
      setEntries(entries.filter((_, j) => j !== i));
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(i);
    }
  };

  const cancelDelete = () => setDeleteConfirm(null);

  const updateName = (i: number, name: string) => {
    const next = [...entries];
    next[i] = { ...next[i], name, dirty: true };
    setEntries(next);
  };

  const updateProficiency = (i: number, proficiency: number) => {
    const next = [...entries];
    next[i] = { ...next[i], proficiency, dirty: true };
    setEntries(next);
  };

  const toggleLock = (i: number) => {
    const next = [...entries];
    const current = next[i];
    next[i] = { ...current, source: current.source === "manual" ? "auto" : "manual", dirty: true };
    setEntries(next);
  };

  const handleSave = async () => {
    const valid = entries.filter((e) => e.name.trim());
    if (valid.length === 0) { setError("请至少保留一项技能"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/data/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            skills: valid.map((entry) => ({
              name: entry.name,
              proficiency: entry.proficiency,
              evidence: entry.evidence,
              source: entry.dirty ? ("manual" as const) : (entry.source || ("auto" as const)),
            })),
          },
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
        className="bg-[var(--color-bg)] rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-divider)]">
          <h2 className="text-lg font-display text-[var(--color-text)]">编辑核心技能</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-bg-alt)]"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {entries.map((skill, i) => (
            <div key={i} className="p-3 rounded-lg border border-[var(--color-divider)] space-y-2">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 px-3 py-1.5 rounded border border-[var(--color-divider)] bg-[var(--color-surface)] text-sm"
                  placeholder="技能名称"
                  value={skill.name}
                  onChange={(e) => updateName(i, e.target.value)}
                />
                <button
                  onClick={() => toggleLock(i)}
                  className={`p-1.5 rounded ${skill.source === "manual" ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}
                  title={skill.source === "manual" ? "已锁定 — 点击解锁" : "未锁定 — 点击锁定"}
                >
                  {skill.source === "manual" ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                {deleteConfirm === i ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => removeSkill(i)} className="px-2 py-1 text-xs text-white bg-red-500 rounded">确认删除</button>
                    <button onClick={cancelDelete} className="px-2 py-1 text-xs text-[var(--color-muted)] rounded hover:bg-[var(--color-bg-alt)]">取消</button>
                  </div>
                ) : (
                  <button onClick={() => removeSkill(i)} className="p-1.5 text-[var(--color-muted)] hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-muted)] w-10 text-right">{skill.proficiency}%</span>
                <input
                  type="range" min={0} max={100} value={skill.proficiency}
                  onChange={(e) => updateProficiency(i, Number(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none bg-[var(--color-divider)] accent-[var(--color-primary)]"
                />
                {skill.dirty && <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" title="已修改" />}
              </div>
            </div>
          ))}

          <button onClick={addSkill} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
            <Plus size={14} /> 添加技能
          </button>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

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
