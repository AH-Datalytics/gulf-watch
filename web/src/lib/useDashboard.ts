"use client";

import useSWR from "swr";
import { useMemo, useSyncExternalStore } from "react";
import { BLOB_BASE, STALE_HOURS } from "./config";
import type { Manifest, StormEntry, IntensitySeries, Mode, ProbsEntry, StormTextProducts } from "./types";

const DEMO_BASE = "/demo";

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
function useDemoParam(): string | null {
  return useSyncExternalStore(
    () => () => {}, // never re-subscribes; query string can't change without reload
    () => new URLSearchParams(window.location.search).get("demo"), // client snapshot
    () => null // server snapshot
  );
}

const jsonFetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

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
  return "HISTORICAL SAMPLE — HURRICANE IDA · AUG 27 2021";
}

/** Strongest inGulfBox storm, else strongest storm overall, else null. */
export function selectStorm(storms: StormEntry[]): StormEntry | null {
  if (storms.length === 0) return null;
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
  manifest: Manifest | null;
  mode: Mode;
  demo: boolean;
  /** Map-corner tag text when `demo` is true (e.g. "SIMULATED STORM — DEMO DATA"
   *  or, for `?demo=bertha`, "ARCHIVED DATA — TS BERTHA · ADV 016 · JUL 23 2026");
   *  null otherwise. See {@link demoTag}. */
  demoTag: string | null;
  storm: StormEntry | null;
  /** Every OTHER manifest storm (v1: "show all cones, detail for strongest
   *  Gulf threat") — see {@link otherStorms}. */
  otherStorms: OtherStorm[];
  geo: {
    cone?: GeoJSON.FeatureCollection;
    track?: GeoJSON.FeatureCollection;
    wwlines?: GeoJSON.FeatureCollection;
    models?: GeoJSON.FeatureCollection;
    outlook?: GeoJSON.FeatureCollection;
    /** Real NHC wind-speed-probability shapefile (34kt threshold), when the
     *  selected storm's manifest entry carries `files.windprob` — see
     *  types.ts. undefined for storms without it (most, today). */
    windProb?: GeoJSON.FeatureCollection;
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

export function useDashboard(): DashboardData {
  const demoParam = useDemoParam();
  const demo = demoParam !== null;
  const base = demo ? DEMO_BASE : BLOB_BASE;

  const { data: manifest } = useSWR<Manifest>(
    manifestUrl(demoParam),
    jsonFetcher
  );

  const storm = useMemo(() => selectStorm(manifest?.storms ?? []), [manifest]);

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
    () => otherStormEntries.map((s) => `${base}/${s.files.cone}`),
    [otherStormEntries, base]
  );
  // One combined SWR fetch (Promise.all over the URL list) rather than one
  // useSWR call per storm: the storm count varies run to run, and calling a
  // hook a variable number of times per render would break the rules of
  // hooks.
  const { data: otherCones } = useSWR<GeoJSON.FeatureCollection[]>(
    otherConeUrls.length > 0 ? otherConeUrls : null,
    (urls: string[]) => Promise.all(urls.map((u) => jsonFetcher<GeoJSON.FeatureCollection>(u)))
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

  const coneUrl = storm ? `${base}/${storm.files.cone}` : null;
  const trackUrl = storm ? `${base}/${storm.files.track}` : null;
  const wwlinesUrl = storm ? `${base}/${storm.files.wwlines}` : null;
  const modelsUrl = storm ? `${base}/${storm.files.models}` : null;
  const intensityUrl = storm ? `${base}/${storm.files.intensity}` : null;
  const probsUrl = storm ? `${base}/${storm.files.probs}` : null;
  const textUrl = storm ? `${base}/${storm.files.text}` : null;
  const windProbUrl = storm?.files.windprob ? `${base}/${storm.files.windprob}` : null;
  const outlookGeoUrl = manifest ? `${base}/${manifest.outlook.geojson}` : null;
  const outlookTextUrl = manifest ? `${base}/${manifest.outlook.text}` : null;

  const { data: cone } = useSWR<GeoJSON.FeatureCollection>(coneUrl, jsonFetcher);
  const { data: track } = useSWR<GeoJSON.FeatureCollection>(trackUrl, jsonFetcher);
  const { data: wwlines } = useSWR<GeoJSON.FeatureCollection>(
    wwlinesUrl,
    jsonFetcher
  );
  const { data: models } = useSWR<GeoJSON.FeatureCollection>(
    modelsUrl,
    jsonFetcher
  );
  const { data: outlookGeo } = useSWR<GeoJSON.FeatureCollection>(
    outlookGeoUrl,
    jsonFetcher
  );
  const { data: intensity } = useSWR<IntensitySeries>(
    intensityUrl,
    jsonFetcher
  );
  const { data: probs } = useSWR<ProbsEntry[]>(probsUrl, jsonFetcher);
  const { data: textProducts } = useSWR<StormTextProducts>(textUrl, jsonFetcher);
  const { data: windProb } = useSWR<GeoJSON.FeatureCollection>(windProbUrl, jsonFetcher);
  const { data: outlookText } = useSWR<{ issued: string; text: string }>(
    outlookTextUrl,
    jsonFetcher
  );

  const mode: Mode = manifest?.mode ?? "quiet";
  const stale = computeStale(manifest, mode, demo);

  return {
    manifest: manifest ?? null,
    mode,
    demo,
    demoTag: demoTag(demoParam),
    storm,
    otherStorms: otherStormsWithCones,
    geo: {
      cone,
      track,
      wwlines,
      models,
      outlook: outlookGeo,
      windProb,
    },
    intensity: intensity ?? null,
    outlookText: outlookText ?? null,
    probs: probs ?? null,
    textProducts: textProducts ?? null,
    stale,
  };
}
