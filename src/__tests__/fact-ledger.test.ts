import { describe, expect, it } from "vitest";
import {
  decideFactOperationsDeterministic,
  resolvePartitionAccess,
  assertFactWritable,
  assertFactReadable,
  listReadablePartitions,
  type ExistingFact,
  type FactCandidate,
} from "@/lib/memory/fact-ledger";
import { MastraSessionMemoryAdapter, SessionMemoryConfigurationError } from "@/lib/memory/postgres-memory";

function fact(overrides: Partial<ExistingFact> = {}): ExistingFact {
  return {
    id: 1,
    partition: "core",
    subject: "user",
    predicate: "target_city",
    canonicalText: "用户目标城市是北京",
    validAt: new Date("2026-03-01"),
    confidence: 0.8,
    ...overrides,
  };
}

function candidate(overrides: Partial<FactCandidate> = {}): FactCandidate {
  return {
    partition: "core",
    subject: "user",
    predicate: "target_city",
    object: { city: "上海" },
    canonicalText: "用户目标城市是上海",
    confidence: 0.9,
    importance: 0.7,
    ...overrides,
  };
}

describe("fact ledger decision stage (M5, ADR-0028)", () => {
  it("NOOP on an identical open fact (no duplicate insert)", () => {
    const ops = decideFactOperationsDeterministic([fact()], candidate({ canonicalText: "用户目标城市是北京", object: { city: "北京" } }));
    expect(ops).toHaveLength(1);
    expect(ops[0].decision).toBe("NOOP");
    expect(ops[0].targetFactId).toBe(1);
  });

  it("UPDATE invalidates a contradicted fact (city change), never overwrites", () => {
    const ops = decideFactOperationsDeterministic([fact()], candidate());
    expect(ops[0].decision).toBe("UPDATE");
    expect(ops[0].targetFactId).toBe(1);
    expect(ops[0].reason).toContain("invalidates fact #1");
  });

  it("ADD when nothing conflicts", () => {
    const ops = decideFactOperationsDeterministic([], candidate({ predicate: "salary_floor" }));
    expect(ops[0].decision).toBe("ADD");
  });

  it("ignores facts from other partitions when matching", () => {
    const ops = decideFactOperationsDeterministic(
      [fact({ partition: "research", canonicalText: "用户目标城市是北京" })],
      candidate({ canonicalText: "用户目标城市是北京", object: { city: "北京" } }),
    );
    expect(ops[0].decision).toBe("ADD");
  });
});

describe("memory partitions (MemCube model)", () => {
  it("evaluation partition is writable by evaluate but not resume agent", () => {
    expect(resolvePartitionAccess("evaluation", "evaluate").writable).toBe(true);
    expect(resolvePartitionAccess("evaluation", "resume").writable).toBe(false);
  });

  it("core partition is readable by every agent", () => {
    for (const agent of ["general", "resume", "evaluate", "offer", "interview", "profile"]) {
      expect(resolvePartitionAccess("core", agent).readable).toBe(true);
    }
  });

  it("assertFactWritable throws for unauthorized writers", () => {
    expect(() => assertFactWritable("evaluation", "resume")).toThrow();
    expect(() => assertFactWritable("core", "profile")).not.toThrow();
  });

  it("denies unknown partitions instead of falling back to core", () => {
    expect(resolvePartitionAccess("unregistered", "general")).toEqual({ readable: false, writable: false });
    expect(() => assertFactReadable("unregistered", "general")).toThrow();
    expect(listReadablePartitions("general")).toEqual(expect.arrayContaining(["core", "research"]));
    expect(listReadablePartitions("general")).not.toContain("unregistered");
  });

  it("keeps private facts behind the user/profile boundary", () => {
    expect(resolvePartitionAccess("private", "profile").readable).toBe(true);
    expect(resolvePartitionAccess("private", "evaluate").readable).toBe(false);
    expect(() => assertFactWritable("private", "evaluate")).toThrow();
  });
});

describe("layered session memory seam", () => {
  it("maps a user resource and stable conversation thread for Mastra", async () => {
    const calls: Array<{ resourceId: string; threadId: string }> = [];
    const adapter = new MastraSessionMemoryAdapter({
      async append(input) { calls.push({ resourceId: input.resourceId, threadId: input.threadId }); },
      async load(input) { calls.push(input); return []; },
    });
    await adapter.append({ userId: "u-1", conversationId: 42 }, [{ role: "user", content: "hello" }], "req-1");
    await adapter.load({ userId: "u-1", conversationId: 42 });
    expect(calls).toEqual([
      { resourceId: "u-1", threadId: "conversation:42" },
      { resourceId: "u-1", threadId: "conversation:42" },
    ]);
  });

  it("fails closed when Mastra cannot target erase", async () => {
    const adapter = new MastraSessionMemoryAdapter({ async append() {}, async load() { return []; } });
    await expect(adapter.eraseTarget({ userId: "u-1", conversationId: 42 }, "sensitive"))
      .rejects.toBeInstanceOf(SessionMemoryConfigurationError);
  });
});
