import { describe, expect, it, vi } from "vitest";
import { RuntimeResourceScheduler } from "@/lib/agent/runtime/runtime-resource-scheduler";

describe("Runtime resource scheduler", () => {
  it("bounds each resource independently and releases queued work", async () => {
    const scheduler = new RuntimeResourceScheduler({ model: 2, ocr: 1, write: 1, tool: 4 });
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const operation = () => scheduler.run("write", async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });

    const first = operation();
    const second = operation();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await Promise.all([first, second]);

    expect(maxActive).toBe(1);
  });
});
