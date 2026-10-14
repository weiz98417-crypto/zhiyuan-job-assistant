import { LEGACY_QUARANTINE_PREFIX, assertBrowserOwner, ownerLocalStorage, requireBrowserOwner, type BrowserOwner } from "@/lib/browser-owner";
import { browserCacheContentHash, type BrowserCacheProof } from "@/lib/browser-cache-proof";

const RECOVERY_RECEIPT_PREFIX = "legacy-recovery:";

export interface LegacyBrowserRecord {
  id: string;
  storage: "local" | "session";
  originalKey: string;
  capturedAt: string;
  status: "needs_review";
}

export type LegacyCvRecoveryPlan = { status: "needs_review" } | (BrowserCacheProof & {
  record: LegacyBrowserRecord;
  sourceSnapshotHash: string;
});

export interface LegacyCvRecoveryReceipt {
  id: string;
  ownerId: string;
  syncId: string;
  contentHash: string;
  source: LegacyBrowserRecord;
  sourceSnapshotHash: string;
  createdTarget: boolean;
  readBackVerified: true;
  status: "restored" | "rolled_back";
  recoveredAt: string;
}

function quarantineRecord(record: LegacyBrowserRecord) {
  if (!record.id.startsWith(LEGACY_QUARANTINE_PREFIX) || record.originalKey !== "zhiyuan-cv") throw new Error("该记录尚不支持可信恢复");
  const storage = record.storage === "local" ? localStorage : sessionStorage;
  const value = JSON.parse(storage.getItem(record.id) ?? "null");
  if (value?.reason !== "legacy_unowned" || value.originalKey !== record.originalKey || typeof value.raw !== "string") {
    throw new Error("隔离记录已变更或无法读取");
  }
  return value as { raw: string; originalKey: string; capturedAt: string; reason: string };
}

async function recoveryRequest(body: unknown, owner: BrowserOwner) {
  assertBrowserOwner(owner);
  const response = await fetch("/api/users/me/browser-recovery", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await response.json();
  assertBrowserOwner(owner);
  if (!response.ok || !json.success) throw new Error(json.error || "旧缓存核验失败");
  return json.data;
}

export async function previewLegacyCvRecovery(record: LegacyBrowserRecord): Promise<LegacyCvRecoveryPlan> {
  const owner = requireBrowserOwner();
  const source = quarantineRecord(record);
  const contentHash = await browserCacheContentHash(JSON.parse(source.raw));
  const sourceSnapshotHash = await browserCacheContentHash(source);
  const result = await recoveryRequest({ operation: "preview", contentHash }, owner);
  if (result?.status !== "verified") return { status: "needs_review" };
  if (result.ownerId !== owner.ownerId || result.contentHash !== contentHash || typeof result.proof !== "string" || typeof result.syncId !== "string") {
    throw new Error("恢复核验归属或内容不一致");
  }
  return { ...result, record, sourceSnapshotHash };
}

export async function recoverLegacyCv(plan: Extract<LegacyCvRecoveryPlan, { status: "verified" }>): Promise<LegacyCvRecoveryReceipt> {
  const owner = requireBrowserOwner();
  if (plan.ownerId !== owner.ownerId) throw new Error("恢复计划不属于当前账号");
  const source = quarantineRecord(plan.record);
  if (await browserCacheContentHash(source) !== plan.sourceSnapshotHash) throw new Error("旧缓存已变更，请重新核验");
  const result = await recoveryRequest({ operation: "restore", proof: plan.proof }, owner);
  if (result?.ownerId !== owner.ownerId || result.syncId !== plan.syncId || result.contentHash !== plan.contentHash
    || await browserCacheContentHash(result.value) !== plan.contentHash) throw new Error("恢复读回与已核验内容不一致");
  assertBrowserOwner(owner);
  if (await browserCacheContentHash(quarantineRecord(plan.record)) !== plan.sourceSnapshotHash) throw new Error("旧缓存已变更，请重新核验");
  const storage = ownerLocalStorage(owner);
  const prior = storage.getItem("zhiyuan-cv");
  if (prior !== null && await browserCacheContentHash(JSON.parse(prior)) !== plan.contentHash) throw new Error("当前账号已有不同的简历草稿，已阻止覆盖");
  assertBrowserOwner(owner);
  if (storage.getItem("zhiyuan-cv") !== prior) throw new Error("当前草稿已变更，请重试");
  const written = JSON.stringify(result.value);
  const receipt: LegacyCvRecoveryReceipt = {
    id: crypto.randomUUID(), ownerId: owner.ownerId, syncId: plan.syncId, contentHash: plan.contentHash,
    source: plan.record, sourceSnapshotHash: plan.sourceSnapshotHash, createdTarget: prior === null,
    readBackVerified: true, status: "restored", recoveredAt: new Date().toISOString(),
  };
  try {
    if (prior === null) storage.setItem("zhiyuan-cv", written);
    if (storage.getItem("zhiyuan-cv") !== (prior ?? written)) throw new Error("旧缓存恢复后读回不一致");
    const audit = JSON.stringify(receipt);
    storage.setItem(RECOVERY_RECEIPT_PREFIX + receipt.id, audit);
    if (storage.getItem(RECOVERY_RECEIPT_PREFIX + receipt.id) !== audit) throw new Error("恢复凭据读回不一致");
  } catch (failure) {
    storage.removeItem(RECOVERY_RECEIPT_PREFIX + receipt.id);
    if (prior === null && storage.getItem("zhiyuan-cv") === written) storage.removeItem("zhiyuan-cv");
    throw failure;
  }
  return receipt;
}

export function listLegacyRecoveryReceipts(): LegacyCvRecoveryReceipt[] {
  const storage = ownerLocalStorage();
  const receipts: LegacyCvRecoveryReceipt[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(RECOVERY_RECEIPT_PREFIX)) continue;
    try {
      const receipt = JSON.parse(storage.getItem(key)!);
      if (receipt.ownerId === requireBrowserOwner().ownerId) receipts.push(receipt);
    } catch { continue; }
  }
  return receipts;
}

export async function rollbackLegacyCvRecovery(receiptId: string): Promise<void> {
  const owner = requireBrowserOwner();
  const storage = ownerLocalStorage(owner);
  const key = RECOVERY_RECEIPT_PREFIX + receiptId;
  const receipt: LegacyCvRecoveryReceipt | null = JSON.parse(storage.getItem(key) ?? "null");
  if (!receipt || receipt.ownerId !== owner.ownerId) throw new Error("恢复凭据不存在或不属于当前账号");
  if (receipt.status === "rolled_back") return;
  const current = storage.getItem("zhiyuan-cv");
  if (receipt.createdTarget && (current === null || await browserCacheContentHash(JSON.parse(current)) !== receipt.contentHash)) {
    throw new Error("恢复后资料已更新，已阻止回滚覆盖新内容");
  }
  assertBrowserOwner(owner);
  if (storage.getItem("zhiyuan-cv") !== current) throw new Error("当前资料已变更，请重新核验");
  try {
    if (receipt.createdTarget) storage.removeItem("zhiyuan-cv");
    if (receipt.createdTarget && storage.getItem("zhiyuan-cv") !== null) throw new Error("撤销后读回不一致");
    const rolledBack = JSON.stringify({ ...receipt, status: "rolled_back" });
    storage.setItem(key, rolledBack);
    if (storage.getItem(key) !== rolledBack) throw new Error("撤销凭据读回不一致");
  } catch (failure) {
    if (receipt.createdTarget && current !== null && storage.getItem("zhiyuan-cv") === null) storage.setItem("zhiyuan-cv", current);
    storage.setItem(key, JSON.stringify(receipt));
    throw failure;
  }
}

export function inspectLegacyBrowserData(): LegacyBrowserRecord[] {
  requireBrowserOwner();
  const records: LegacyBrowserRecord[] = [];
  for (const [storageType, storage] of [["local", localStorage], ["session", sessionStorage]] as const) {
    for (let index = 0; index < storage.length; index++) {
      const id = storage.key(index);
      if (!id?.startsWith(LEGACY_QUARANTINE_PREFIX)) continue;
      try {
        const value = JSON.parse(storage.getItem(id) ?? "null");
        if (value?.reason !== "legacy_unowned" || typeof value.originalKey !== "string" || typeof value.raw !== "string") continue;
        records.push({ id, storage: storageType, originalKey: value.originalKey, capturedAt: value.capturedAt ?? "", status: "needs_review" });
      } catch {
        records.push({ id, storage: storageType, originalKey: "无法解析的隔离记录", capturedAt: "", status: "needs_review" });
      }
    }
  }
  return records;
}
