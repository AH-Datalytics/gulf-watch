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

/** Full Central date and time for historical/advisory context. */
export function cdtDateTime(iso: string): string {
  const date = new Date(iso);
  const calendarDate = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  return `${calendarDate} at ${cdtTime(iso)}`;
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

/**
 * Compact CDT day+hour tick for chart x-axes, e.g. "WED 7A" (the intensity
 * panel's mockup style — a 3-letter weekday plus the hour with a single
 * A/P suffix, no minutes since these are forecast-hour ticks, not exact
 * times). Callers wanting a "NOW" tick for tau=0 handle that themselves —
 * this always renders the actual wall-clock day/hour.
 */
export function cdtTickLabel(iso: string): string {
  const date = new Date(iso);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    weekday: "short",
  })
    .format(date)
    .toUpperCase();

  const hourParts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    hour: "numeric",
    hour12: true,
  }).formatToParts(date);
  const hour = hourParts.find((p) => p.type === "hour")?.value ?? "";
  const dayPeriod = hourParts.find((p) => p.type === "dayPeriod")?.value ?? "";

  return `${weekday} ${hour}${dayPeriod.charAt(0)}`;
}

/** Human label for a StormEntry's NHC classification code (mockup's "Hurricane"/"Tropical Storm" prefix). */
export function stormTypeLabel(classification: string): string {
  switch (classification) {
    case "MH":
      return "Major Hurricane";
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

function chicagoTimeParts(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { hour, minute };
}

// NHC's Tropical Weather Outlook issues four times daily in Chicago local
// time: 1 AM / 7 AM / 1 PM / 7 PM CDT (per the task brief).
const OUTLOOK_ISSUE_HOURS_CDT = [1, 7, 13, 19];

/**
 * Renders the next scheduled Tropical Weather Outlook issue time (CDT) after
 * `issuedIso`, e.g. issued 1:00 PM CDT -> "7:00 PM CDT". Walks forward one
 * minute at a time so an off-schedule source timestamp such as 12:13 PM can
 * never leak its minutes into the fixed NHC issue slots.
 */
export function nextOutlookIssueTime(issuedIso: string): string {
  const issued = new Date(issuedIso);
  let t = issued;
  for (let i = 0; i < 24 * 60; i++) {
    t = new Date(t.getTime() + 60 * 1000);
    const { hour, minute } = chicagoTimeParts(t);
    if (minute === 0 && OUTLOOK_ISSUE_HOURS_CDT.includes(hour)) {
      return cdtTime(t.toISOString());
    }
  }
  return cdtTime(issued.toISOString());
}
