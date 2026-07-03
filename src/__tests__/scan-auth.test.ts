import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserRecord } from "@/lib/data-repositories";

const activeAdmin: UserRecord = {
  id: "canonical-admin-id",
  username: "admin",
  password_hash: "hash",
  display_name: "Admin",
  role: "admin",
  status: "active",
  token_version: 0,
};

async function loadScanAuth(input: {
  payload: { userId: string; username: string; role: "admin" | "member"; tokenVersion: number };
  byId?: UserRecord;
  byUsername?: UserRecord;
}) {
  vi.resetModules();
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: async () => input.payload,
  }));
  vi.doMock("@/lib/data-repositories", () => ({
    getDataRepositories: () => ({
      users: {
        findById: async () => input.byId,
        findByUsername: async () => input.byUsername,
      },
    }),
  }));
  return import("@/lib/scan-auth");
}

afterEach(() => {
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/data-repositories");
  vi.resetModules();
});

describe("scan auth canonical user resolution", () => {
  it("uses the token user id when it exists and token version matches", async () => {
    const { getCurrentScanUserId } = await loadScanAuth({
      payload: { userId: activeAdmin.id, username: "admin", role: "admin", tokenVersion: 0 },
      byId: activeAdmin,
    });

    await expect(getCurrentScanUserId()).resolves.toBe(activeAdmin.id);
  });

  it("falls back to active username match for migrated sessions with stale user ids", async () => {
    const { getCurrentScanUserId } = await loadScanAuth({
      payload: { userId: "legacy-sqlite-admin-id", username: "admin", role: "admin", tokenVersion: 0 },
      byUsername: activeAdmin,
    });

    await expect(getCurrentScanUserId()).resolves.toBe(activeAdmin.id);
  });

  it("rejects username fallback when token version does not match", async () => {
    const { getCurrentScanUserId, ScanAuthError } = await loadScanAuth({
      payload: { userId: "legacy-sqlite-admin-id", username: "admin", role: "admin", tokenVersion: 9 },
      byUsername: activeAdmin,
    });

    await expect(getCurrentScanUserId()).rejects.toBeInstanceOf(ScanAuthError);
  });
});
