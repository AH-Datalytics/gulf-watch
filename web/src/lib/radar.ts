export const RADAR_METADATA_URL =
  "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json";

export const RADAR_STALE_AFTER_MINUTES = 15;

interface IemRadarMetadata {
  meta?: { valid?: unknown };
}

/** Extract and validate the observation time from IEM's current N0Q metadata. */
export function radarValidTime(payload: unknown): string {
  const valid = (payload as IemRadarMetadata | null)?.meta?.valid;
  if (typeof valid !== "string" || !Number.isFinite(Date.parse(valid))) {
    throw new Error("IEM radar metadata did not include a valid timestamp");
  }
  return valid;
}

export function radarAgeMinutes(valid: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(valid)) / 60_000));
}
