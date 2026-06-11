type AnyRow = Record<string, unknown>;

function asRecord(value: unknown): AnyRow | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AnyRow
    : undefined;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((next, key) => {
      next[key] = sortJson((value as Record<string, unknown>)[key]);
      return next;
    }, {});
}

function canonicalJson(value: unknown, fallback: unknown): string {
  let parsed = value;
  if (parsed === undefined || parsed === null || parsed === "") parsed = fallback;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = fallback;
    }
  }
  return JSON.stringify(sortJson(parsed));
}

function textValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

export function profileSignalReadBackMatches(row: unknown, input: unknown, expectedId?: number): boolean {
  const rowRecord = asRecord(row);
  const inputRecord = asRecord(input);
  if (!rowRecord || !inputRecord) return false;
  if (expectedId !== undefined && Number(rowRecord.id) !== Number(expectedId)) return false;
  return (
    textValue(rowRecord.source) === textValue(inputRecord.source) &&
    textValue(rowRecord.signal_type) === textValue(inputRecord.signal_type) &&
    canonicalJson(rowRecord.content_json, {}) === canonicalJson(inputRecord.content_json, {}) &&
    textValue(rowRecord.session_id) === textValue(inputRecord.session_id)
  );
}

export function profileContainsSkill(profileRow: unknown, skillName: string): boolean {
  const profileRecord = asRecord(profileRow);
  if (!profileRecord || !skillName.trim()) return false;
  const raw = profileRecord.data_json;
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return false;
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>;
  }
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  return skills.some((skill) => {
    if (!skill || typeof skill !== "object") return false;
    return textValue((skill as Record<string, unknown>).name) === skillName;
  });
}
