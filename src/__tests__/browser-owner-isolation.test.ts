import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function story(title: string) {
  return { title, tags: [], situation: "", task: "", action: "", result: "", reflection: "", createdAt: new Date() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("browser account isolation", () => {
  it("imports with exact receipts and rolls back all rows if a later write fails", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    const { setBrowserOwner } = await import("@/lib/browser-owner");
    const { default: db } = await import("@/lib/db");
    const { importApplicationsMarkdown } = await import("@/lib/application-import");
    setBrowserOwner("import-A");
    const document = (company: string) => [
      "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
      "|---|---|---|---|---|---|---|---|---|",
      "| 1 | 2026-10-13 | First | PM | 4/5 | evaluated | ✅ | | |",
      "| 2 | 2026-10-13 | " + company + " | PM | 4/5 | evaluated | ✅ | | |",
      "| bad | invalid | Broken | PM | 4/5 | unknown | | | |",
    ].join("\n");
    const creating = (_key: unknown, record: { company: string }) => {
      if (record.company === "Failure") throw new Error("write rejected");
    };
    db.applications.hook("creating", creating);
    await expect(importApplicationsMarkdown(document("Failure"))).rejects.toThrow("write rejected");
    expect(await db.applications.count()).toBe(0);
    db.applications.hook("creating").unsubscribe(creating);
    expect(await importApplicationsMarkdown(document("Second"))).toEqual({ added: 2, duplicated: 0, invalid: 1 });
    expect(await importApplicationsMarkdown(document("Second"))).toEqual({ added: 0, duplicated: 2, invalid: 1 });
    expect(await db.applications.count()).toBe(2);
    await expect(importApplicationsMarkdown("broken document")).rejects.toThrow("表头");
    expect(await db.applications.count()).toBe(2);
  });

  it("isolates local tables and caches, preserves legacy evidence, and rejects a retired writer", async () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    localStorage.setItem("zhiyuan-profile", "LEGACY_UNOWNED");
    const { setBrowserOwner, ownerLocalStorage } = await import("@/lib/browser-owner");
    const { default: db, ZhiyuanDB } = await import("@/lib/db");
    const legacy = new ZhiyuanDB();
    await legacy.stories.add(story("LEGACY_STORY"));
    legacy.close();

    setBrowserOwner("account-A");
    const accountAStorage = ownerLocalStorage();
    accountAStorage.setItem("zhiyuan-profile", "A_PRIVATE");
    const retiredTable = db.stories;
    await retiredTable.add(story("A_STORY"));

    setBrowserOwner("account-B");
    expect(ownerLocalStorage().getItem("zhiyuan-profile")).toBeNull();
    expect(await db.stories.toArray()).toEqual([]);
    expect(() => accountAStorage.setItem("zhiyuan-profile", "LATE_A")).toThrow();
    await expect(retiredTable.add(story("LATE_STORY"))).rejects.toThrow();
    await db.stories.add(story("B_STORY"));
    expect(localStorage.getItem("zhiyuan-profile")).toBeNull();
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!)).join(" ")).toContain("LEGACY_UNOWNED");

    setBrowserOwner("account-A");
    expect(ownerLocalStorage().getItem("zhiyuan-profile")).toBe("A_PRIVATE");
    expect((await db.stories.toArray()).map((story) => story.title)).toEqual(["A_STORY"]);
    const preservedLegacy = new ZhiyuanDB();
    expect((await preservedLegacy.stories.toArray()).map((story) => story.title)).toEqual(["LEGACY_STORY"]);
    preservedLegacy.close();
    setBrowserOwner(null);
    expect(() => db.stories).toThrow();
  });

  it("clears all twelve current-account tables and scoped keys while preserving another account", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    const { setBrowserOwner, ownerLocalStorage } = await import("@/lib/browser-owner");
    const { default: db, clearLocalBusinessData } = await import("@/lib/db");
    setBrowserOwner("clear-B");
    await db.stories.add(story("B_KEEP"));
    ownerLocalStorage().setItem("zhiyuan-profile", "B_KEEP");
    setBrowserOwner("clear-A");
    expect(db.tables).toHaveLength(12);
    for (const table of db.tables) await table.add({ marker: table.name });
    ownerLocalStorage().setItem("zhiyuan-cv", "A_CV");
    await clearLocalBusinessData();
    for (const table of db.tables) expect(await table.count()).toBe(0);
    expect(ownerLocalStorage().length).toBe(0);
    setBrowserOwner("clear-B");
    expect((await db.stories.toArray())[0].title).toBe("B_KEEP");
    expect(ownerLocalStorage().getItem("zhiyuan-profile")).toBe("B_KEEP");
    setBrowserOwner(null);
  });

  it("rejects local reads and writes immediately when another tab changes the shared account", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const { BROWSER_OWNER_KEY, setBrowserOwner, ownerLocalStorage } = await import("@/lib/browser-owner");
    setBrowserOwner("tab-A");
    const captured = ownerLocalStorage();
    captured.setItem("draft", "A_SECRET");
    storage.setItem(BROWSER_OWNER_KEY, JSON.stringify({ ownerId: "tab-B", sessionKey: "other-session" }));
    expect(() => captured.getItem("draft")).toThrow();
    expect(() => captured.setItem("draft", "late")).toThrow();
  });
});
