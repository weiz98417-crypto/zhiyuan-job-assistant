import type { CVSection, CVData } from "@/types";
import { stableContentHash } from "@/lib/agent/verified-action";

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

export function createDefaultCVData(): CVData {
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
    if (!json.success) return null;
    const data = normalizeCVData(json.data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export async function saveCVData(data: CVData, baseData?: CVData): Promise<CVData> {
  const baseVersion = baseData?.activeVersion || "";
  const baseHash = baseVersion ? stableContentHash(baseData?.versions[baseVersion] || null) : "";
  const response = await fetch("/api/cv/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data,
      expectedActiveVersion: baseVersion || undefined,
      expectedBaseHash: baseHash || undefined,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || "简历保存失败");
  const readBackResponse = await fetch("/api/cv/data", { cache: "no-store" });
  const readBack = await readBackResponse.json().catch(() => ({}));
  if (!readBackResponse.ok || !readBack.success || !readBack.data) throw new Error(readBack.error || "简历保存后读回失败");
  const persisted = normalizeCVData(readBack.data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  return persisted;
}

export function getActiveSections(): CVSection[] {
  const data = loadCVData();
  const active = data.versions[data.activeVersion];
  return active?.sections ?? DEFAULT_SECTIONS.map((s) => ({ ...s }));
}

export async function createVersion(label: string): Promise<CVData> {
  const baseData = loadCVData();
  const data = cloneCVData(baseData);
  const active = baseData.versions[baseData.activeVersion];
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
  return saveCVData(data, baseData);
}

export async function deleteVersion(versionId: string): Promise<CVData> {
  const baseData = loadCVData();
  const data = cloneCVData(baseData);
  const ids = Object.keys(data.versions);
  if (ids.length <= 1) return data;

  delete data.versions[versionId];

  if (data.activeVersion === versionId) {
    const remaining = Object.keys(data.versions);
    data.activeVersion = remaining[remaining.length - 1];
  }

  return saveCVData(data, baseData);
}

export async function switchVersion(versionId: string): Promise<CVData | null> {
  const baseData = loadCVData();
  const data = cloneCVData(baseData);
  if (!data.versions[versionId]) return null;
  data.activeVersion = versionId;
  return saveCVData(data, baseData);
}

export async function renameVersion(versionId: string, newLabel: string): Promise<CVData | null> {
  const baseData = loadCVData();
  const data = cloneCVData(baseData);
  if (!data.versions[versionId]) return null;
  data.versions[versionId].label = newLabel;
  return saveCVData(data, baseData);
}

function cloneCVData(data: CVData): CVData {
  return JSON.parse(JSON.stringify(data)) as CVData;
}

export function getCVFullText(): string {
  return getCVFullTextFromData(loadCVData());
}

export function getCVFullTextFromData(data: CVData): string {
  const sections = data.versions[data.activeVersion]?.sections || [];
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
