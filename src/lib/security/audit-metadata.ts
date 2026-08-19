const SECRET_KEY_PARTS = [
  'password',
  'passwd',
  'pwd',
  'token',
  'cookie',
  'authorization',
  'databaseurl',
  'apikey',
  'clientsecret',
  'rawbody',
];

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitize(value: unknown, depth: number): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return value.slice(0, 2000);
    return value;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    clean[key] = isSecretKey(key) ? '[REDACTED]' : sanitize(child, depth + 1);
  }
  return clean;
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return sanitize(metadata || {}, 0) as Record<string, unknown>;
}
