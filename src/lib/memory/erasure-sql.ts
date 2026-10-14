const MEMORY_TRIM_CHARACTERS = "U&'\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'";

export function memoryFactSuppressionSql(factAlias: "f" | "pf", episodeAlias: "e" | "pe"): string {
  const normalizedText = `btrim(${factAlias}.canonical_text, ${MEMORY_TRIM_CHARACTERS})`;
  const normalizedSubject = `lower(btrim(${factAlias}.subject, ${MEMORY_TRIM_CHARACTERS}) COLLATE "und-x-icu")`;
  const normalizedPredicate = `lower(btrim(${factAlias}.predicate, ${MEMORY_TRIM_CHARACTERS}) COLLATE "und-x-icu")`;
  return `EXISTS (
    SELECT 1 FROM memory_erasure_suppressions s
    JOIN memory_erasure_requests r ON r.id=s.request_id AND r.user_id=s.user_id
    WHERE s.user_id=${factAlias}.user_id AND s.lifted_at IS NULL
      AND (s.target_hash=encode(sha256(convert_to(${normalizedText}, 'UTF8')), 'hex')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.scope_json->'factIds') AS erased_fact(value) WHERE erased_fact.value=${factAlias}.id::text)
        OR (s.source_type=${episodeAlias}.source_type AND s.source_id=${episodeAlias}.source_id
          AND s.target_key=encode(sha256(convert_to(
            '[' || to_json(${normalizedSubject})::text || ',' || to_json(${normalizedPredicate})::text || ']', 'UTF8')), 'hex')))
  )`;
}
