"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { BLOB_BASE, STALE_HOURS } from "./config";
import type { Manifest, StormEntry, IntensitySeries, Mode } from "./types";

const DEMO_BASE = "/demo";

// Design note: we read the `?demo=` flag via window.location.search in a
// client effect rather than next/navigation's useSearchParams. useSearchParams
// is a Client Component hook that requires a <Suspense> boundary around
// anything that calls it (Next 16 App Router) to avoid a full-route CSR
// bailout on prerendered routes.
//
// A synchronous `typeof window !== "undefined" ? window.location.search : ""`
// read during render is NOT safe here even though it looks SSR-guarded: React
// hydration requires the client's *first* render to match the server's HTML
// exactly, and window IS already defined during that first client render (it
// only differs from the server env, not across the client's own
// pre-mount/post-mount renders) — so demo would read `false` on the server
// and `true` on the client in the very same hydration pass, which is exactly
// the mismatch React's hydration check exists to catch (confirmed via a
// Playwright hydration-error repro against ?demo=1 while building this).
// Deferring the read into useEffect means the first client render (during
// hydration) still sees demo=null, matching the server; the effect then
// corrects it a tick later, which React tolerates as a normal post-mount
// update. Trade-off: on ?demo=1/?demo=quiet there's a brief instant where
// this fetches the live manifest before correcting to the demo fixture.
function useDemoParam(): string | null {
  const [demo, setDemo] = useState<string | null>(null);
  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).get("demo"));
  }, []);
  return demo;
}

const jsonFetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

function manifestUrl(demoParam: string | null): string {
  if (demoParam === "quiet") return `${DEMO_BASE}/manifest-quiet.json`;
  if (demoParam !== null) return `${DEMO_BASE}/manifest.json`;
  return `${BLOB_BASE}/manifest.json`;
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
