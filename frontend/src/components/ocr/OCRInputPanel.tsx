"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Image,
  X,
  Loader2,
  Check,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { WarmButton } from "@/components/design";
import { createJD } from "@/lib/jd-storage";

interface OCRResult {
  company: string;
  role: string;
  location: string;
  salary: string;
  skills: string[];
  body: string;
  isJD: boolean;
  reason?: string;
}

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
  status: "pending" | "processing" | "done" | "error";
  result?: OCRResult;
  error?: string;
  retries: number;
  skipped?: boolean;
}

type Phase = "upload" | "processing" | "confirm" | "summary";

interface OCRInputPanelProps {
  onEvaluate?: (jdBody: string) => void;
}

export default function OCRInputPanel({ onEvaluate }: OCRInputPanelProps) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Handle paste events globally
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (phase !== "upload") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) addFiles([file]);
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [phase]);

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addFiles = useCallback(
    async (files: File[]) => {
      const newItems: QueueItem[] = [];
      for (const file of files) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) continue;
        if (file.size > 5 * 1024 * 1024) continue; // 5MB per file
        if (queue.length + newItems.length >= 10) break;

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previewUrl = URL.createObjectURL(file);
        const base64 = await toBase64(file);
        newItems.push({ id, file, previewUrl, base64, status: "pending", retries: 0 });
      }
      setQueue((prev) => [...prev, ...newItems]);
    },
    [queue.length]
  );

  const removeItem = (id: string) => {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
  };

  const processQueue = async () => {
    setPhase("processing");
    const items = [...queue];

    const processOne = async (item: QueueItem): Promise<void> => {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "processing" as const } : q))
      );
      try {
        const res = await fetch("/api/ocr/jd-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: item.base64 }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "识别失败");
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "识别失败");
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "done" as const, result: data.data }
              : q
          )
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "未知错误";
        if (item.retries < 1) {
          // Retry once
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, retries: q.retries + 1 } : q
            )
          );
          await new Promise((r) => setTimeout(r, 2000));
          return processOne({ ...item, retries: item.retries + 1 });
        }
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error" as const, error: message }
              : q
          )
        );
      }
    };

    // Process in parallel
    await Promise.all(items.map(processOne));
    setPhase("confirm");
  };

  const handleConfirmSave = async (item: QueueItem) => {
    if (!item.result) return;
    const r = item.result;
    if (r.isJD) {
      await createJD({
        company: r.company === "【缺失】" ? "" : r.company,
        role: r.role === "【缺失】" ? "" : r.role,
        sourceType: "ocr",
        body: r.body === "【缺失】" ? "" : r.body,
        keywords: r.skills,
      });
      setSavedCount((n) => n + 1);
    }
    advanceConfirm();
  };

  const handleSkip = () => {
    setQueue((prev) =>
      prev.map((q, i) => (i === confirmIndex ? { ...q, skipped: true } : q))
    );
    advanceConfirm();
  };

  const advanceConfirm = () => {
    setConfirmIndex((prev) => {
      const next = prev + 1;
      const doneItems = queue.filter((q) => q.status === "done" && !q.skipped);
      if (next >= doneItems.length) {
        setPhase("summary");
        return prev;
      }
      return next;
    });
  };

  const handleRetryFailed = (item: QueueItem) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: "pending", retries: 0, error: undefined } : q))
    );
  };

  const processingCount = queue.filter((q) => q.status === "processing").length;
  const doneCount = queue.filter((q) => q.status === "done").length;
  const errorCount = queue.filter((q) => q.status === "error").length;
  const totalCount = queue.length;
  const doneItems = queue.filter((q) => q.status === "done" && !q.skipped);
  const currentItem = doneItems[confirmIndex];

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      {phase === "upload" && (
        <>
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-[var(--radius-md)] p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]"
                : "border-[var(--color-divider)] hover:border-[var(--color-muted)]"
            }`}
          >
            <Upload size={28} className="mx-auto mb-3 text-[var(--color-muted)]" />
            <p className="text-sm text-[var(--color-text)] font-medium mb-1">
              拖拽图片到此处，或点击上传
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              支持 PNG、JPG、WebP · 单张不超过 5MB · 最多 10 张 · 支持 Ctrl+V 粘贴
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Preview queue */}
          {queue.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-text-soft)]">
                  已选择 {queue.length} 张图片
                </p>
                <button
                  onClick={() => setQueue([])}
                  className="text-xs text-[var(--color-muted)] hover:text-red-500"
                >
                  清空全部
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {queue.map((item, idx) => (
                  <div key={item.id} className="relative group">
                    <img
                      src={item.previewUrl}
                      alt={`JD 截图 ${idx + 1}`}
                      className="w-full aspect-[3/4] object-cover rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                    />
                    <span className="absolute top-0.5 left-0.5 text-[10px] bg-black/50 text-white px-1 rounded">
                      {idx + 1}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <WarmButton
                variant="primary"
                size="sm"
                onClick={processQueue}
                className="w-full"
              >
                <Sparkles size={14} className="mr-1.5" />
                开始识别（{queue.length} 张）
              </WarmButton>
            </motion.div>
          )}
        </>
      )}

      {/* Processing */}
      {phase === "processing" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-primary-muted)] flex items-center justify-center mb-4">
            <Loader2 size={28} className="text-[var(--color-primary)] animate-spin" />
          </div>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)] mb-2">
            正在识别...
          </h3>
          <p className="text-sm text-[var(--color-muted)] mb-6">
            {doneCount}/{totalCount} 完成
            {errorCount > 0 && ` · ${errorCount} 失败`}
          </p>
          {/* Progress grid */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-w-xs mx-auto">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`w-full aspect-square rounded-[var(--radius-sm)] flex items-center justify-center ${
                  item.status === "done"
                    ? "bg-emerald-50 dark:bg-emerald-950/20"
                    : item.status === "error"
                      ? "bg-red-50 dark:bg-red-950/20"
                      : item.status === "processing"
                        ? "bg-blue-50 dark:bg-blue-950/20"
                        : "bg-[var(--color-bg)]"
                }`}
              >
                {item.status === "done" && <Check size={14} className="text-emerald-500" />}
                {item.status === "error" && <X size={14} className="text-red-500" />}
                {item.status === "processing" && (
                  <Loader2 size={14} className="text-blue-500 animate-spin" />
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Confirm */}
      {phase === "confirm" && currentItem && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-soft)]">
              确认第 {confirmIndex + 1}/{doneItems.length} 张
            </p>
            <span className="text-xs text-[var(--color-muted)]">
              已保存 {savedCount} 条
            </span>
          </div>

          <ConfirmCard
            item={currentItem}
            onSave={() => handleConfirmSave(currentItem)}
            onSkip={handleSkip}
            onEvaluate={onEvaluate}
          />
        </motion.div>
      )}

      {/* Summary */}
      {phase === "summary" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center mb-4">
            <Check size={28} className="text-emerald-500" />
          </div>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-text)] mb-2">
            识别完成
          </h3>
          <p className="text-sm text-[var(--color-muted)] mb-2">
            成功保存 {savedCount} 条 JD 到库
          </p>
          {errorCount > 0 && (
            <p className="text-sm text-red-500 mb-4">{errorCount} 张识别失败</p>
          )}
          <div className="flex items-center justify-center gap-3">
            <WarmButton
              variant="soft"
              size="sm"
              onClick={() => {
                setQueue([]);
                setConfirmIndex(0);
                setSavedCount(0);
                setPhase("upload");
              }}
            >
              继续识别
            </WarmButton>
          </div>

          {/* Failed items */}
          {errorCount > 0 && (
            <div className="mt-6 text-left space-y-2">
              <p className="text-sm font-medium text-[var(--color-text)]">识别失败的图片</p>
              {queue
                .filter((q) => q.status === "error")
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-[var(--radius-sm)]"
                  >
                    <span className="text-sm text-red-600 dark:text-red-400">
                      {item.error || "识别失败"}
                    </span>
                    <WarmButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRetryFailed(item)}
                    >
                      重试
                    </WarmButton>
                  </div>
                ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

/* ── Per-item Confirmation Card ── */

function ConfirmCard({
  item,
  onSave,
  onSkip,
  onEvaluate,
}: {
  item: QueueItem;
  onSave: () => void;
  onSkip: () => void;
  onEvaluate?: (jdBody: string) => void;
}) {
  const r = item.result;
  const [editing, setEditing] = useState(r ? { ...r } : null);

  useEffect(() => {
    if (r) setEditing({ ...r });
  }, [item.id]);

  if (!editing) return null;

  const isMissing = (val: string) => val === "【缺失】" || !val.trim();
  const fieldClass = (val: string) =>
    `w-full bg-[var(--color-bg)] border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] ${
      isMissing(val)
        ? "border-yellow-400 bg-yellow-50/30 dark:bg-yellow-950/10"
        : "border-[var(--color-border)]"
    }`;

  return (
    <div className="space-y-4">
      {/* Non-JD warning */}
      {!editing.isJD && (
        <div className="p-4 rounded-[var(--radius-md)] bg-orange-50 dark:bg-orange-950/20 border-2 border-orange-300 dark:border-orange-700 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                该图片可能不是职位描述
              </p>
              <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">
                {editing.reason || "AI 未检测到公司名和职位信息。"}
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)] pl-7">
            如果你确认这是 JD 截图但识别有误，可以修改字段后仍然保存。否则建议跳过。
          </p>
        </div>
      )}

      {/* Image preview */}
      <div className="flex gap-4">
        <img
          src={item.previewUrl}
          alt="JD 截图"
          className="w-24 h-32 object-cover rounded-[var(--radius-sm)] border border-[var(--color-border)] shrink-0"
        />
        <div className="flex-1 space-y-3">
          <div>
            <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase flex items-center gap-1">
              公司 {isMissing(editing.company) && (
                <span className="text-yellow-500 flex items-center gap-0.5">
                  <AlertTriangle size={10} /> 请补充
                </span>
              )}
            </label>
            <input
              type="text"
              value={editing.company === "【缺失】" ? "" : editing.company}
              onChange={(e) => setEditing({ ...editing, company: e.target.value })}
              placeholder="请补充公司名称"
              className={fieldClass(editing.company)}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase flex items-center gap-1">
              职位 {isMissing(editing.role) && (
                <span className="text-yellow-500 flex items-center gap-0.5">
                  <AlertTriangle size={10} /> 请补充
                </span>
              )}
            </label>
            <input
              type="text"
              value={editing.role === "【缺失】" ? "" : editing.role}
              onChange={(e) => setEditing({ ...editing, role: e.target.value })}
              placeholder="请补充职位名称"
              className={fieldClass(editing.role)}
            />
          </div>
        </div>
      </div>

      {/* Extra fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase">
            地点 {isMissing(editing.location) && <span className="text-yellow-500">· 请补充</span>}
          </label>
          <input
            type="text"
            value={editing.location === "【缺失】" ? "" : editing.location}
            onChange={(e) => setEditing({ ...editing, location: e.target.value })}
            placeholder="如：北京、杭州"
            className={fieldClass(editing.location)}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase">
            薪资 {isMissing(editing.salary) && <span className="text-yellow-500">· 请补充</span>}
          </label>
          <input
            type="text"
            value={editing.salary === "【缺失】" ? "" : editing.salary}
            onChange={(e) => setEditing({ ...editing, salary: e.target.value })}
            placeholder="如：20-35K·14薪"
            className={fieldClass(editing.salary)}
          />
        </div>
      </div>

      {/* Skills */}
      <div>
        <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase">技能要求</label>
        <input
          type="text"
          value={editing.skills.join(", ")}
          onChange={(e) =>
            setEditing({
              ...editing,
              skills: e.target.value
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="如：React, TypeScript, Node.js"
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      {/* JD Body */}
      <div>
        <label className="text-[10px] font-medium text-[var(--color-muted)] uppercase flex items-center gap-1">
          JD 正文 {isMissing(editing.body) && (
            <span className="text-yellow-500 flex items-center gap-0.5">
              <AlertTriangle size={10} /> 请补充正文
            </span>
          )}
        </label>
        <textarea
          value={editing.body === "【缺失】" ? "" : editing.body}
          onChange={(e) => setEditing({ ...editing, body: e.target.value })}
          rows={8}
          placeholder="请补充或修改 JD 正文..."
          className={fieldClass(editing.body) + " resize-none"}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-divider)]">
        {editing.isJD ? (
          <>
            <WarmButton variant="primary" size="sm" onClick={() => {
              createJD({
                company: editing.company === "【缺失】" ? "" : editing.company,
                role: editing.role === "【缺失】" ? "" : editing.role,
                sourceType: "ocr",
                body: editing.body === "【缺失】" ? "" : editing.body,
                keywords: editing.skills,
              });
              onSave();
            }}>
              <Check size={12} className="mr-1" />
              保存到 JD 库
            </WarmButton>
            {onEvaluate && editing.body !== "【缺失】" && editing.body.trim() && (
              <WarmButton
                variant="soft"
                size="sm"
                onClick={() => onEvaluate(editing.body)}
              >
                <Sparkles size={12} className="mr-1" />
                直接评估
              </WarmButton>
            )}
            <WarmButton variant="ghost" size="sm" onClick={onSkip}>
              跳过
            </WarmButton>
          </>
        ) : (
          <>
            <WarmButton variant="primary" size="sm" onClick={onSkip}>
              跳过，这不是 JD
            </WarmButton>
            <WarmButton variant="ghost" size="sm" onClick={() => {
              createJD({
                company: editing.company === "【缺失】" ? "" : editing.company,
                role: editing.role === "【缺失】" ? "" : editing.role,
                sourceType: "ocr",
                body: editing.body === "【缺失】" ? "" : editing.body,
                keywords: editing.skills,
              });
              onSave();
            }}>
              <Check size={12} className="mr-1" />
              仍然保存
            </WarmButton>
          </>
        )}
      </div>
    </div>
  );
}
