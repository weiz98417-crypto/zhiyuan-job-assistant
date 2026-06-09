import type { CVSection, CVersion, CVData } from "@/types";

const STORAGE_KEY = "zhiyuan-cv";

const DEFAULT_SECTIONS: CVSection[] = [
  { id: "summary", title: "个人概述", content: "" },
  { id: "experience", title: "工作经历", content: "" },
  { id: "projects", title: "项目经验", content: "" },
  { id: "education", title: "教育背景", content: "" },
  { id: "skills", title: "技能", content: "" },
];

function isLegacyFormat(data: unknown): data is CVSection[] {
  return Array.isArray(data) && data.length > 0 && "id" in (data[0] || {});
}

function migrateFromLegacy(legacy: CVSection[]): CVData {
  return {
    activeVersion: "v1",
    versions: {
      v1: {
        id: "v1",
        label: "初始版本",
        createdAt: new Date().toISOString(),
        sections: legacy,
        source: "manual",
      },
    },
  };
}

function createDefaultCVData(): CVData {
  return {
    activeVersion: "v1",
    versions: {
      v1: {
        id: "v1",
        label: "初始版本",
        createdAt: new Date().toISOString(),
        sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
        source: "manual",
      },
    },
  };
}

export function normalizeCVData(data: unknown): CVData {
  if (isLegacyFormat(data)) {
    return migrateFromLegacy(data);
  }

  if (data && typeof data === "object" && "activeVersion" in data && "versions" in data) {
    return data as CVData;
  }

  return createDefaultCVData();
}

export function loadCVData(): CVData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultCVData();

    const parsed = JSON.parse(raw);

    if (isLegacyFormat(parsed)) {
      const migrated = normalizeCVData(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return normalizeCVData(parsed);
  } catch {
    return createDefaultCVData();
  }
}

export async function loadCVDataFromServer(): Promise<CVData | null> {
  try {
    const res = await fetch("/api/cv/data", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.data || Object.keys(json.data).length === 0) return null;
    const data = normalizeCVData(json.data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function saveCVData(data: CVData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  // Also sync to server (fire-and-forget)
  fetch("/api/cv/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).catch(() => {});
}

export function getActiveSections(): CVSection[] {
  const data = loadCVData();
  const active = data.versions[data.activeVersion];
  return active?.sections ?? DEFAULT_SECTIONS.map((s) => ({ ...s }));
}

export function createVersion(label: string): CVData {
  const data = loadCVData();
  const active = data.versions[data.activeVersion];
  const ids = Object.keys(data.versions)
    .map((k) => parseInt(k.replace("v", ""), 10))
    .filter((n) => !isNaN(n));
  const nextId = `v${(ids.length > 0 ? Math.max(...ids) : 0) + 1}`;

  data.versions[nextId] = {
    id: nextId,
    label: label || "新版本",
    createdAt: new Date().toISOString(),
    sections: active ? active.sections.map((s) => ({ ...s })) : DEFAULT_SECTIONS.map((s) => ({ ...s })),
    source: "manual",
  };
  data.activeVersion = nextId;
  saveCVData(data);
  return data;
}

export function deleteVersion(versionId: string): CVData {
  const data = loadCVData();
  const ids = Object.keys(data.versions);
  if (ids.length <= 1) return data;

  delete data.versions[versionId];

  if (data.activeVersion === versionId) {
    const remaining = Object.keys(data.versions);
    data.activeVersion = remaining[remaining.length - 1];
  }

  saveCVData(data);
  return data;
}

export function switchVersion(versionId: string): CVData | null {
  const data = loadCVData();
  if (!data.versions[versionId]) return null;
  data.activeVersion = versionId;
  saveCVData(data);
  return data;
}

export function renameVersion(versionId: string, newLabel: string): CVData | null {
  const data = loadCVData();
  if (!data.versions[versionId]) return null;
  data.versions[versionId].label = newLabel;
  saveCVData(data);
  return data;
}

export function getCVFullText(): string {
  const sections = getActiveSections();
  return sections
    .filter((s) => s.content.trim())
    .map((s) => `【${s.title}】\n${s.content}`)
    .join("\n\n");
}

export function isCVEmpty(): boolean {
  return getCVFullText().trim().length === 0;
}

export function computeSectionsHash(sections: CVSection[]): string {
  return sections
    .map((s) => `${s.id}:${s.content}`)
    .join("|");
}
