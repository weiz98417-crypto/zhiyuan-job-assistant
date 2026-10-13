export const BROWSER_OWNER_KEY = "zhiyuan:active-owner:v1";
export const BROWSER_OWNER_EVENT = "zhiyuan:owner-changed";
export const LEGACY_QUARANTINE_PREFIX = "zhiyuan:legacy-unowned:";

const BUSINESS_KEYS = [
  "zhiyuan-profile",
  "zhiyuan-news-settings",
  "zhiyuan-cv",
  "zhiyuan-profile-sop-state",
  "zhiyuan-explore-chat",
  "zhiyuan-explore-migrated-v2",
  "agent:consumed-handoffs:v1",
];

export type BrowserOwner = { ownerId: string; sessionKey: string; generation: number };

let activeOwner: BrowserOwner | null = null;
let generation = 0;

function sharedOwner(): { ownerId: string; sessionKey: string } | null {
  const raw = localStorage.getItem(BROWSER_OWNER_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  return typeof value.ownerId === "string" && typeof value.sessionKey === "string" ? value : null;
}

function quarantineLegacyStorage(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => !!key && (BUSINESS_KEYS.includes(key) || key.startsWith("zhiyuan:pending-run-create:")));
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    storage.setItem(LEGACY_QUARANTINE_PREFIX + crypto.randomUUID(), JSON.stringify({
      reason: "legacy_unowned",
      originalKey: key,
      capturedAt: new Date().toISOString(),
      raw,
    }));
    storage.removeItem(key);
  }
}

export function getBrowserOwner(): BrowserOwner | null {
  if (!activeOwner || typeof localStorage === "undefined") return null;
  try {
    const current = sharedOwner();
    return current?.ownerId === activeOwner.ownerId && current.sessionKey === activeOwner.sessionKey ? activeOwner : null;
  } catch {
    return null;
  }
}

export function requireBrowserOwner(): BrowserOwner {
  const owner = getBrowserOwner();
  if (!owner) throw new Error("浏览器账号尚未验证或已变更，请重新登录");
  return owner;
}

export function assertBrowserOwner(owner: BrowserOwner): void {
  const current = getBrowserOwner();
  if (!current || current.ownerId !== owner.ownerId || current.sessionKey !== owner.sessionKey || current.generation !== owner.generation) {
    throw new Error("账号已变更，已阻止旧账号读取或写入本地数据");
  }
}

export function setBrowserOwner(ownerId: string | null): void {
  generation++;
  activeOwner = null;
  if (typeof localStorage !== "undefined") {
    if (ownerId) {
      quarantineLegacyStorage(localStorage);
      if (typeof sessionStorage !== "undefined") quarantineLegacyStorage(sessionStorage);
      const existing = sharedOwner();
      const sessionKey = existing?.ownerId === ownerId ? existing.sessionKey : crypto.randomUUID();
      localStorage.setItem(BROWSER_OWNER_KEY, JSON.stringify({ ownerId, sessionKey }));
      activeOwner = { ownerId, sessionKey, generation };
    } else {
      localStorage.removeItem(BROWSER_OWNER_KEY);
    }
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(BROWSER_OWNER_EVENT));
  }
}

export function invalidateBrowserOwner(): void {
  activeOwner = null;
  generation++;
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(BROWSER_OWNER_EVENT));
  }
}

export function ownerStoragePrefix(ownerId: string): string {
  return "zhiyuan:owner:" + encodeURIComponent(ownerId) + ":";
}

function scopedStorage(storage: Storage, owner = requireBrowserOwner()): Storage {
  const prefix = ownerStoragePrefix(owner.ownerId);
  const keys = () => {
    assertBrowserOwner(owner);
    return Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => !!key && key.startsWith(prefix));
  };
  return {
    get length() { return keys().length; },
    key(index) { return keys()[index]?.slice(prefix.length) ?? null; },
    clear() { for (const key of keys()) storage.removeItem(key); },
    getItem(key) { assertBrowserOwner(owner); return storage.getItem(prefix + key); },
    setItem(key, value) { assertBrowserOwner(owner); storage.setItem(prefix + key, value); },
    removeItem(key) { assertBrowserOwner(owner); storage.removeItem(prefix + key); },
  };
}

export function ownerLocalStorage(owner?: BrowserOwner): Storage {
  return scopedStorage(localStorage, owner);
}

export function ownerSessionStorage(): Storage {
  return scopedStorage(sessionStorage);
}

export function clearOwnerStorage(owner: BrowserOwner): void {
  assertBrowserOwner(owner);
  for (const storage of [localStorage, ...(typeof sessionStorage === "undefined" ? [] : [sessionStorage])]) {
    const prefix = ownerStoragePrefix(owner.ownerId);
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => !!key && key.startsWith(prefix));
    for (const key of keys) storage.removeItem(key);
  }
}
