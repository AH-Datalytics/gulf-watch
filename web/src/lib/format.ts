// Pure formatting helpers — unit tested in __tests__/format.test.ts.

import { CATEGORY_THRESHOLDS_MPH } from "./config";

export type Category = "TD" | "TS" | "1" | "2" | "3" | "4" | "5";

/** Category ladder from sustained wind speed (mph). Thresholds per shared-contracts.md. */
export function categoryFor(mph: number): Category {
  const t = CATEGORY_THRESHOLDS_MPH;
  if (mph >= t.C5) return "5";
  if (mph >= t.C4) return "4";
  if (mph >= t.C3) return "3";
  if (mph >= t.C2) return "2";
  if (mph >= t.C1) return "1";
  if (mph >= t.TS) return "TS";
  return "TD";
}

const CHICAGO_TIME_ZONE = "America/Chicago";

/**
 * Render an ISO instant in America/Chicago local time, e.g. "4:00 PM CDT".
 * Uses Intl so DST (CDT vs CST) is resolved correctly for the given date.
 */
export function cdtTime(iso: string): string {
  const date = new Date(iso);

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    timeZoneName: "short",
  });

  const time = timeFormatter.format(date);
  const tzPart = tzFormatter
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;

  return `${time} ${tzPart ?? "CT"}`;
}

/**
 * Render the time remaining until `toIso` as "T−H:MM" (e.g. "T−2:41").
 * Clamps to "T−0:00" once the target has passed. `now` is injectable for tests.
 */
export function countdown(toIso: string, now: Date = new Date()): string {
  const target = new Date(toIso);
  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `T−${hours}:${String(minutes).padStart(2, "0")}`;
}
