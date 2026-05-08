/* ── Client-side profile update trigger ──
 * Calls the server-side /api/profile/analyze which runs the server profile engine.
 * Syncs results to DexieDB as cache.
 */

import { saveProfile, loadProfile } from "@/lib/profile-storage";
import type { ZhiyuanProfile } from "@/types";

/** Trigger a server-side profile analysis. Runs in background, never throws. */
export async function triggerProfileUpdate(options?: { force?: boolean }): Promise<void> {
  try {
    const res = await fetch("/api/profile/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: options?.force ?? false }),
    });

    const json = await res.json();
    if (!json.success || !json.data) return;

    // Sync to DexieDB cache
    await syncProfileToCache(json.data);
  } catch {
    // Silent — profile update is best-effort
  }
}

/** Sync server profile data to DexieDB cache */
export async function syncProfileToCache(serverProfile: {
  data?: Record<string, unknown>;
  goals?: Record<string, unknown>;
  history?: unknown[];
  lastUpdated?: string;
}): Promise<void> {
  try {
    const existing = await loadProfile();
    const profile: ZhiyuanProfile = {
      skills: (serverProfile.data?.skills as ZhiyuanProfile["skills"]) || existing?.skills || [],
      preferences: (serverProfile.data?.preferences as ZhiyuanProfile["preferences"]) || existing?.preferences || {
        companySize: { startup: 0, sme: 0, large: 0 },
        industry: {},
        workStyle: {},
        salaryTarget: { min: 0, max: 0 },
      },
      marketFit: (serverProfile.data?.marketFit as ZhiyuanProfile["marketFit"]) || existing?.marketFit || {
        overallScore: 0,
        topArchetypes: [],
        skillGaps: [],
      },
      goals: (serverProfile.goals as ZhiyuanProfile["goals"]) || existing?.goals,
      history: (serverProfile.history as ZhiyuanProfile["history"]) || existing?.history || [],
      lastUpdated: serverProfile.lastUpdated || new Date().toISOString(),
    };

    await saveProfile(profile);
  } catch {
    // Silent — cache sync is best-effort
  }
}
