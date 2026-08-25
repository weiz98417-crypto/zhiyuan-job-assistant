import { describe, expect, it } from "vitest";
import { advance, createSession } from "@/lib/agent/interview/engine";

describe("interview engine recovery", () => {
  it("reaches done after the finite configured question budget", () => {
    const session = createSession("甲公司", "AI 产品经理");
    const visited: string[] = [];

    for (let index = 0; index < 9; index += 1) {
      visited.push(session.phase);
      advance(session);
    }

    expect(visited).toEqual([
      "intro",
      "tech", "tech", "tech",
      "behavioral", "behavioral",
      "reverse", "reverse", "reverse",
    ]);
    expect(session.phase).toBe("done");
  });
});
