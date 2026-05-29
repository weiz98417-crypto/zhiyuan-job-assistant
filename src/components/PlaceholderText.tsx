"use client";

import { useState, useCallback } from "react";

interface PlaceholderTextProps {
  text: string;
  onReplace?: (originalText: string, newText: string) => void;
  className?: string;
}

interface ParsedSegment {
  type: "text" | "placeholder";
  value: string;
  label?: string; // for [XX: label] format
}

/**
 * Renders text with [XX] or [XX: hint] placeholders as clickable yellow-highlighted tokens.
 * Clicking a placeholder opens it for inline editing.
 */
export default function PlaceholderText({ text, onReplace, className = "" }: PlaceholderTextProps) {
  const [editingPlaceholder, setEditingPlaceholder] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const parseText = useCallback((input: string): ParsedSegment[] => {
    const segments: ParsedSegment[] = [];
    const regex = /\[XX(?::\s*([^\]]*))?\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", value: input.slice(lastIndex, match.index) });
      }
      segments.push({
        type: "placeholder",
        value: match[0],
        label: match[1] || undefined,
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < input.length) {
      segments.push({ type: "text", value: input.slice(lastIndex) });
    }

    return segments;
  }, []);

  const segments = parseText(text);

  const handlePlaceholderClick = (placeholder: string) => {
    setEditingPlaceholder(placeholder);
    setEditingValue("");
  };

  const handleConfirm = () => {
    if (editingPlaceholder && editingValue.trim() && onReplace) {
      onReplace(editingPlaceholder, editingValue.trim());
    }
    setEditingPlaceholder(null);
    setEditingValue("");
  };

  const handleCancel = () => {
    setEditingPlaceholder(null);
    setEditingValue("");
  };

  return (
    <span className={`${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.value}</span>;
        }

        const isEditing = editingPlaceholder === seg.value;

        return (
          <span key={i} className="inline-flex items-center">
            {isEditing ? (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirm();
                    if (e.key === "Escape") handleCancel();
                  }}
                  placeholder={seg.label || "填入真实数据..."}
                  className="w-20 px-1.5 py-0.5 text-sm border border-amber-400 rounded bg-amber-50 dark:bg-amber-950/30 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  onClick={handleConfirm}
                  className="text-xs px-1 py-0.5 rounded bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  ✓
                </button>
                <button
                  onClick={handleCancel}
                  className="text-xs px-1 py-0.5 rounded bg-gray-300 text-gray-700 hover:bg-gray-400"
                >
                  ✕
                </button>
              </span>
            ) : (
              <span
                onClick={() => onReplace && handlePlaceholderClick(seg.value)}
                title={seg.label ? `推断：${seg.label}` : "点击填入真实数据"}
                className={`inline-block px-1 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200 text-sm cursor-pointer hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors ${
                  onReplace ? "" : "cursor-default"
                }`}
              >
                {seg.value}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
