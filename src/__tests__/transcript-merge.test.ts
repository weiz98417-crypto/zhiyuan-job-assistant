import { describe, expect, it } from "vitest";
import { mergeServerTranscript } from "@/lib/agent/transcript-merge";

describe("transcript merge (0.11.0-C, ADR-0036)", () => {
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

  it("replaces an optimistic user turn with its durable memory row", () => {
    const local = [{ role: "user", content: "你好", timestamp: "2026-09-29T10:00:00Z" }];
    const server = [{ itemId: "memory-user-1", role: "user", content: "你好", timestamp: "2026-09-29T10:00:01Z" }];
    expect(mergeServerTranscript(local, server)).toEqual(server);
  });

  it("keeps two separate identical turns when both were submitted", () => {
    const local = [
      { role: "user", content: "你好", timestamp: "2026-09-29T10:00:00Z" },
      { role: "user", content: "你好", timestamp: "2026-09-29T10:00:10Z" },
    ];
    const server = [
      { itemId: "memory-user-1", role: "user", content: "你好", timestamp: "2026-09-29T10:00:01Z" },
      { itemId: "memory-user-2", role: "user", content: "你好", timestamp: "2026-09-29T10:00:11Z" },
    ];
    expect(mergeServerTranscript(local, server)).toEqual(server);
    expect(mergeServerTranscript(local, server.slice(0, 1))).toHaveLength(2);
  });

  it("replaces a live assistant reply with its durable memory row", () => {
    const local = [{ itemId: "run-1:text:1", role: "assistant", content: "你好，有什么可以帮你？", timestamp: "2026-09-29T10:00:03Z" }];
    const server = [{ itemId: "memory-assistant-1", role: "assistant", content: "你好，有什么可以帮你？", timestamp: "2026-09-29T10:00:02Z" }];
    expect(mergeServerTranscript(local, server)).toEqual(server);
  });

  it("reconciles an image-only turn whose server text was generated at admission", () => {
    const image = "data:image/png;base64,dGVzdA==";
    const local = [{ role: "user", content: "", images: [image], timestamp: "2026-09-29T10:00:00Z" }];
    const server = [{ itemId: "memory-user-1", role: "user", content: "请识别这张图片，并根据图片内容帮助我处理。", images: [image], timestamp: "2026-09-29T10:00:01Z" }];
    expect(mergeServerTranscript(local, server)).toEqual(server);
  });

  it("reconciles the PDF extraction appended to a submitted turn", () => {
    const local = [{ role: "user", content: "分析简历", images: ["data:application/pdf;base64,dGVzdA=="], timestamp: "2026-09-29T10:00:00Z" }];
    const server = [{ itemId: "memory-user-1", role: "user", content: "分析简历\n\n---\n已读取的 PDF 文本（仅用于本次分析，不会自动保存）：\n内容", images: [], timestamp: "2026-09-29T10:00:01Z" }];
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
