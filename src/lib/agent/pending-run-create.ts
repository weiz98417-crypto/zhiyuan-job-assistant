interface PendingRunCreate {
  requestId: string;
  fingerprint: string;
  createdAt: number;
}

const STORAGE_PREFIX = "zhiyuan:pending-run-create:";
const MAX_AGE_MS = 60 * 60 * 1000;
const fallback = new Map<string, PendingRunCreate>();

function storageKey(conversationId: number | null): string {
  return `${STORAGE_PREFIX}${conversationId ?? "new"}`;
}

function fingerprint(content: string, images: string[]): string {
  let first = 2166136261;
  let second = 2246822519;
  const parts = [content, ...images];
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      const code = part.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 3266489917);
    }
    first = Math.imul(first ^ part.length, 16777619);
    second = Math.imul(second ^ part.length, 3266489917);
  }
  return `${parts.length}:${first >>> 0}:${second >>> 0}`;
}

function read(key: string, storage: Storage | null): PendingRunCreate | null {
  let stored: PendingRunCreate | null = fallback.get(key) || null;
  try {
    const raw = storage?.getItem(key);
    if (raw) stored = JSON.parse(raw) as PendingRunCreate;
  } catch {}
  if (!stored || typeof stored.requestId !== "string" || typeof stored.fingerprint !== "string"
    || typeof stored.createdAt !== "number" || Date.now() - stored.createdAt > MAX_AGE_MS) {
    return null;
  }
  return stored;
}

export function pendingRunCreateRequestId(
  conversationId: number | null,
  content: string,
  images: string[],
  storage: Storage | null,
): string | null {
  const pending = read(storageKey(conversationId), storage);
  return pending?.fingerprint === fingerprint(content, images) ? pending.requestId : null;
}

export function rememberPendingRunCreate(
  conversationId: number | null,
  content: string,
  images: string[],
  requestId: string,
  storage: Storage | null,
): void {
  const key = storageKey(conversationId);
  const pending = { requestId, fingerprint: fingerprint(content, images), createdAt: Date.now() };
  fallback.set(key, pending);
  try {
    storage?.setItem(key, JSON.stringify(pending));
  } catch {}
}

export function clearPendingRunCreate(
  conversationId: number | null,
  requestId: string,
  storage: Storage | null,
): void {
  const key = storageKey(conversationId);
  if (read(key, storage)?.requestId !== requestId) return;
  fallback.delete(key);
  try {
    storage?.removeItem(key);
  } catch {}
}
