export interface BrowserCacheProof {
  status: "verified";
  ownerId: string;
  syncId: string;
  contentHash: string;
  proof: string;
}

export function canonicalCacheJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, normalize(entry)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

export async function browserCacheContentHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalCacheJson(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
