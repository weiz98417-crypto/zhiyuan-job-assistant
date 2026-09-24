import { describe, expect, it } from "vitest";
import { isNearChatBottom, shouldFollowChatScroll } from "@/lib/agent/chat-scroll";

describe("Agent chat scroll follow", () => {
  it("does not pull the user down while they read older messages", () => {
    const previous = { sessionId: 10, userMessageCount: 2 };
    const current = { sessionId: 10, userMessageCount: 2 };
    expect(isNearChatBottom({ scrollHeight: 1200, scrollTop: 300, clientHeight: 500 })).toBe(false);
    expect(shouldFollowChatScroll(previous, current, false)).toBe(false);
  });

  it("follows streaming updates near the bottom and new user messages from anywhere", () => {
    const previous = { sessionId: 10, userMessageCount: 2 };
    expect(isNearChatBottom({ scrollHeight: 1200, scrollTop: 610, clientHeight: 500 })).toBe(true);
    expect(shouldFollowChatScroll(previous, previous, true)).toBe(true);
    expect(shouldFollowChatScroll(previous, { sessionId: 10, userMessageCount: 3 }, false)).toBe(true);
  });

  it("opens a different conversation at its latest message", () => {
    expect(shouldFollowChatScroll(
      { sessionId: 10, userMessageCount: 5 },
      { sessionId: 11, userMessageCount: 1 },
      false,
    )).toBe(true);
  });
});
