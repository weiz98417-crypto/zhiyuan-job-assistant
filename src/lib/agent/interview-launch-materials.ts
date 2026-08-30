import type { JDRecord, JDSourceType } from "@/types";

const JD_SOURCE_TYPES = new Set<JDSourceType>(["paste", "ocr", "url", "agent", "discovery"]);

export function normalizeInterviewJDs(value: unknown): JDRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    const sourceType = typeof row.sourceType === "string" && JD_SOURCE_TYPES.has(row.sourceType as JDSourceType)
      ? row.sourceType as JDSourceType
      : "paste";
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt || ""));
    return [{
      ...row,
      id,
      company: typeof row.company === "string" ? row.company : "",
      role: typeof row.role === "string" ? row.role : "",
      sourceType,
      sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : undefined,
      body: typeof row.body === "string" ? row.body : "",
      keywords: Array.isArray(row.keywords) ? row.keywords.filter((keyword): keyword is string => typeof keyword === "string") : [],
      reportId: Number.isSafeInteger(Number(row.reportId)) ? Number(row.reportId) : undefined,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date(0) : createdAt,
    } satisfies JDRecord];
  });
}

export function resolveSelectedInterviewJD(jds: JDRecord[], selectedJdId: number | ""): JDRecord | undefined {
  if (selectedJdId === "") return undefined;
  return jds.find((jd) => jd.id === selectedJdId);
}
