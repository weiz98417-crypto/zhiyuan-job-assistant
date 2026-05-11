"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, GitCompare } from "lucide-react";
import { WarmButton, PaperCard } from "@/components/design";
import { diffVersions } from "@/lib/version-diff";
import type { CVSection } from "@/types";

interface VersionDiffProps {
  oldVersion: { id: string; label: string; sections: CVSection[] };
  newVersion: { id: string; label: string; sections: CVSection[] };
  versionIds: string[];
  versionLabels: Record<string, string>;
  onSwitchVersion: (oldId: string, newId: string) => void;
  onSetCurrent: (versionId: string) => void;
  onBack: () => void;
}

export default function VersionDiff({
  oldVersion,
  newVersion,
  versionIds,
  versionLabels,
  onSwitchVersion,
  onSetCurrent,
  onBack,
}: VersionDiffProps) {
  const [leftId, setLeftId] = useState(oldVersion.id);
  const [rightId, setRightId] = useState(newVersion.id);

  const result = useMemo(
    () => diffVersions(oldVersion.sections, newVersion.sections),
    [oldVersion, newVersion],
  );

  const handleSwitch = (side: "left" | "right", versionId: string) => {
    if (side === "left") {
      setLeftId(versionId);
      onSwitchVersion(versionId, rightId);
    } else {
      setRightId(versionId);
      onSwitchVersion(leftId, versionId);
    }
  };

  const { diffs, stats } = result;
  const noChanges = !diffs.some(d => d.hasChanges);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <WarmButton variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} className="mr-1" />
            返回编辑
          </WarmButton>
          <span className="text-sm text-[var(--color-muted)]">
            版本对比
          </span>
        </div>
      </div>

      {/* Version selectors + stats */}
      <PaperCard padding="md">
        <div className="grid gap-4 sm:grid-cols-2 mb-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] mb-1 block">旧版本</label>
            <select
              value={leftId}
              onChange={(e) => handleSwitch("left", e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm"
            >
              {versionIds.map((vid) => (
                <option key={vid} value={vid}>
                  {vid} · {versionLabels[vid] || vid}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] mb-1 block">新版本</label>
            <select
              value={rightId}
              onChange={(e) => handleSwitch("right", e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm"
            >
              {versionIds.map((vid) => (
                <option key={vid} value={vid}>
                  {vid} · {versionLabels[vid] || vid}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs px-2 py-1 rounded-full bg-[var(--color-divider)] text-[var(--color-text-soft)]">
            修改了 {stats.sectionsChanged} 个板块
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            +{stats.addedLines} 新增行
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300">
            -{stats.removedLines} 删除行
          </span>
          {stats.quantGain > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              +{stats.quantGain} 量化表述
            </span>
          )}
          {stats.quantLoss > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300">
              -{stats.quantLoss} 量化表述
            </span>
          )}
        </div>

        {noChanges && (
          <p className="text-sm text-[var(--color-muted)] text-center py-4">
            两个版本内容一致
          </p>
        )}

        {/* Side-by-side diff */}
        <div className="grid gap-4 sm:grid-cols-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {diffs.filter(d => d.hasChanges).map((section) => (
            <div key={section.sectionId} className="sm:col-span-2">
              <h4 className="text-sm font-bold text-[var(--color-text)] mb-2 pb-1 border-b border-[var(--color-divider)]">
                {section.sectionTitle}
              </h4>
              <div className="grid sm:grid-cols-2 gap-2">
                {/* Left: old */}
                <div className="p-2 rounded-[var(--radius-sm)] bg-red-50/50 dark:bg-red-950/10 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                  {section.lines
                    .filter(l => l.type !== "added")
                    .map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.type === "removed"
                            ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-1 -mx-1"
                            : "text-[var(--color-text-soft)]"
                        }
                      >
                        {line.type === "removed" ? "- " : "  "}{line.text || " "}
                      </div>
                    ))}
                </div>
                {/* Right: new */}
                <div className="p-2 rounded-[var(--radius-sm)] bg-emerald-50/50 dark:bg-emerald-950/10 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                  {section.lines
                    .filter(l => l.type !== "removed")
                    .map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.type === "added"
                            ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-1 -mx-1"
                            : "text-[var(--color-text-soft)]"
                        }
                      >
                        {line.type === "added" ? "+ " : "  "}{line.text || " "}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PaperCard>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <WarmButton
          variant="primary"
          size="sm"
          onClick={() => onSetCurrent(rightId)}
        >
          <Check size={14} className="mr-1" />
          将右侧版本设为当前
        </WarmButton>
        <WarmButton variant="ghost" size="sm" onClick={onBack}>
          返回编辑
        </WarmButton>
      </div>
    </div>
  );
}
