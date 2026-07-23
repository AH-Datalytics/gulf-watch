// Central config for the data layer. Keep the Blob base URL name referenced
// here (never hardcode it elsewhere) so Task 8+ can swap envs safely.

export const BLOB_BASE = process.env.NEXT_PUBLIC_BLOB_BASE_URL ?? "";

// Gulf box used to decide storm relevance / "active" mode (see shared-contracts.md).
export const GULF_BOX = { lonMin: -98, lonMax: -80, latMin: 18, latMax: 31 };

// Staleness thresholds (hours) per mode, per spec.
export const STALE_HOURS = { active: 8, quiet: 26 };

export const KT_TO_MPH = 1.15078;

export const CATEGORY_THRESHOLDS_MPH = {
  TS: 39,
  C1: 74,
  C2: 96,
  C3: 111,
  C4: 130,
  C5: 157,
} as const;
