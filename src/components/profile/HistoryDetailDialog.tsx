"use client";

import { useState } from "react";
import { X, RotateCcw, AlertTriangle } from "lucide-react";
import type { ProfileHistoryEntry } from "@/types";

interface Props {
  open: boolean;
  entry: ProfileHistoryEntry | null;
  entryIndex: number;
  onClose: () => void;
  onRestore: (index: number) => Promise<void>;
}

export default function HistoryDetailDialog({ open, entry, entryIndex, onClose, onRestore }: Props) {
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  if (!open || !entry) return null;

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await onRestore(entryIndex);
      onClose();
    } catch {
      /* error handled by parent */
    } finally {
      setRestoring(false);
      setConfirmRestore(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-[var(--color-bg)] rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-divider)]">
          <h2 className="text-lg font-display text-[var(--color-text)]">变更详情</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-bg-alt)]"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-xs text-[var(--color-muted)]">
              {new Date(entry.timestamp).toLocaleString("zh-CN", {
                year: "numeric", month: "long", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
            <p className="text-sm font-medium text-[var(--color-text)] mt-1">{entry.event}</p>
          </div>

          {entry.changes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-muted)] mb-2">变更内容</p>
              <ul className="space-y-1.5">
                {entry.changes.map((c, j) => (
                  <li key={j} className="text-sm text-[var(--color-text-soft)] pl-3 border-l-2 border-[var(--color-divider)]">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {confirmRestore ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  确认还原画像到该版本？当前修改将丢失。此操作不可撤销。
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmRestore(false)}
                  className="px-3 py-1.5 text-xs rounded border border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  取消
                </button>
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="px-3 py-1.5 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {restoring ? "还原中..." : "确认还原"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRestore(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[var(--color-divider)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]"
            >
              <RotateCcw size={14} /> 还原到此版本
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
