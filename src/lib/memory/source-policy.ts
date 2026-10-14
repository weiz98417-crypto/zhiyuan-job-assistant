import { MEMORY_SOURCE_TYPES, normalizeMemorySourceFilters, type MemorySourceFilter, type MemorySourceType } from "@/lib/memory/vector-memory";

const ADMITTED_USER_SOURCES: Record<string, MemorySourceType> = {
  user_explicit_memory: "profile_signal",
  user_correction: "profile_signal",
  conversation_message: "profile_signal",
};

export function expandGovernedFactSourceTypes(filters?: MemorySourceFilter[]): string[] | undefined {
  if (filters === undefined) return undefined;
  const normalized = normalizeMemorySourceFilters(filters);
  return [...normalized, ...Object.entries(ADMITTED_USER_SOURCES)
    .filter(([, sourceType]) => normalized.includes(sourceType)).map(([sourceType]) => sourceType)];
}

export function resolveGovernedFactSourceType(sourceType: string | null): MemorySourceType | null {
  if (!sourceType) return null;
  if ((MEMORY_SOURCE_TYPES as readonly string[]).includes(sourceType)) return sourceType as MemorySourceType;
  return ADMITTED_USER_SOURCES[sourceType] ?? null;
}
