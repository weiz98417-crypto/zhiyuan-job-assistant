import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bindErasureWitnesses, readErasureWitnesses } from "../../scripts/lib/memory-restore-erasure-witnesses.mjs";

const directories: string[] = [];
const canonicalText = "Synthetic erased memory with a known source";
const targetHash = createHash("sha256").update(canonicalText).digest("hex");
const witness = { requestId: 7, userId: "synthetic-owner", targetHash, canonicalText };
const request = { id: 7, user_id: "synthetic-owner", target_hash: targetHash };

function file(requests: unknown[]) {
  const directory = mkdtempSync(path.join(tmpdir(), "memory-erasure-witnesses-"));
  directories.push(directory);
  const filename = path.join(directory, "witnesses.json");
  writeFileSync(filename, JSON.stringify({ format: "zhiyuan-memory-erasure-witnesses-v1", requests }));
  return filename;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("restore erasure witness boundary", () => {
  it("binds a verified target only to the same completed request owner and hash", () => {
    const filename = file([witness]);
    const original = readFileSync(filename, "utf8");
    expect(bindErasureWitnesses(readErasureWitnesses(filename), [request]).get(7)).toBe(canonicalText);
    expect(readFileSync(filename, "utf8")).toBe(original);
    expect(readErasureWitnesses("")).toEqual([]);
  });

  it.each([
    { ...witness, canonicalText: "Unrelated content" },
    { ...witness, canonicalText: " " + canonicalText + " " },
    { ...witness, targetHash: "unverified" },
    { ...witness, requestId: 0 },
    { ...witness, userId: "" },
    { ...witness, extra: "unrecognized evidence" },
  ])("rejects malformed or mismatched content without returning target text", (invalid) => {
    expect(() => readErasureWitnesses(file([invalid]))).toThrow(/Invalid erasure witness/);
  });

  it("rejects duplicate request identities", () => {
    expect(() => readErasureWitnesses(file([witness, witness]))).toThrow(/Duplicate/);
  });

  it.each([
    { requests: [{ ...request, user_id: "foreign-owner" }] },
    { requests: [{ ...request, target_hash: "0".repeat(64) }] },
    { requests: [] },
  ])("rejects a foreign owner, request hash, or unrelated request", ({ requests }) => {
    expect(() => bindErasureWitnesses(readErasureWitnesses(file([witness])), requests)).toThrow(/does not match/);
  });
});
