import fs from "node:fs";
import crypto from "node:crypto";

export function memoryRestoreContentHash(content) {
  return crypto.createHash("sha256").update(content.trim()).digest("hex");
}

export function readErasureWitnesses(filePath) {
  if (!filePath) return [];
  const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (document?.format !== "zhiyuan-memory-erasure-witnesses-v1" || !Array.isArray(document.requests)
    || Object.keys(document).some((key) => !["format", "requests"].includes(key))) {
    throw new Error("Unsupported erasure witness format");
  }
  const seen = new Set();
  for (const witness of document.requests) {
    if (!witness || typeof witness !== "object" || Array.isArray(witness)
      || Object.keys(witness).some((key) => !["requestId", "userId", "targetHash", "canonicalText"].includes(key))
      || !Number.isSafeInteger(witness.requestId) || witness.requestId <= 0
      || typeof witness.userId !== "string" || !witness.userId.trim()
      || typeof witness.targetHash !== "string" || !/^[a-f0-9]{64}$/.test(witness.targetHash)
      || typeof witness.canonicalText !== "string" || !witness.canonicalText.trim()
      || witness.canonicalText !== witness.canonicalText.trim()
      || memoryRestoreContentHash(witness.canonicalText) !== witness.targetHash) {
      throw new Error("Invalid erasure witness identity or content hash");
    }
    if (seen.has(witness.requestId)) throw new Error("Duplicate erasure witness request");
    seen.add(witness.requestId);
  }
  return document.requests;
}

export function bindErasureWitnesses(witnesses, requests) {
  const matched = new Map();
  for (const witness of witnesses) {
    const request = requests.find((item) => Number(item.id) === witness.requestId);
    if (!request || String(request.user_id) !== witness.userId || String(request.target_hash) !== witness.targetHash) {
      throw new Error("Erasure witness does not match a completed request in this backup");
    }
    matched.set(witness.requestId, witness.canonicalText);
  }
  return matched;
}
