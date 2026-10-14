import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

function storage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    key: (index) => Array.from(entries.keys())[index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); },
    clear: () => { entries.clear(); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("uses a locale-independent content hash so browser and server ownership proofs agree", async () => {
  const { browserCacheContentHash } = await import("@/lib/browser-cache-proof");
  expect(await browserCacheContentHash({ z: 1, "á": 3, a: 2 })).toBe(createHash("sha256").update('{"a":2,"z":1,"á":3}').digest("hex"));
});

it("shows only quarantine metadata to the next account and preserves the original contents", async () => {
  const browserStorage = storage();
  vi.stubGlobal("localStorage", browserStorage);
  vi.stubGlobal("sessionStorage", storage());
  const { setBrowserOwner } = await import("@/lib/browser-owner");
  browserStorage.setItem("zhiyuan-cv", JSON.stringify({ privateText: "A_UNSYNCED_SECRET" }));
  setBrowserOwner("owner-B");
  const { inspectLegacyBrowserData } = await import("@/lib/browser-legacy-recovery");
  const inventory = inspectLegacyBrowserData();
  expect(inventory).toHaveLength(1);
  expect(inventory[0]).toMatchObject({ storage: "local", originalKey: "zhiyuan-cv", status: "needs_review" });
  expect(JSON.stringify(inventory)).not.toContain("A_UNSYNCED_SECRET");
  expect(browserStorage.getItem(inventory[0].id)).toContain("A_UNSYNCED_SECRET");
  setBrowserOwner(null);
  expect(() => inspectLegacyBrowserData()).toThrow();
});

it("restores a server-verified legacy CV with readback and rolls back only its own unchanged copy", async () => {
  const browserStorage = storage();
  vi.stubGlobal("localStorage", browserStorage);
  vi.stubGlobal("sessionStorage", storage());
  const { setBrowserOwner, ownerLocalStorage } = await import("@/lib/browser-owner");
  const legacyValue = { activeVersion: "v1", versions: { v1: { sections: [{ id: "summary", content: "OWN_VERIFIED_CV" }] } } };
  browserStorage.setItem("zhiyuan-cv", JSON.stringify(legacyValue));
  setBrowserOwner("verified-A");
  const { inspectLegacyBrowserData, previewLegacyCvRecovery, recoverLegacyCv, rollbackLegacyCvRecovery } = await import("@/lib/browser-legacy-recovery");
  const { browserCacheContentHash } = await import("@/lib/browser-cache-proof");
  const contentHash = await browserCacheContentHash(legacyValue);
  const attestation = { status: "verified", ownerId: "verified-A", syncId: "cv:verified-A:v1", contentHash, proof: "server-recovery-proof" };
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return Response.json({ success: true, data: body.operation === "preview" ? attestation : { ...attestation, value: legacyValue } });
  }));
  const record = inspectLegacyBrowserData()[0];
  const original = browserStorage.getItem(record.id);
  const plan = await previewLegacyCvRecovery(record);
  expect(plan.status).toBe("verified");
  if (plan.status !== "verified") throw new Error("Expected verified plan");
  expect(ownerLocalStorage().getItem("zhiyuan-cv")).toBeNull();
  const receipt = await recoverLegacyCv(plan);
  expect(JSON.parse(ownerLocalStorage().getItem("zhiyuan-cv")!)).toEqual(legacyValue);
  expect(receipt).toMatchObject({ ownerId: "verified-A", contentHash, syncId: "cv:verified-A:v1", readBackVerified: true });
  expect(browserStorage.getItem(record.id)).toBe(original);
  await rollbackLegacyCvRecovery(receipt.id);
  expect(ownerLocalStorage().getItem("zhiyuan-cv")).toBeNull();
  expect(browserStorage.getItem(record.id)).toBe(original);
});

it("removes a failed recovery receipt and its inserted target when audit readback fails", async () => {
  const browserStorage = storage();
  const ordinaryRead = browserStorage.getItem;
  browserStorage.getItem = (key) => key.includes("legacy-recovery:") ? "corrupt-readback" : ordinaryRead(key);
  vi.stubGlobal("localStorage", browserStorage);
  vi.stubGlobal("sessionStorage", storage());
  const { setBrowserOwner, ownerLocalStorage } = await import("@/lib/browser-owner");
  const value = { activeVersion: "v1", versions: {} };
  browserStorage.setItem("zhiyuan-cv", JSON.stringify(value));
  setBrowserOwner("audit-A");
  const { browserCacheContentHash } = await import("@/lib/browser-cache-proof");
  const contentHash = await browserCacheContentHash(value);
  const proof = { status: "verified", ownerId: "audit-A", syncId: "cv:audit-A:v1", contentHash, proof: "fixture-proof" };
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => Response.json({ success: true,
    data: JSON.parse(String(init.body)).operation === "preview" ? proof : { ...proof, value },
  })));
  const { inspectLegacyBrowserData, previewLegacyCvRecovery, recoverLegacyCv } = await import("@/lib/browser-legacy-recovery");
  const plan = await previewLegacyCvRecovery(inspectLegacyBrowserData()[0]);
  if (plan.status !== "verified") throw new Error("Expected verified plan");
  await expect(recoverLegacyCv(plan)).rejects.toThrow("恢复凭据读回不一致");
  expect(ownerLocalStorage().getItem("zhiyuan-cv")).toBeNull();
  expect(ownerLocalStorage().length).toBe(0);
  expect(inspectLegacyBrowserData()).toHaveLength(1);
});

it("blocks a retired recovery and refuses rollback after a new draft replaces the restored CV", async () => {
  const browserStorage = storage();
  vi.stubGlobal("localStorage", browserStorage);
  vi.stubGlobal("sessionStorage", storage());
  const { setBrowserOwner, ownerLocalStorage } = await import("@/lib/browser-owner");
  const value = { activeVersion: "v1", versions: {} };
  browserStorage.setItem("zhiyuan-cv", JSON.stringify(value));
  setBrowserOwner("race-A");
  const { browserCacheContentHash } = await import("@/lib/browser-cache-proof");
  const contentHash = await browserCacheContentHash(value);
  const proof = { status: "verified", ownerId: "race-A", syncId: "cv:race-A:v1", contentHash, proof: "fixture-proof" };
  let releaseResponse: ((response: Response) => void) | null = null;
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    if (JSON.parse(String(init.body)).operation === "preview") return Response.json({ success: true, data: proof });
    return new Promise<Response>((resolve) => { releaseResponse = resolve; });
  }));
  const { inspectLegacyBrowserData, previewLegacyCvRecovery, recoverLegacyCv, rollbackLegacyCvRecovery } = await import("@/lib/browser-legacy-recovery");
  const plan = await previewLegacyCvRecovery(inspectLegacyBrowserData()[0]);
  if (plan.status !== "verified") throw new Error("Expected verified plan");
  const pending = recoverLegacyCv(plan);
  await vi.waitFor(() => expect(releaseResponse).not.toBeNull());
  setBrowserOwner("race-B");
  releaseResponse!(Response.json({ success: true, data: { ...proof, value } }));
  await expect(pending).rejects.toThrow("账号已变更");
  expect(ownerLocalStorage().getItem("zhiyuan-cv")).toBeNull();
  setBrowserOwner("race-A");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true, data: { ...proof, value } })));
  const receipt = await recoverLegacyCv(plan);
  ownerLocalStorage().setItem("zhiyuan-cv", '{"activeVersion":"new-draft","versions":{}}');
  await expect(rollbackLegacyCvRecovery(receipt.id)).rejects.toThrow("阻止回滚");
  expect(ownerLocalStorage().getItem("zhiyuan-cv")).toContain("new-draft");
  expect(browserStorage.getItem(plan.record.id)).toBeTruthy();
});

it("reports rollback failure when removal does not read back and keeps the recovery active", async () => {
  const browserStorage = storage();
  vi.stubGlobal("localStorage", browserStorage);
  vi.stubGlobal("sessionStorage", storage());
  const { setBrowserOwner, ownerLocalStorage } = await import("@/lib/browser-owner");
  const value = { activeVersion: "v1", versions: {} };
  browserStorage.setItem("zhiyuan-cv", JSON.stringify(value));
  setBrowserOwner("rollback-A");
  const { browserCacheContentHash } = await import("@/lib/browser-cache-proof");
  const proof = { status: "verified", ownerId: "rollback-A", syncId: "cv:rollback-A:v1", contentHash: await browserCacheContentHash(value), proof: "fixture-proof" };
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => Response.json({ success: true,
    data: JSON.parse(String(init.body)).operation === "preview" ? proof : { ...proof, value },
  })));
  const { inspectLegacyBrowserData, previewLegacyCvRecovery, recoverLegacyCv, rollbackLegacyCvRecovery, listLegacyRecoveryReceipts } = await import("@/lib/browser-legacy-recovery");
  const plan = await previewLegacyCvRecovery(inspectLegacyBrowserData()[0]);
  if (plan.status !== "verified") throw new Error("Expected verified plan");
  const receipt = await recoverLegacyCv(plan);
  browserStorage.removeItem = () => undefined;
  await expect(rollbackLegacyCvRecovery(receipt.id)).rejects.toThrow("撤销后读回不一致");
  expect(listLegacyRecoveryReceipts()[0].status).toBe("restored");
  expect(JSON.parse(ownerLocalStorage().getItem("zhiyuan-cv")!)).toEqual(value);
});
