"use client";

import { useCallback } from "react";
import type { ZhiyuanProfile } from "@/types";

export interface LockedFieldsAPI {
  isLocked: (fieldPath: string) => boolean;
  lockField: (fieldPath: string) => Promise<void>;
  unlockField: (fieldPath: string) => Promise<void>;
  lockedFields: Record<string, string>;
}

export function useLockedFields(profile: ZhiyuanProfile | null): LockedFieldsAPI {
  const lockedFields = profile?.lockedFields || {};

  const isLocked = useCallback(
    (fieldPath: string) => fieldPath in lockedFields,
    [lockedFields],
  );

  const lockField = useCallback(
    async (fieldPath: string) => {
      const updated = { ...lockedFields, [fieldPath]: new Date().toISOString() };
      try {
        await fetch("/api/data/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: { lockedFields: updated },
            source: "manual",
          }),
        });
      } catch { /* best effort */ }
    },
    [lockedFields],
  );

  const unlockField = useCallback(
    async (fieldPath: string) => {
      const updated = { ...lockedFields };
      delete updated[fieldPath];
      try {
        await fetch("/api/data/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: { lockedFields: updated },
            source: "auto",
          }),
        });
      } catch { /* best effort */ }
    },
    [lockedFields],
  );

  return { isLocked, lockField, unlockField, lockedFields };
}
