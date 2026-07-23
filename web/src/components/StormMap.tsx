"use client";

import { useEffect, useRef, useState } from "react";
import { GeoJSONSource, Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import type { FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Mode } from "@/lib/types";
import type { OtherStorm } from "@/lib/useDashboard";
import {
  applyModeColors,
  buildGraticule,
  buildInitialStyle,
  excludeOfficialModel,
  INITIAL_BOUNDS,
  LAYER_IDS,
  mergeFeatureCollections,
  NOLA_LNGLAT,
  outlookAreaLabel,
  outlookColor,
  polygonLabelPoint,
  readModeColors,
  SOURCE_IDS,
  trackPointLabel,
  withColor,
  wwColor,
} from "@/lib/mapStyle";
import { DEFAULT_MODEL_COLOR, MODEL_COLORS } from "@/lib/modelColors";

// maplibre-gl resolves its worker script relative to its own module's
// `import.meta.url` at runtime (see web_worker.ts's defaultWorkerUrl()).
// Turbopack's dev-mode module URLs don't satisfy that function's `/^https?:/`
// check, so it silently falls back to "", which makes `new Worker("")` load
// the *page itself* as the worker script (confirmed via Playwright's 'worker'
// event reporting the page's own URL). That leaves every GeoJSON source's
// worker round-trip (and therefore Map's 'load'/'idle' events) hanging
// forever with no error. Pointing at real static copies of the worker script
// and its shared chunk (web/public/maplibre-gl-worker.mjs +
// maplibre-gl-shared.mjs, copied verbatim from node_modules/maplibre-gl/dist —
// re-copy both if the maplibre-gl version is ever bumped) sidesteps the
// broken auto-resolution; confirmed working in both `next dev` and a
// production `next build && next start`.
setWorkerUrl("/maplibre-gl-worker.mjs");

export interface StormMapProps {
  geo: {
    cone?: GeoJSON.FeatureCollection;
    track?: GeoJSON.FeatureCollection;
    wwlines?: GeoJSON.FeatureCollection;
    models?: GeoJSON.FeatureCollection;
    outlook?: GeoJSON.FeatureCollection;
  };
  mode: Mode;
  visibleModels: Set<string>;
  showRadar: boolean;
  /** Every non-selected manifest storm (B2, final review) — drawn as a cone
   *  in the same styling as the selected storm's, plus a small monospace
   *  name label at its current position. */
  otherStorms: OtherStorm[];
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function modelColor(props: GeoJSON.GeoJsonProperties): string {
  const model = String(props?.model ?? "");
  return MODEL_COLORS[model] ?? DEFAULT_MODEL_COLOR;
}

/** Removes every Marker in the list and empties it, in place. */
function clearMarkers(markers: Marker[]): void {
  for (const m of markers) m.remove();
  markers.length = 0;
}

/**
 * Quiet-mode-only chart furniture — a compass rose + italic map plate,
 * matching docs/superpowers/specs/two-moods-v2-mockup.html's quiet-mode map
 * exactly (its <g transform="translate(838,60)"> compass group and .plate
 * caption). Plain HTML/SVG overlays (not MapLibre layers): they're static
 * decoration, not data-driven, so they don't need a source/layer round-trip.
 */
function CompassRose() {
  return (
    <svg className="gw-compass" viewBox="0 0 60 60" aria-hidden="true">
      <g transform="translate(30,32)" stroke="var(--ink-dim)" fill="none">
        <circle r="22" />
        <path d="M0,-22 L4,-6 L0,0 L-4,-6 Z" fill="var(--ink-dim)" stroke="none" />
        <line x1="0" y1="10" x2="0" y2="22" />
        <line x1="-22" y1="0" x2="-10" y2="0" />
        <line x1="10" y1="0" x2="22" y2="0" />
        <text
          y="-28"
          textAnchor="middle"
          fontFamily="var(--font-serif)"
          fontSize="10"
          fill="var(--ink-dim)"
          stroke="none"
        >
          N
        </text>
      </g>
    </svg>
  );
}

const MAP_PLATE_TEXT = "Gulf of Mexico · Tropical outlook chart · after the household tracking charts of New Orleans";

export default function StormMap({ geo, mode, visibleModels, showRadar, otherStorms }: StormMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);

  const graticuleMarkersRef = useRef<Marker[]>([]);
  const trackMarkersRef = useRef<Marker[]>([]);
  const outlookMarkersRef = useRef<Marker[]>([]);
  const otherStormMarkersRef = useRef<Marker[]>([]);
  const nolaMarkerRef = useRef<Marker | null>(null);

  // --- create the map once; tear it down on unmount (StrictMode-safe: the
  // effect+cleanup pair runs cleanly through a dev double-invoke since the
  // map is fully removed and mapRef cleared before any second invocation). ---
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildInitialStyle(),
      bounds: INITIAL_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
    });
    mapRef.current = map;
    setLoaded(false);

    map.on("load", () => {
      // Graticule labels are static (position + text never change with props),
      // so they're created once here rather than in a props-driven effect.
      const { labels } = buildGraticule();
      const markers = labels.map((l) => {
        const el = document.createElement("div");
        el.className = `gw-map-label gw-graticule-label gw-graticule-${l.axis}`;
        el.textContent = l.text;
        return new Marker({ element: el, anchor: "center" }).setLngLat([l.lon, l.lat]).addTo(map);
      });
      graticuleMarkersRef.current = markers;

      const nolaEl = document.createElement("div");
      nolaEl.className = "gw-nola-marker";
      nolaEl.innerHTML = '<span class="gw-nola-dot"></span><span class="gw-nola-label">New Orleans</span>';
      nolaMarkerRef.current = new Marker({ element: nolaEl, anchor: "left" }).setLngLat(NOLA_LNGLAT).addTo(map);

      setLoaded(true);
    });

    return () => {
      clearMarkers(graticuleMarkersRef.current);
      clearMarkers(trackMarkersRef.current);
      clearMarkers(outlookMarkersRef.current);
      clearMarkers(otherStormMarkersRef.current);
      nolaMarkerRef.current?.remove();
      nolaMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- mode change: re-sync CSS-token-driven paint (native GL layers only;
  // HTML label markers pick up --tokens automatically via CSS cascade). ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    // Defensive: ensure the attribute this reads is actually set to `mode`
    // before we read computed style, regardless of ModeGate's effect timing.
    document.documentElement.setAttribute("data-mode", mode);
    applyModeColors(map);
  }, [mode, loaded]);

  // --- cone ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.cone) as GeoJSONSource | undefined;
    src?.setData(geo.cone ?? EMPTY_FC);
  }, [geo.cone, loaded]);

  // --- other (non-selected) storms: cones (same styling as the selected
  // storm's) + a small monospace name label at each one's current position
  // (B2, final review — "v1: show all cones, detail for strongest Gulf
  // threat"). ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.otherCones) as GeoJSONSource | undefined;
    src?.setData(mergeFeatureCollections(otherStorms.map((s) => s.cone)));

    clearMarkers(otherStormMarkersRef.current);
    otherStormMarkersRef.current = otherStorms.map((s) => {
      const el = document.createElement("div");
      el.className = "gw-map-label gw-storm-label";
      el.textContent = s.name;
      return new Marker({ element: el, anchor: "left", offset: [8, 0] }).setLngLat([s.lon, s.lat]).addTo(map);
    });
  }, [otherStorms, loaded]);

  // --- track (line + points via GL layers, labels via HTML markers) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.track) as GeoJSONSource | undefined;
    src?.setData(geo.track ?? EMPTY_FC);

    clearMarkers(trackMarkersRef.current);
    const points = (geo.track?.features ?? []).filter((f) => f.geometry.type === "Point");
    trackMarkersRef.current = points.map((f) => {
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const el = document.createElement("div");
      el.className = "gw-map-label gw-track-label";
      el.textContent = trackPointLabel(f.properties);
      return new Marker({ element: el, anchor: "left", offset: [10, -10] }).setLngLat([lon, lat]).addTo(map);
    });
  }, [geo.track, loaded]);

  // --- watch/warning lines (fixed colors, independent of mode) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.wwlines) as GeoJSONSource | undefined;
    src?.setData(withColor(geo.wwlines, (props) => wwColor(props?.TCWW as string | undefined)));
  }, [geo.wwlines, loaded]);

  // --- outlook genesis areas (mode-aware fill/line color + probability labels) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const colors = readModeColors();
    const src = map.getSource(SOURCE_IDS.outlook) as GeoJSONSource | undefined;
    src?.setData(withColor(geo.outlook, (props) => outlookColor(props?.RISK7DAY as string | undefined, colors)));

    clearMarkers(outlookMarkersRef.current);
    outlookMarkersRef.current = (geo.outlook?.features ?? [])
      .map((f) => {
        const center = polygonLabelPoint(f.geometry);
        const text = outlookAreaLabel(f.properties);
        if (!center || !text) return null;
        const el = document.createElement("div");
        el.className = "gw-map-label gw-outlook-label";
        el.style.color = outlookColor(f.properties?.RISK7DAY as string | undefined, colors);
        el.textContent = text;
        return new Marker({ element: el, anchor: "center" }).setLngLat(center).addTo(map);
      })
      .filter((m): m is Marker => m !== null);
  }, [geo.outlook, mode, loaded]);

  // --- model spaghetti: recolor + filter by kind (solid/dashed split) and visibleModels ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.models) as GeoJSONSource | undefined;
    src?.setData(withColor(excludeOfficialModel(geo.models), modelColor));

    const modelList = Array.from(visibleModels);
    const inVisible: FilterSpecification = ["in", ["get", "model"], ["literal", modelList]];
    map.setFilter(LAYER_IDS.modelsSolid, ["all", ["!=", ["get", "kind"], "ai"], inVisible]);
    map.setFilter(LAYER_IDS.modelsDashed, ["all", ["==", ["get", "kind"], "ai"], inVisible]);
  }, [geo.models, visibleModels, loaded]);

  // --- radar toggle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setLayoutProperty(LAYER_IDS.radar, "visibility", showRadar ? "visible" : "none");
  }, [showRadar, loaded]);

  return (
    <>
      <div ref={containerRef} className="gw-map" />
      {mode === "quiet" && (
        <>
          <CompassRose />
          <div className="plate">{MAP_PLATE_TEXT}</div>
        </>
      )}
    </>
  );
}
