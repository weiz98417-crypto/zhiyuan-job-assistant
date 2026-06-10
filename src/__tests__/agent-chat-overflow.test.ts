import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("agent chat overflow containment", () => {
  it("keeps long markdown output from creating page-level horizontal scroll", () => {
    const markdown = source("src/components/MarkdownRenderer.tsx");
    const chat = source("src/components/agent/AgentChat.tsx");

    expect(markdown).toContain("max-w-full overflow-hidden");
    expect(markdown).toContain("overflow-x-auto");
    expect(markdown).toContain("[overflow-wrap:anywhere]");

    expect(chat).toContain("overflow-y-auto overflow-x-hidden");
    expect(chat).toContain("flex w-full min-w-0");
    expect(chat).toContain("max-w-[90%] min-w-0 overflow-hidden");
  });
});
