import { describe, expect, it } from "vitest";
import { mergeServerTranscript } from "@/lib/agent/transcript-merge";

describe("transcript merge (0.11.0-C, ADR-0030)", () => {
  it("server version wins for the same itemId", () => {
    const local = [{ itemId: "a", role: "assistant", content: "流式中的内容" }];
    const server = [{ itemId: "a", role: "assistant", content: "最终落库内容" }];
    expect(mergeServerTranscript(local, server)).toEqual([
      { itemId: "a", role: "assistant", content: "最终落库内容" },
    ]);
  });

  it("keeps local-only optimistic items (not yet persisted)", () => {
    const local = [
      { itemId: "a", role: "user", content: "问题", timestamp: "2026-09-25T10:00:00Z" },
      { itemId: "optimistic-1", role: "assistant", content: "还在生成…", timestamp: "2026-09-25T10:00:05Z" },
    ];
    const server = [{ itemId: "a", role: "user", content: "问题", timestamp: "2026-09-25T10:00:02Z" }];
    const merged = mergeServerTranscript(local, server);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ itemId: "a" });
    expect(merged[1]).toMatchObject({ itemId: "optimistic-1" });
  });

  it("drops local duplicates that the server already supersedes by pseudo id", () => {
    const local = [{ role: "user", content: "同一条消息", timestamp: "2026-09-25T10:00:00Z" }];
    const server = [{ role: "user", content: "同一条消息", timestamp: "2026-09-25T10:00:30Z" }];
    expect(mergeServerTranscript(local, server)).toEqual(server);
  });

  it("server ordering forms the skeleton; locals interleave by timestamp", () => {
    const local = [{ itemId: "opt", role: "tool", content: "本地乐观工具卡", timestamp: "2026-09-25T11:00:00Z" }];
    const server = [
      { itemId: "s1", role: "assistant", content: "回复一", timestamp: "2026-09-25T10:59:00Z" },
      { itemId: "s2", role: "assistant", content: "回复二", timestamp: "2026-09-25T11:01:00Z" },
    ];
    const merged = mergeServerTranscript(local, server);
    // opt's timestamp sits between s1 and s2, so it interleaves there.
    expect(merged.map((m) => ("itemId" in m ? m.itemId : null))).toEqual(["s1", "opt", "s2"]);
  });
});
