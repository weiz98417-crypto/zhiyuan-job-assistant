import db from "@/lib/db";
import type { ZhiyuanProfile, ProfileHistoryEntry } from "@/types";

const MAX_SNAPSHOTS = 10;

export async function saveProfile(profile: ZhiyuanProfile): Promise<void> {
  profile.lastUpdated = new Date().toISOString();
  const existing = await db.profiles.where("id").equals(1 as never).first();
  if (existing) {
    await db.profiles.update(1 as never, { ...profile });
  } else {
    await db.profiles.put({ ...profile, id: 1 } as ZhiyuanProfile);
  }
  await pruneSnapshots();
}

export async function loadProfile(): Promise<ZhiyuanProfile | null> {
  const profile = await db.profiles.where("id").equals(1 as never).first();
  return profile ?? null;
}

export async function getProfileHistory(): Promise<ProfileHistoryEntry[]> {
  const profile = await loadProfile();
  return profile?.history ?? [];
}

async function pruneSnapshots(): Promise<void> {
  const all = await db.profiles.toArray();
  const snapshots = all.filter((p) => p.id !== 1);
  if (snapshots.length > MAX_SNAPSHOTS) {
    const toDelete = snapshots
      .sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime())
      .slice(0, snapshots.length - MAX_SNAPSHOTS);
    for (const snap of toDelete) {
      if (snap.id) await db.profiles.delete(snap.id as never);
    }
  }
}

export function createEmptyProfile(): ZhiyuanProfile {
  return {
    skills: [],
    preferences: {
      companySize: { startup: 0, sme: 0, large: 0 },
      industry: {},
      workStyle: {},
      salaryTarget: { min: 0, max: 0 },
    },
    marketFit: {
      overallScore: 0,
      topArchetypes: [],
      skillGaps: [],
    },
    history: [
      {
        timestamp: new Date().toISOString(),
        event: "画像已创建",
        changes: ["初始化空白画像"],
      },
    ],
    lastUpdated: new Date().toISOString(),
  };
}
