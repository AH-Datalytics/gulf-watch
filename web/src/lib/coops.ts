// NOAA CO-OPS tide gauge data — client-side fetch + pure series derivation.
// URL patterns and stations per .superpowers/sdd/shared-contracts.md.

export interface GaugeStation {
  id: string;
  name: string;
}

// Fixed rail order — matches the quiet-mode mockup's "Lakefront & Coastal
// Gauges" block (New Canal, Shell Beach, Grand Isle). The active-mode mockup
// happens to show only 2 of the 3 gauges in a different order (Shell Beach,
// New Canal) purely for mockup space reasons; the brief calls for all three
// stations regardless of mode, so we keep one canonical order in both rather
// than reordering per mode for no functional reason.
export const GAUGE_STATIONS: GaugeStation[] = [
  { id: "8761927", name: "New Canal Station" },
  { id: "8761305", name: "Shell Beach" },
  { id: "8761724", name: "Grand Isle" },
];

const COOPS_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const COMMON_PARAMS = "datum=MLLW&units=english&time_zone=lst_ldt&format=json&range=48";

export function waterLevelUrl(stationId: string): string {
  return `${COOPS_BASE}?station=${stationId}&product=water_level&${COMMON_PARAMS}`;
}

export function predictionsUrl(stationId: string): string {
  return `${COOPS_BASE}?station=${stationId}&product=predictions&${COMMON_PARAMS}&interval=h`;
}

export interface CoopsRow {
  t: string;
  v: string;
}

export interface CoopsWaterLevelResponse {
  metadata?: { id: string; name: string };
  data?: CoopsRow[];
  error?: { message: string };
}

export interface CoopsPredictionsResponse {
  predictions?: CoopsRow[];
  error?: { message: string };
}

export interface GaugePoint {
  t: string;
  obs: number;
  pred?: number;
}

export interface GaugeSeries {
  points: GaugePoint[];
  latest: number;
  departure: number | null;
}

function toNumber(v: string): number | null {
  // Number("") is 0 (a valid finite number!) and Number("  ") likewise — CO-OPS
  // occasionally emits blank "v" for a flagged/missing reading, so blank
  // strings must be rejected explicitly rather than silently becoming 0.
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// CO-OPS timestamps are "YYYY-MM-DD HH:MM" in the requested time_zone
// (lst_ldt) with no offset info. Date.parse of the "T"-joined string parses
// it as local-to-the-runtime time, which is the wrong absolute instant — but
// toSeries only ever uses these values for *relative* ordering/interpolation
// within a single station's series (never compared across time zones or to
// wall-clock "now" outside this module), so the wrong absolute offset never
// matters here.
function parseCoopsTime(t: string): number {
  return new Date(t.replace(" ", "T")).getTime();
}

interface PredPoint {
  ms: number;
  v: number;
}

/**
 * Linearly interpolates the (hourly) prediction curve at `targetMs`, so every
 * 6-min observation gets a same-instant predicted value for the departure
 * band — clamped to the first/last prediction when `targetMs` falls outside
 * the predicted range (e.g. the freshest observation is newer than the last
 * hourly prediction row).
 */
function interpolatePrediction(sorted: PredPoint[], targetMs: number): number | null {
  if (sorted.length === 0) return null;
  if (targetMs <= sorted[0].ms) return sorted[0].v;
  const last = sorted[sorted.length - 1];
  if (targetMs >= last.ms) return last.v;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ms >= targetMs) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const frac = b.ms === a.ms ? 0 : (targetMs - a.ms) / (b.ms - a.ms);
      return a.v + frac * (b.v - a.v);
    }
  }
  return last.v;
}

/**
 * Pure derivation of a {@link GaugeSeries} from raw CO-OPS JSON. Skips
 * non-numeric "v" rows (CO-OPS returns strings; bad/blank rows are dropped
 * rather than crashing the chart). `predJson` is optional/nullable — when
 * absent (predictions fetch failed or the station has none), every point
 * simply has no `pred` and `departure` is null, per shared-contracts.md
 * ("departure band only where predictions return data, otherwise observed
 * line only").
 *
 * `latest` is typed as a plain `number` (per the task-10 brief's interface),
 * so an empty/all-invalid `data` array falls back to `0` — there is no valid
 * observation to report, but the type has no null case; `points` being `[]`
 * and `departure` being `null` are the real signals callers should check.
 */
export function toSeries(
  waterJson: CoopsWaterLevelResponse | null | undefined,
  predJson: CoopsPredictionsResponse | null | undefined
): GaugeSeries {
  const obsRows = waterJson?.data ?? [];

  const predPoints: PredPoint[] = (predJson?.predictions ?? [])
    .map((row) => {
      const v = toNumber(row.v);
      return v === null ? null : { ms: parseCoopsTime(row.t), v };
    })
    .filter((p): p is PredPoint => p !== null)
    .sort((a, b) => a.ms - b.ms);

  const points: GaugePoint[] = [];
  for (const row of obsRows) {
    const obs = toNumber(row.v);
    if (obs === null) continue;
    const pred = interpolatePrediction(predPoints, parseCoopsTime(row.t));
    points.push(pred === null ? { t: row.t, obs } : { t: row.t, obs, pred });
  }

  if (points.length === 0) {
    return { points: [], latest: 0, departure: null };
  }

  const last = points[points.length - 1];
  const departure = last.pred !== undefined ? last.obs - last.pred : null;

  return { points, latest: last.obs, departure };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetches a station's water_level + predictions and derives its
 * {@link GaugeSeries}. A water_level failure propagates (so SWR surfaces the
 * per-gauge "unavailable" state); a predictions failure degrades silently to
 * an observed-only series, per shared-contracts.md.
 */
export async function fetchGauge(stationId: string): Promise<GaugeSeries> {
  const waterJson = await fetchJson<CoopsWaterLevelResponse>(waterLevelUrl(stationId));
  if (waterJson.error) {
    throw new Error(waterJson.error.message);
  }

  let predJson: CoopsPredictionsResponse | null = null;
  try {
    const parsed = await fetchJson<CoopsPredictionsResponse>(predictionsUrl(stationId));
    predJson = parsed.error ? null : parsed;
  } catch {
    predJson = null; // predictions failure -> observed only
  }

  return toSeries(waterJson, predJson);
}

export interface GaugeState {
  series: GaugeSeries | null;
  unavailable: boolean;
}

/**
 * Pure derivation of {@link GaugeState} from SWR's `data`/`error` — mirrors
 * alerts.ts's `deriveAlertsState` so the "this gauge is down" case is
 * unit-testable without mocking fetch/SWR, and so a transient revalidation
 * error with stale-but-present data doesn't flip a working gauge to
 * "unavailable".
 */
export function deriveGaugeState(data: GaugeSeries | undefined, error: unknown): GaugeState {
  if (data === undefined) {
    return { series: null, unavailable: Boolean(error) };
  }
  return { series: data, unavailable: false };
}
