"use client";

import useSWR from "swr";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { BLOB_BASE, STALE_HOURS } from "./config";
import type { WindThreshold } from "./layers";
import type { Manifest, StormEntry, IntensitySeries, Mode, ProbsEntry, StormTextProducts } from "./types";

const DEMO_BASE = "/demo";
const LIVE_REFRESH_MS = 5 * 60 * 1000;
const VERSIONED_DATA_OPTIONS = {
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
};

declare global {
  interface Window {
    __GULF_WATCH_MANIFEST_PREFETCH__?: {
      url: string;
      promise: Promise<Manifest>;
    };
  }
}

// Design note: we read the `?demo=` flag via window.location.search rather
// than next/navigation's useSearchParams. useSearchParams is a Client
// Component hook that requires a <Suspense> boundary around anything that
// calls it (Next 16 App Router) to avoid a full-route CSR bailout on
// prerendered routes.
//
// A synchronous `typeof window !== "undefined" ? window.location.search : ""`
// read during render is NOT safe even though it looks SSR-guarded: React
// hydration requires the client's *first* render to match the server's HTML
// exactly, and window IS already defined during that first client render (it
// only differs from the server env, not across the client's own
// pre-mount/post-mount renders) — so demo would read `false` on the server
// and `true` on the client in the very same hydration pass, which is exactly
// the mismatch React's hydration check exists to catch (confirmed via a
// Playwright hydration-error repro against ?demo=1 while building this).
//
// A useEffect+useState pair (the first fix) avoids the hydration mismatch
// (first client render still sees demo=null, matching the server; the effect
// corrects it a tick later) but trips
// react-hooks/set-state-in-effect (calling a setState setter synchronously
// in an effect body). useSyncExternalStore is the correct tool for exactly
// this "read a value from an external system that doesn't change during this
// component's lifetime, with a real SSR snapshot" case: it returns the
// server snapshot (null) during hydration -- matching the server's render,
// same as the effect version -- but does it by giving React its own
// external-store-read seam instead of a manual setState-in-effect, which is
// both hydration-safe and lint-clean. The query string can't change without a
// full navigation/reload, so the subscribe callback never needs to fire; we
// still return a real (no-op) unsubscribe function rather than skipping
// useSyncExternalStore altogether, since that's the documented contract.
function useDemoParam(): string | null | undefined {
  return useSyncExternalStore<string | null | undefined>(
    () => () => {}, // never re-subscribes; query string can't change without reload
    () => new URLSearchParams(window.location.search).get("demo"), // client snapshot
    () => undefined // unresolved during SSR/hydration; do not fetch the live manifest yet
  );
}

function useStormParam(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("storm"),
    () => null
  );
}

function useAdvisoryParam(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("advisory"),
    () => null
  );
}

const jsonFetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

const manifestFetcher = async (url: string): Promise<Manifest> => {
  if (typeof window !== "undefined") {
    const prefetched = window.__GULF_WATCH_MANIFEST_PREFETCH__;
    if (prefetched?.url === url) {
      delete window.__GULF_WATCH_MANIFEST_PREFETCH__;
      try {
        return await prefetched.promise;
      } catch {
        // Fall through to a normal retry so an early transient failure does
        // not turn into the dashboard's terminal unavailable state.
      }
    }
  }

  const requestUrl = url === `${BLOB_BASE}/manifest.json`
    ? `${url}?v=${Math.floor(Date.now() / LIVE_REFRESH_MS)}`
    : url;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<Manifest>;
};

/** Stable cache key for advisory-scoped products that never change in place. */
export function versionedDataUrl(base: string, path: string, version?: string | null): string {
  const url = `${base}/${path}`;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

/**
 * Manifest URL for a given `?demo=` value. `demo=bertha` fetches a real
 * captured advisory-016 snapshot (web/public/demo/bertha/manifest.json) and
 * `demo=ida` the real Hurricane Ida historical sample
 * (web/public/demo/ida/manifest.json) — both have `storms[0].files` values
 * pre-rewritten to `<variant>/<name>.geojson` (relative to `DEMO_BASE`), so
 * no base-URL branching is needed elsewhere: `base` in {@link useDashboard}
 * stays `DEMO_BASE` for every demo variant, and the manifest's own `files`
 * map does all the path resolution.
 *
 * The fictional Hurricane Solene demo (formerly `?demo=1`, whose fixtures
 * lived flat under web/public/demo/) was RETIRED once the real Ida sample
 * landed (v2 addendum, Round 2) — any demo value other than "quiet"/
 * "bertha"/"ida" now falls back to the Ida flagship sample rather than
 * Solene.
 */
export function manifestUrl(demoParam: string | null): string {
  if (demoParam === "quiet") return `${DEMO_BASE}/manifest-quiet.json`;
  if (demoParam === "bertha") return `${DEMO_BASE}/bertha/manifest.json`;
  if (demoParam !== null) return `${DEMO_BASE}/ida/manifest.json`;
  return `${BLOB_BASE}/manifest.json`;
}

/** Hold all manifest requests until hydration has resolved the query string. */
export function resolvedManifestUrl(demoParam: string | null | undefined): string | null {
  return demoParam === undefined ? null : manifestUrl(demoParam);
}

/**
 * Map-corner demo tag text for a given `?demo=` value — `null` when not in
 * demo mode at all. `demo=bertha` is a real archived advisory, so its tag
 * reads "ARCHIVED DATA" rather than "SIMULATED"; `demo=ida` (or any other
 * non-"quiet" demo value, now that Solene is retired) is a real historical
 * sample and reads "HISTORICAL SAMPLE"; `demo=quiet` is the only remaining
 * fictional/simulated variant.
 */
export function demoTag(demoParam: string | null): string | null {
  if (demoParam === null) return null;
  if (demoParam === "bertha") return "ARCHIVED DATA — TS BERTHA · ADV 016 · JUL 23 2026";
  if (demoParam === "quiet") return "SIMULATED STORM — DEMO DATA";
  return "HISTORICAL SAMPLE — HURRICANE IDA · AUG 27–28 2021";
}

/** Strongest inGulfBox storm, else strongest storm overall, else null. */
export function selectStorm(storms: StormEntry[], selectedId?: string | null): StormEntry | null {
  if (storms.length === 0) return null;
  const requested = selectedId ? storms.find((storm) => storm.id === selectedId) : undefined;
  if (requested) return requested;
  const inGulf = storms.filter((s) => s.inGulfBox);
  const pool = inGulf.length > 0 ? inGulf : storms;
  return pool.reduce((strongest, s) =>
    s.intensityMph > strongest.intensityMph ? s : strongest
  );
}

/**
 * Every manifest storm EXCEPT the selected one (B2, final review — "v1: show
 * all cones, detail for strongest Gulf threat"). These get a cone + a name
 * label on the map but none of the selected storm's full detail (track,
 * models, wwlines, intensity, rail header). Order is preserved from
 * `storms`; when `selected` is null every storm is "other" (nothing to
 * exclude).
 */
export function otherStorms(storms: StormEntry[], selected: StormEntry | null): StormEntry[] {
  if (!selected) return storms;
  return storms.filter((s) => s.id !== selected.id);
}

/**
 * True if `manifest.generated` is older than the mode's staleness threshold.
 * Always false while in demo mode (N4, final review): demo showcases replay
 * a fixed, already-old `generated` timestamp on purpose, and must never
 * flash "Data may be delayed" — that's a live-feed concern only.
 */
export function computeStale(manifest: Manifest | undefined, mode: Mode, demo: boolean): boolean {
  if (demo) return false;
  if (!manifest) return false;
  const thresholdHours = mode === "active" ? STALE_HOURS.active : STALE_HOURS.quiet;
  const ageMs = Date.now() - new Date(manifest.generated).getTime();
  return ageMs > thresholdHours * 3600 * 1000;
}

/** A non-selected storm's map presentation: just enough to draw its cone
 *  + a name label at its current position (B2, final review). */
export interface OtherStorm {
  id: string;
  name: string;
  lat: number;
  lon: number;
  cone?: GeoJSON.FeatureCollection;
}

export interface DashboardData {
  status: "loading" | "ready" | "unavailable";
  retry: () => void;
  manifest: Manifest | null;
  mode: Mode;
  demo: boolean;
  demoParam: string | null;
  dataIssues: { product: string; message: string }[];
  /** Map-corner tag text when `demo` is true (e.g. "SIMULATED STORM — DEMO DATA"
   *  or, for `?demo=bertha`, "ARCHIVED DATA — TS BERTHA · ADV 016 · JUL 23 2026");
   *  null otherwise. See {@link demoTag}. */
  demoTag: string | null;
  storms: StormEntry[];
  storm: StormEntry | null;
  advisories: StormEntry[];
  advisoryIndex: number;
  selectAdvisoryIndex: (index: number) => void;
  /** Every OTHER manifest storm (v1: "show all cones, detail for strongest
   *  Gulf threat") — see {@link otherStorms}. */
  otherStorms: OtherStorm[];
  geo: {
    cone?: GeoJSON.FeatureCollection;
    track?: GeoJSON.FeatureCollection;
    history?: GeoJSON.FeatureCollection;
    wwlines?: GeoJSON.FeatureCollection;
    models?: GeoJSON.FeatureCollection;
    outlook?: GeoJSON.FeatureCollection;
    windFieldUrl?: string;
    /** Real NHC wind-speed-probability shapefile (34kt threshold), when the
     *  selected storm's manifest entry carries `files.windprob` — see
     *  types.ts. undefined for storms without it (most, today). */
    windProbUrls: Partial<Record<WindThreshold, string>>;
    satellite?: {
      url: string;
      issued: string;
      sourceLabel: string;
      sourceUrl: string;
      bounds: [[number, number], [number, number]];
    };
    radar?: {
      url: string;
      issued: string;
      sourceLabel: string;
      sourceUrl: string;
      bounds: [[number, number], [number, number]];
    };
  };
  intensity: IntensitySeries | null;
  outlookText: { issued: string; text: string } | null;
  /** storms/{id}/probs.json for the selected storm — null while loading (or
   *  if the product failed to fetch/build for this advisory); see
   *  WindProbabilities.tsx. */
  probs: ProbsEntry[] | null;
  /** storms/{id}/text.json for the selected storm — null while loading (or
   *  if it failed); see ForecastDiscussion.tsx. */
  textProducts: StormTextProducts | null;
  stale: boolean;
}

function useDashboardSource(): DashboardData {
  const demoParam = useDemoParam();
  const stormParam = useStormParam();
  const advisoryParam = useAdvisoryParam();
  const [advisoryOverride, setAdvisoryOverride] = useState<string | null>(null);
  const demo = demoParam !== null && demoParam !== undefined;
  const base = demo ? DEMO_BASE : BLOB_BASE;
  const refreshOptions = { refreshInterval: demo ? 0 : LIVE_REFRESH_MS };
  const manifestKey = resolvedManifestUrl(demoParam);

  const { data: manifest, error: manifestError, mutate: retryManifest } = useSWR<Manifest>(
    manifestKey,
    manifestFetcher,
    refreshOptions
  );

  const baseStorm = useMemo(
    () => selectStorm(manifest?.storms ?? [], stormParam),
    [manifest, stormParam]
  );
  const storm = useMemo(
    () => selectAdvisory(baseStorm, advisoryOverride ?? advisoryParam),
    [advisoryOverride, advisoryParam, baseStorm]
  );
  const advisories = useMemo(
    () => baseStorm?.advisories ?? (baseStorm ? [baseStorm] : []),
    [baseStorm]
  );
  const advisoryIndex = Math.max(
    0,
    advisories.findIndex((frame) => frame.advisoryNum === storm?.advisoryNum)
  );
  const selectAdvisoryIndex = useCallback(
    (index: number) => {
      const frame = advisories[index];
      if (!frame) return;
      setAdvisoryOverride(frame.advisoryNum);
      const url = new URL(window.location.href);
      url.searchParams.set("advisory", frame.advisoryNum);
      window.history.replaceState(window.history.state, "", url);
    },
    [advisories]
  );

  // B2 (final review): every other manifest storm gets its own cone drawn on
  // the map (same styling as the selected storm's) plus a name label — the
  // selected storm's cone is already fetched separately below via `coneUrl`,
  // so it's excluded here to avoid double-fetching the same URL twice under
  // two different SWR cache keys.
  const otherStormEntries = useMemo(
    () => otherStorms(manifest?.storms ?? [], storm),
    [manifest, storm]
  );
  const otherConeUrls = useMemo(
    () => otherStormEntries.map((s) => versionedDataUrl(base, s.files.cone, `${s.advisoryNum}-${s.modelCycle}`)),
    [otherStormEntries, base]
  );
  // One combined SWR fetch (Promise.all over the URL list) rather than one
  // useSWR call per storm: the storm count varies run to run, and calling a
  // hook a variable number of times per render would break the rules of
  // hooks.
  const { data: otherCones } = useSWR<GeoJSON.FeatureCollection[]>(
    otherConeUrls.length > 0 ? otherConeUrls : null,
    (urls: string[]) => Promise.all(urls.map((u) => jsonFetcher<GeoJSON.FeatureCollection>(u))),
    VERSIONED_DATA_OPTIONS
  );
  const otherStormsWithCones = useMemo<OtherStorm[]>(
    () =>
      otherStormEntries.map((s, i) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        cone: otherCones?.[i],
      })),
    [otherStormEntries, otherCones]
  );

  const stormVersion = storm ? `${storm.advisoryNum}-${storm.modelCycle}` : null;
  const stormFileUrl = (path: string) => versionedDataUrl(base, path, stormVersion);
  const coneUrl = storm ? stormFileUrl(storm.files.cone) : null;
  const trackUrl = storm ? stormFileUrl(storm.files.track) : null;
  const historyUrl = storm?.files.history ? stormFileUrl(storm.files.history) : null;
  const wwlinesUrl = storm ? stormFileUrl(storm.files.wwlines) : null;
  const modelsUrl = storm ? stormFileUrl(storm.files.models) : null;
  const intensityUrl = storm ? stormFileUrl(storm.files.intensity) : null;
  const probsUrl = storm ? stormFileUrl(storm.files.probs) : null;
  const textUrl = storm ? stormFileUrl(storm.files.text) : null;
  const windProbUrls = useMemo<Partial<Record<WindThreshold, string>>>(() => {
    if (!storm) return {};
    return {
      ...(storm.files.windprob ? { 39: versionedDataUrl(base, storm.files.windprob, stormVersion) } : {}),
      ...(storm.files.windprob50 ? { 58: versionedDataUrl(base, storm.files.windprob50, stormVersion) } : {}),
      ...(storm.files.windprob64 ? { 74: versionedDataUrl(base, storm.files.windprob64, stormVersion) } : {}),
    };
  }, [base, storm, stormVersion]);
  const windFieldUrl = storm?.files.windfield ? stormFileUrl(storm.files.windfield) : undefined;
  const satellite = storm?.satellite
    ? { ...storm.satellite, url: stormFileUrl(storm.satellite.image) }
    : undefined;
  const radar = storm?.radar
    ? { ...storm.radar, url: stormFileUrl(storm.radar.image) }
    : undefined;
  const outlookGeoUrl = manifest?.mode === "quiet"
    ? versionedDataUrl(base, manifest.outlook.geojson, manifest.outlook.issued)
    : null;
  const outlookTextUrl = manifest?.mode === "quiet"
    ? versionedDataUrl(base, manifest.outlook.text, manifest.outlook.issued)
    : null;

  const { data: cone, error: coneError } = useSWR<GeoJSON.FeatureCollection>(coneUrl, jsonFetcher, VERSIONED_DATA_OPTIONS);
  const { data: track, error: trackError } = useSWR<GeoJSON.FeatureCollection>(trackUrl, jsonFetcher, VERSIONED_DATA_OPTIONS);
  const { data: history, error: historyError } = useSWR<GeoJSON.FeatureCollection>(historyUrl, jsonFetcher, VERSIONED_DATA_OPTIONS);
  const { data: wwlines, error: wwlinesError } = useSWR<GeoJSON.FeatureCollection>(
    wwlinesUrl,
    jsonFetcher,
    VERSIONED_DATA_OPTIONS
  );
  const { data: models, error: modelsError } = useSWR<GeoJSON.FeatureCollection>(
    modelsUrl,
    jsonFetcher,
    VERSIONED_DATA_OPTIONS
  );
  const { data: outlookGeo, error: outlookGeoError } = useSWR<GeoJSON.FeatureCollection>(
    outlookGeoUrl,
    jsonFetcher,
    VERSIONED_DATA_OPTIONS
  );
  const { data: intensity, error: intensityError } = useSWR<IntensitySeries>(
    intensityUrl,
    jsonFetcher,
    VERSIONED_DATA_OPTIONS
  );
  const { data: probs, error: probsError } = useSWR<ProbsEntry[]>(probsUrl, jsonFetcher, VERSIONED_DATA_OPTIONS);
  const { data: textProducts, error: textError } = useSWR<StormTextProducts>(textUrl, jsonFetcher, VERSIONED_DATA_OPTIONS);
  const { data: outlookText, error: outlookTextError } = useSWR<{ issued: string; text: string }>(
    outlookTextUrl,
    jsonFetcher,
    VERSIONED_DATA_OPTIONS
  );

  const status = manifest ? "ready" : manifestError ? "unavailable" : "loading";
  const dataIssues = useMemo(() => {
    const issues: { product: string; message: string }[] = [];
    const addMissing = (product: string, data: unknown, error: unknown) => {
      if (data === undefined && error) issues.push({ product, message: "Temporarily unavailable" });
    };
    addMissing("Forecast cone", cone, coneError);
    addMissing("Forecast track", track, trackError);
    if (historyUrl) addMissing("Observed storm history", history, historyError);
    addMissing("Watches and warnings", wwlines, wwlinesError);
    addMissing("Model guidance", models, modelsError);
    addMissing("Intensity guidance", intensity, intensityError);
    addMissing("Local wind probabilities", probs, probsError);
    addMissing("Forecast discussion", textProducts, textError);
    addMissing("Seven-day outlook map", outlookGeo, outlookGeoError);
    addMissing("Seven-day outlook text", outlookText, outlookTextError);
    for (const issue of manifest?.errors ?? []) {
      if (issue.product !== "aifs") {
        issues.push({ product: issue.product, message: "Latest ingest was incomplete" });
      }
    }
    return issues;
  }, [
    cone, coneError, intensity, intensityError, manifest?.errors, models, modelsError,
    outlookGeo, outlookGeoError, outlookText, outlookTextError, probs, probsError,
    history, historyError, historyUrl, textProducts, textError, track, trackError, wwlines, wwlinesError,
  ]);

  const mode: Mode = manifest?.mode ?? "quiet";
  const stale = computeStale(manifest, mode, demo);

  return {
    status,
    retry: () => void retryManifest(),
    manifest: manifest ?? null,
    mode,
    demo,
    demoParam: demoParam ?? null,
    dataIssues,
    demoTag: demoTag(demoParam ?? null),
    storms: manifest?.storms ?? [],
    storm,
    advisories,
    advisoryIndex,
    selectAdvisoryIndex,
    otherStorms: otherStormsWithCones,
    geo: {
      cone,
      track,
      history,
      wwlines,
      models,
      outlook: outlookGeo,
      windFieldUrl,
      windProbUrls,
      satellite,
      radar,
    },
    intensity: intensity ?? null,
    outlookText: outlookText ?? null,
    probs: probs ?? null,
    textProducts: textProducts ?? null,
    stale,
  };
}

/** Select one replay frame while retaining the parent storm's frame list. */
export function selectAdvisory(
  storm: StormEntry | null,
  advisoryNum?: string | null
): StormEntry | null {
  if (!storm) return null;
  const frames = storm.advisories ?? [];
  if (frames.length === 0) return storm;
  const selected = frames.find((frame) => frame.advisoryNum === advisoryNum) ?? frames[0];
  return { ...selected, advisories: frames };
}

const DashboardContext = createContext<DashboardData | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const dashboard = useDashboardSource();
  return createElement(DashboardContext.Provider, { value: dashboard }, children);
}

export function useDashboard(): DashboardData {
  const dashboard = useContext(DashboardContext);
  if (!dashboard) throw new Error("useDashboard must be used inside DashboardProvider");
  return dashboard;
}
