import type { CVSection } from "@/types";

export interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

export interface SectionDiff {
  sectionId: string;
  sectionTitle: string;
  hasChanges: boolean;
  lines: DiffLine[];
}

export interface DiffStats {
  addedLines: number;
  removedLines: number;
  quantGain: number;     // new quantified metrics added
  quantLoss: number;     // quantified metrics removed
  sectionsChanged: number;
}

function simpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff on lines
  const maxLen = Math.max(oldLines.length, newLines.length);

  // Build LCS table
  const lcs: number[][] = Array(oldLines.length + 1).fill(null)
    .map(() => Array(newLines.length + 1).fill(0));

  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1].trim() === newLines[j - 1].trim()) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack
  const diffLines: { type: "same" | "added" | "removed"; text: string }[] = [];
  let i = oldLines.length, j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1].trim() === newLines[j - 1].trim()) {
      diffLines.unshift({ type: "same", text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      diffLines.unshift({ type: "added", text: newLines[j - 1] });
      j--;
    } else if (i > 0) {
      diffLines.unshift({ type: "removed", text: oldLines[i - 1] });
      i--;
    }
  }

  return diffLines;
}

function countQuantMetrics(text: string): number {
  // Count lines that contain numbers indicating quantified achievements
  const lines = text.split("\n");
  let count = 0;
  for (const line of lines) {
    // Match: digits, percentages, comparisons
    if (/(\d+%|\d+倍|\d+万|\d+亿|\d+\s*[kK]|提升|增长|降低|减少|翻倍|DAU|MAU|GMV)/.test(line)) {
      count++;
    }
  }
  return count;
}

export function diffVersions(oldSections: CVSection[], newSections: CVSection[]): {
  diffs: SectionDiff[];
  stats: DiffStats;
} {
  const diffs: SectionDiff[] = [];
  const stats: DiffStats = { addedLines: 0, removedLines: 0, quantGain: 0, quantLoss: 0, sectionsChanged: 0 };

  // Align by section ID
  const oldMap = new Map(oldSections.map(s => [s.id, s]));
  const newMap = new Map(newSections.map(s => [s.id, s]));
  const allIds = [...new Set([...oldMap.keys(), ...newMap.keys()])];

  for (const id of allIds) {
    const oldContent = oldMap.get(id)?.content || "";
    const newContent = newMap.get(id)?.content || "";
    const title = newMap.get(id)?.title || oldMap.get(id)?.title || id;

    if (oldContent === newContent) {
      diffs.push({
        sectionId: id,
        sectionTitle: title,
        hasChanges: false,
        lines: oldContent ? [{ type: "same", text: oldContent }] : [],
      });
      continue;
    }

    const lines = simpleDiff(oldContent, newContent);
    const oldQuant = countQuantMetrics(oldContent);
    const newQuant = countQuantMetrics(newContent);

    diffs.push({ sectionId: id, sectionTitle: title, hasChanges: true, lines });

    for (const line of lines) {
      if (line.type === "added") stats.addedLines++;
      if (line.type === "removed") stats.removedLines++;
    }

    if (newQuant > oldQuant) stats.quantGain += (newQuant - oldQuant);
    if (oldQuant > newQuant) stats.quantLoss += (oldQuant - newQuant);
    if (lines.some(l => l.type !== "same")) stats.sectionsChanged++;
  }

  return { diffs, stats };
}
