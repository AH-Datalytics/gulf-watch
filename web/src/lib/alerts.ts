// Pure NWS active-alerts filtering for the metro parishes — unit tested in
// __tests__/alerts.test.ts. No React here so the logic is trivially testable;
// components/Alerts.tsx wraps this with the actual SWR fetch.

// SAME codes for Jefferson, Orleans, Plaquemines, St. Bernard, St. Tammany
// (per shared-contracts.md).
export const METRO_SAME_CODES = ["022051", "022071", "022075", "022087", "022103"];

export const ALERTS_URL = "https://api.weather.gov/alerts/active?area=LA";

export interface NWSAlertFeature {
  properties: {
    event: string;
    areaDesc: string;
    geocode?: { SAME?: string[] };
  };
}

export interface AlertRow {
  key: string;
  event: string;
  areaDesc: string;
  color: string;
}

function severityRank(event: string): number {
  if (event.includes("Warning")) return 0;
  if (event.includes("Watch")) return 1;
  if (event.includes("Advisory")) return 2;
  return 3;
}

function colorForEvent(event: string): string {
  if (event.includes("Hurricane Warning")) return "#d94141";
  if (event.includes("Storm Surge")) return "#b04fd6";
  if (event.includes("Tropical Storm")) return "#4a7fd4";
  return "var(--rule)";
}

/**
 * Filters raw NWS active-alert features down to the metro parishes, dedupes
 * repeated event+area pairs (adjacent alert polygons for the same event often
 * produce duplicate feature entries), and sorts Warning > Watch > Advisory >
 * everything else.
 */
export function filterMetroAlerts(features: NWSAlertFeature[]): AlertRow[] {
  const seen = new Set<string>();
  const rows: AlertRow[] = [];

  for (const feature of features) {
    const same = feature.properties.geocode?.SAME ?? [];
    if (!same.some((code) => METRO_SAME_CODES.includes(code))) continue;

    const key = `${feature.properties.event}|${feature.properties.areaDesc}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      key,
      event: feature.properties.event,
      areaDesc: feature.properties.areaDesc,
      color: colorForEvent(feature.properties.event),
    });
  }

  return rows.sort((a, b) => severityRank(a.event) - severityRank(b.event));
}

export interface NWSAlertsResponse {
  features: NWSAlertFeature[];
}

export const alertsFetcher = async (url: string): Promise<NWSAlertsResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<NWSAlertsResponse>;
};

export interface AlertsState {
  rows: AlertRow[];
  /** True only when the feed has never successfully loaded and is currently
   *  erroring — i.e. there's no data at all to fall back on. A transient
   *  revalidation error with stale-but-present cached data is NOT
   *  "unavailable": SWR keeps the last good `data`, and showing that instead
   *  of silently rendering "all clear" (or, worse, just letting it look
   *  identical to genuinely having no alerts) is exactly the point. */
  unavailable: boolean;
}

/**
 * Pure derivation of {@link AlertsState} from SWR's `data`/`error`, so the
 * "feed is down" case is unit-testable without mocking fetch/SWR. `data`
 * being defined always wins over `error` (SWR only sets `error` alongside
 * still-present prior `data` when a *revalidation* fails, not the initial
 * load).
 */
export function deriveAlertsState(data: NWSAlertsResponse | undefined, error: unknown): AlertsState {
  if (data === undefined) {
    return { rows: [], unavailable: Boolean(error) };
  }
  return { rows: filterMetroAlerts(data.features), unavailable: false };
}
