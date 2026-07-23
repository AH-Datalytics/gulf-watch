"use client";

import useSWR from "swr";
import { useMemo, useSyncExternalStore } from "react";
import { BLOB_BASE, STALE_HOURS } from "./config";
import type { Manifest, StormEntry, IntensitySeries, Mode } from "./types";

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
 * captured advisory-016 snapshot (web/public/demo/bertha/manifest.json) whose
 * `storms[0].files` values are pre-rewritten to `bertha/<name>.geojson`
 * (relative to `DEMO_BASE`, exactly like the Solene fixtures' flat
 * `<name>.geojson` values in web/public/demo/manifest.json) — so no base-URL
 * branching is needed elsewhere: `base` in {@link useDashboard} stays
 * `DEMO_BASE` for every demo variant, and the manifest's own `files` map does
 * all the path resolution.
 */
export function manifestUrl(demoParam: string | null): string {
  if (demoParam === "quiet") return `${DEMO_BASE}/manifest-quiet.json`;
  if (demoParam === "bertha") return `${DEMO_BASE}/bertha/manifest.json`;
  if (demoParam !== null) return `${DEMO_BASE}/manifest.json`;
  return `${BLOB_BASE}/manifest.json`;
}

/**
 * Map-corner demo tag text for a given `?demo=` value — `null` when not in
 * demo mode at all. `demo=bertha` is a real archived advisory (not a
 * fictional mockup storm), so its tag reads "ARCHIVED DATA" rather than
 * "SIMULATED"; every other demo variant (`1`, `quiet`, or any other value)
 * keeps the original simulated-storm wording unchanged.
 */
export function demoTag(demoParam: string | null): string | null {
  if (demoParam === null) return null;
  if (demoParam === "bertha") return "ARCHIVED DATA — TS BERTHA · ADV 016 · JUL 23 2026";
  return "SIMULATED STORM — DEMO DATA";
}

/** Strongest inGulfBox storm, else strongest storm overall, else null. */
function selectStorm(storms: StormEntry[]): StormEntry | null {
  if (storms.length === 0) return null;
  const inGulf = storms.filter((s) => s.inGulfBox);
  const pool = inGulf.length > 0 ? inGulf : storms;
  return pool.reduce((strongest, s) =>
    s.intensityMph > strongest.intensityMph ? s : strongest
  );
}

function computeStale(manifest: Manifest | undefined, mode: Mode): boolean {
  if (!manifest) return false;
  const thresholdHours = mode === "active" ? STALE_HOURS.active : STALE_HOURS.quiet;
  const ageMs = Date.now() - new Date(manifest.generated).getTime();
  return ageMs > thresholdHours * 3600 * 1000;
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
  geo: {
    cone?: GeoJSON.FeatureCollection;
    track?: GeoJSON.FeatureCollection;
    wwlines?: GeoJSON.FeatureCollection;
    models?: GeoJSON.FeatureCollection;
    outlook?: GeoJSON.FeatureCollection;
  };
  intensity: IntensitySeries | null;
  outlookText: { issued: string; text: string } | null;
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

  const coneUrl = storm ? `${base}/${storm.files.cone}` : null;
  const trackUrl = storm ? `${base}/${storm.files.track}` : null;
  const wwlinesUrl = storm ? `${base}/${storm.files.wwlines}` : null;
  const modelsUrl = storm ? `${base}/${storm.files.models}` : null;
  const intensityUrl = storm ? `${base}/${storm.files.intensity}` : null;
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
  const { data: outlookText } = useSWR<{ issued: string; text: string }>(
    outlookTextUrl,
    jsonFetcher
  );

  const mode: Mode = manifest?.mode ?? "quiet";
  const stale = computeStale(manifest, mode);

  return {
    manifest: manifest ?? null,
    mode,
    demo,
    demoTag: demoTag(demoParam),
    storm,
    geo: {
      cone,
      track,
      wwlines,
      models,
      outlook: outlookGeo,
    },
    intensity: intensity ?? null,
    outlookText: outlookText ?? null,
    stale,
  };
}
