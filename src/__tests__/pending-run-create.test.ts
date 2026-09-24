import { describe, expect, it } from "vitest";
import {
  clearPendingRunCreate,
  pendingRunCreateRequestId,
  rememberPendingRunCreate,
} from "@/lib/agent/pending-run-create";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear() { entries.clear(); },
    getItem(key) { return entries.get(key) ?? null; },
    key(index) { return [...entries.keys()][index] ?? null; },
    removeItem(key) { entries.delete(key); },
    setItem(key, value) { entries.set(key, value); },
  };
}

describe("pending Run creation", () => {
  it("reuses an uncertain request after reload for the same conversation and input", () => {
    const storage = memoryStorage();
    rememberPendingRunCreate(501, "评估这份 JD", ["data:image/png;base64,one"], "request-501", storage);

    expect(pendingRunCreateRequestId(501, "评估这份 JD", ["data:image/png;base64,one"], storage))
      .toBe("request-501");
    expect(pendingRunCreateRequestId(502, "评估这份 JD", ["data:image/png;base64,one"], storage))
      .toBeNull();
    expect(pendingRunCreateRequestId(501, "评估这份 JD", ["data:image/png;base64,two"], storage))
      .toBeNull();

    clearPendingRunCreate(501, "request-501", storage);
    expect(pendingRunCreateRequestId(501, "评估这份 JD", ["data:image/png;base64,one"], storage))
      .toBeNull();
  });
});
