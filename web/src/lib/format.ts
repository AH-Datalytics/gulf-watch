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

/** Human label for a StormEntry's NHC classification code (mockup's "Hurricane"/"Tropical Storm" prefix). */
export function stormTypeLabel(classification: string): string {
  switch (classification) {
    case "HU":
      return "Hurricane";
    case "TS":
      return "Tropical Storm";
    case "TD":
      return "Tropical Depression";
    case "STD":
      return "Subtropical Depression";
    case "SS":
      return "Subtropical Storm";
    default:
      return classification;
  }
}

/** "2026072212" -> "12Z" (the modelCycle hour, NHC/model-guidance style). */
export function formatCycle(modelCycle: string): string {
  const hh = modelCycle.slice(-2);
  return `${hh}Z`;
}

function chicagoHour(date: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return Number(s) % 24;
}

// NHC's Tropical Weather Outlook issues four times daily in Chicago local
// time: 1 AM / 7 AM / 1 PM / 7 PM CDT (per the task brief).
const OUTLOOK_ISSUE_HOURS_CDT = [1, 7, 13, 19];

/**
 * Renders the next scheduled Tropical Weather Outlook issue time (CDT) after
 * `issuedIso`, e.g. issued 1:00 PM CDT -> "7:00 PM CDT". Walks forward an hour
 * at a time (at most a day) so DST transitions resolve the same way `cdtTime`
 * does, via Intl rather than manual UTC-offset math.
 */
export function nextOutlookIssueTime(issuedIso: string): string {
  const issued = new Date(issuedIso);
  let t = issued;
  for (let i = 0; i < 24; i++) {
    t = new Date(t.getTime() + 60 * 60 * 1000);
    if (OUTLOOK_ISSUE_HOURS_CDT.includes(chicagoHour(t))) {
      return cdtTime(t.toISOString());
    }
  }
  return cdtTime(issued.toISOString());
}
