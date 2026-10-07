/**
 * 2026-10 更新后主动验证（diagnosing-bugs 纪律）：对 Spec 20/21/22 改动面做
 * 对抗性不变量探针。这些不是happy-path 回归——它们断言「任何输入下都必须成立
 * 的性质」，红一条就是新 bug。
 */
import { describe, expect, it, vi } from "vitest";
import {
  collectJobDiscoveryScanIds,
  reconcileJobDiscoveryRunMessages,
  type ScanStatusMap,
} from "@/lib/agent/job-discovery-card-status";
import { digestDeliveredInWindow } from "@/lib/agent/runtime/scheduled-runs";
import { stableJitterMinutes } from "@/lib/agent/runtime/scheduled-runs";
import { nextWeeklyMonday0800Utc } from "@/lib/agent/runtime/scheduled-runs";
import { isDisconnectError } from "@/lib/agent/mcp/manager";
import { TASK_INCOMPLETE_MARKER } from "@/lib/agent/task-program";
import type { AgentMessage } from "@/types";

/* ── 随机消息生成器：制造任意畸形 ── */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function randomToolResult(rand: () => number): unknown {
  const kind = Math.floor(rand() * 8);
  switch (kind) {
    case 0: return null;
    case 1: return "just a string";
    case 2: return [{ not: "an object" }];
    case 3: return { success: true };
    case 4: return { success: true, uiPayload: null };
    case 5: return { success: true, uiPayload: [{ type: "job_discovery_run" }] };
    case 6: return { success: true, uiPayload: { type: "job_discovery_run", scanId: 12345, status: 42 } };
    default: return { success: true, uiPayload: { type: "job_discovery_run", scanId: `s-${kind}`, status: "running" } };
  }
}

function randomMessages(rand: () => number, count: number): AgentMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const roll = rand();
    if (roll < 0.5) return { role: "assistant", content: `m-${index}`, timestamp: "2026-10-01T00:00:00Z" };
    if (roll < 0.75) return { role: "user", content: `u-${index}`, timestamp: "2026-10-01T00:00:00Z" };
    return { role: "tool", content: "", toolName: "scan_portals", toolResult: randomToolResult(rand), timestamp: "2026-10-01T00:00:00Z" };
  });
}

function randomStatuses(rand: () => number): ScanStatusMap {
  const pool = ["done", "failed", "canceled", "running", "pending", "weird-state", ""];
  const map: ScanStatusMap = {};
  for (let index = 0; index < 6; index++) {
    map[`s-${index + 1}`] = { status: pool[Math.floor(rand() * pool.length)], updatedAt: rand() > 0.5 ? "2026-09-30T12:00:00Z" : null };
  }
  return map;
}

describe("post-update invariant: reconcileJobDiscoveryRunMessages", () => {
  it("never loses, adds, or reorders messages; never throws; is idempotent — 200 random inputs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = seededRandom(seed);
      const messages = randomMessages(rand, 12);
      const statuses = randomStatuses(rand);

      const first = reconcileJobDiscoveryRunMessages(messages, statuses);
      expect(first).toHaveLength(messages.length);

      // 不丢内容：非 tool 角色消息必须原样保留（恒等引用或内容相等）。
      messages.forEach((message, index) => {
        if (message.role !== "tool") expect(first[index]).toBe(message);
      });

      // 幂等：对已对账结果再跑一遍，必须原样返回（同一引用）。
      expect(reconcileJobDiscoveryRunMessages(first, statuses)).toBe(first);

      // 卡片状态不变量：输出里任何 job_discovery_run 卡都不是 pending/running，
      // 除非事实源说它真的在运行（孤儿）。
      for (const message of first) {
        const payload = (message.toolResult as Record<string, unknown> | null | undefined);
        const card = payload && typeof payload === "object"
          ? (payload.uiPayload ?? payload) as Record<string, unknown>
          : null;
        if (card && card.type === "job_discovery_run") {
          const status = String(card.status);
          const scanId = typeof card.scanId === "string" ? card.scanId : "";
          const fact = statuses[scanId];
          const orphan = fact && (fact.status === "running" || fact.status === "pending");
          if (!orphan) expect(["done", "failed", "canceled", "unknown"]).toContain(status);
        }
      }
    }
  });

  it("survives the JSON round-trip with non-card content byte-identical", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "历史消息", timestamp: "2026-10-01T00:00:00Z" },
      { role: "tool", content: "", toolName: "scan_portals", timestamp: "2026-10-01T00:00:00Z", toolResult: { success: true, uiPayload: { type: "job_discovery_run", scanId: "s-round", status: "running" } } },
      { role: "assistant", content: "结论", timestamp: "2026-10-01T00:01:00Z" },
    ];
    const statuses: ScanStatusMap = { "s-round": { status: "done", updatedAt: "2026-10-01T00:05:00Z" } };
    const reconciled = reconcileJobDiscoveryRunMessages(messages, statuses);
    const parsed = JSON.parse(JSON.stringify({ m: reconciled })).m as AgentMessage[];
    expect(parsed[0].content).toBe("历史消息");
    expect(parsed[2].content).toBe("结论");
    expect(((parsed[1].toolResult as Record<string, unknown>).uiPayload as Record<string, unknown>).status).toBe("done");
  });
});

describe("post-update invariant: digest delivery window", () => {
  const window = { startIso: "2026-10-05T00:00:00.000Z", endIso: "2026-10-05T00:05:00.000Z" };

  it("includes the exact window boundaries", () => {
    expect(digestDeliveredInWindow([{ content: "精选", createdAt: window.startIso }], window)).toBe(true);
    expect(digestDeliveredInWindow([{ content: "精选", createdAt: window.endIso }], window)).toBe(true);
  });

  it("detects the marker anywhere in the content, not only as a prefix", () => {
    expect(digestDeliveredInWindow([
      { content: `开头${TASK_INCOMPLETE_MARKER}中间：还没完成`, createdAt: "2026-10-05T00:03:00.000Z" },
    ], window)).toBe(false);
  });

  it("rejects null/invalid createdAt without throwing", () => {
    expect(digestDeliveredInWindow([{ content: "x", createdAt: null }], window)).toBe(false);
    expect(digestDeliveredInWindow([{ content: "x", createdAt: "garbage" }], window)).toBe(false);
  });
});

describe("post-update invariant: scheduler math", () => {
  it("always lands on Monday 00:00 UTC, strictly in the future, across 365 days", () => {
    let cursor = new Date("2026-10-02T12:34:56Z").getTime();
    for (let day = 0; day < 365; day++) {
      const next = nextWeeklyMonday0800Utc(new Date(cursor));
      expect(next.getUTCDay()).toBe(1);
      expect(next.getUTCHours()).toBe(0);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getTime()).toBeGreaterThan(cursor);
      cursor += 24 * 60 * 60 * 1000;
    }
  });

  it("bounds the per-user jitter to [0, 30) minutes for any userId shape", () => {
    const samples = ["", "a", "user-42", "😀".repeat(100), "x".repeat(1000), "0"];
    for (const userId of samples) {
      const minutes = stableJitterMinutes(userId);
      expect(minutes).toBeGreaterThanOrEqual(0);
      expect(minutes).toBeLessThan(30);
    }
  });
});

describe("post-update invariant: disconnect predicate adversarial strings", () => {
  it("does not fire on realistic tool-error wordings containing trap substrings", () => {
    expect(isDisconnectError("tool call ended up failing validation")).toBe(false);
    expect(isDisconnectError("recommended fallback applied")).toBe(false);
    expect(isDisconnectError("the stream appended 3 chunks then errored")).toBe(false);
    expect(isDisconnectError("warning: potential connection closed retry budget exceeded")).toBe(true);
  });

  it("still fires on the real end-of-stream wordings the enumeration covers", () => {
    expect(isDisconnectError("write after end")).toBe(true);
    expect(isDisconnectError("Error: stream ended")).toBe(true);
    expect(isDisconnectError("connection ended by peer")).toBe(true);
  });
});

describe("post-update invariant: scan status batching keeps every id", () => {
  it("returns all 60 statuses across chunks (sqlite path, fake db)", async () => {
    // 注意签名：better-sqlite3 的 .all(userId, ...batch)——sql 已绑在 prepare 上，
    // 第一个实参就是 userId（探针曾把它误当 sql 参数吞掉每批第一个 id）。
    const fakeAll = vi.fn((...params: unknown[]) => {
      const ids = params.slice(1).map(String);
      return ids.map((id) => ({ id, status: "done", updated_at: "2026-10-01T00:00:00Z" }));
    });
    vi.doMock("@/lib/postgres", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/postgres")>();
      return { ...original, getDatabaseDriver: () => "sqlite" };
    });
    vi.doMock("@/lib/server-db", () => ({ getDb: () => ({ prepare: () => ({ all: fakeAll }) }) }));
    try {
      const { getScanStatusesForUser } = await import("@/lib/scan-data");
      const ids = Array.from({ length: 60 }, (_, index) => `scan-${index}`);
      const statuses = await getScanStatusesForUser("user-1", ids);
      expect(Object.keys(statuses)).toHaveLength(60);
      expect(fakeAll).toHaveBeenCalledTimes(2); // 60 / 50 = 两批
    } finally {
      vi.doUnmock("@/lib/postgres");
      vi.doUnmock("@/lib/server-db");
    }
  });
});
