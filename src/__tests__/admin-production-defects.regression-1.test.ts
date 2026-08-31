import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const guards = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireAuthenticated: vi.fn(),
}));
const users = vi.hoisted(() => ({
  list: vi.fn(),
  findById: vi.fn(),
}));
const passwordRecoveryRequests = vi.hoisted(() => ({ listPending: vi.fn() }));

vi.mock("@/lib/security/auth-guards", () => guards);
vi.mock("@/lib/data-repositories", () => ({
  getDataRepositories: () => ({ users, passwordRecoveryRequests }),
}));

import { GET as listAdminUsers } from "@/app/api/admin/users/route";
import { GET as getCurrentUser } from "@/app/api/users/me/route";
import { resolveMemoryEmbeddingConfig } from "@/lib/memory/vector-memory";

const source = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  "utf8",
);

const ALL_USERS = [
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `pending-${index}`,
    username: `pending-${index}`,
    display_name: `Pending ${index}`,
    email: "",
    role: "member",
    status: "pending",
    created_at: "2026-08-31T00:00:00.000Z",
    last_login_at: null,
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    id: index === 0 ? "owner-1" : `active-${index}`,
    username: index === 0 ? "admin" : `active-${index}`,
    display_name: index === 0 ? "???" : `Active ${index}`,
    email: "",
    role: index === 0 ? "superadmin" : "member",
    status: "active",
    created_at: "2026-08-31T00:00:00.000Z",
    last_login_at: null,
  })),
];

// Regression: ISSUE-ADMIN-001..004 — production admin defects found by browser QA.
// Found by /qa on 2026-08-31
// Report: .gstack/qa-reports/production-2026-08-31/admin/qa-report-admin-production-2026-08-31.md

describe("production administration regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const actor = {
      userId: "owner-1",
      username: "admin",
      role: "superadmin",
      tokenVersion: 1,
      mustChangePassword: false,
    };
    guards.requireAdmin.mockResolvedValue(actor);
    guards.requireAuthenticated.mockResolvedValue(actor);
    passwordRecoveryRequests.listPending.mockResolvedValue([]);
    users.list.mockImplementation(async (status?: string) => (
      status ? ALL_USERS.filter((user) => user.status === status) : ALL_USERS
    ));
  });

  it("keeps global account counts stable when the table is filtered", async () => {
    const response = await listAdminUsers(
      new NextRequest("http://localhost/api/admin/users?status=pending&includeSummary=1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      users: expect.arrayContaining([
        expect.objectContaining({ status: "pending" }),
      ]),
      summary: { all: 22, pending: 12, active: 10, rejected: 0 },
    });
  });

  it("falls back to the username when a persisted display name is corrupted", async () => {
    users.findById.mockResolvedValue(ALL_USERS.find((user) => user.id === "owner-1"));

    const currentUserResponse = await getCurrentUser();
    const adminUsersResponse = await listAdminUsers(
      new NextRequest("http://localhost/api/admin/users?status=active&includeSummary=1"),
    );

    await expect(currentUserResponse.json()).resolves.toMatchObject({
      username: "admin",
      displayName: "admin",
    });
    await expect(adminUsersResponse.json()).resolves.toMatchObject({
      users: expect.arrayContaining([
        expect.objectContaining({ username: "admin", displayName: "admin" }),
      ]),
    });
  });

  it("provides mobile user cards and keeps fixed navigation from covering content", () => {
    const usersPage = source("src/app/admin/users/page.tsx");
    const appShell = source("src/components/shell/AppShell.tsx");
    const navItem = source("src/components/shell/NavItem.tsx");
    const runtimePage = source("src/app/admin/agent-runs/page.tsx");
    const backfillScript = source("scripts/backfill-memory.mjs");

    expect(usersPage).toContain('data-testid="admin-user-mobile-list"');
    expect(usersPage).toContain('className="hidden md:block');
    expect(usersPage).toContain("注册时间");
    expect(usersPage).toContain("最近登录");
    expect(appShell).toContain("pb-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(appShell).toContain("<NavItem key={item.href} {...item} mobile />");
    expect(navItem).toContain("flex min-w-0 flex-1 flex-col");
    expect(runtimePage).toContain("[overflow-wrap:anywhere]");
    expect(backfillScript).toContain("embedChunkBatch(batch, config)");
    expect(backfillScript).toContain("MEMORY_EMBEDDING_BATCH_SIZE || 16");
    expect(backfillScript).toContain("async function loadFailedChunks");
    expect(backfillScript).toContain('arg === "--retry-failed"');
  });

  it("trims embedding secrets before choosing the provider key", () => {
    const config = resolveMemoryEmbeddingConfig({
      MEMORY_EMBEDDING_PROVIDER: "openai-compatible",
      MEMORY_EMBEDDING_API_URL: "https://example.invalid/v1/embeddings",
      MEMORY_EMBEDDING_MODEL: "text-embedding-v4",
      MEMORY_EMBEDDING_API_KEY: "   ",
      DASHSCOPE_API_KEY: "provider-key",
    });

    expect(config.apiKey).toBe("provider-key");
  });
});
