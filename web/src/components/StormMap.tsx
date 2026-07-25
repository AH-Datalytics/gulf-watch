"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { GeoJSONSource, ImageSource, Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import type { FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LayerKey, LayerState, WindThreshold } from "@/lib/layers";
import type { Mode, TextProduct } from "@/lib/types";
import type { OtherStorm } from "@/lib/useDashboard";
import { ForecastDiscussion } from "./ForecastDiscussion";
import { LayersControl } from "./LayersControl";
import {
  applyModeColors,
  buildGraticule,
  buildInitialStyle,
  ESRI_ATTRIBUTION,
  excludeOfficialModel,
  INITIAL_BOUNDS,
  LAYER_IDS,
  mergeFeatureCollections,
  NOLA_LNGLAT,
  outlookAreaLabel,
  outlookColor,
  polygonLabelPoint,
  readModeColors,
  resolveGroup,
  SOURCE_IDS,
  stormSymbolKind,
  trackPointLabel,
  windProbColor,
  withColor,
  wwColor,
} from "@/lib/mapStyle";
import { DEFAULT_MODEL_COLOR, ENSEMBLE_COLOR, MODEL_COLORS } from "@/lib/modelColors";
import { cdtDateTime } from "@/lib/format";

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
    history?: GeoJSON.FeatureCollection;
    wwlines?: GeoJSON.FeatureCollection;
    models?: GeoJSON.FeatureCollection;
    outlook?: GeoJSON.FeatureCollection;
    /** NHC analyzed 34/50/64 kt wind radii at advisory time. */
    windFieldUrl?: string;
    /** Real NHC wind-speed-probability shapefile (34kt threshold) — see
     *  types.ts's StormEntry.files.windprob; undefined for storms without
     *  one (most, today — only the Ida historical sample carries it). */
    windProbUrls: Partial<Record<WindThreshold, string>>;
    satellite?: {
      url: string;
      issued: string;
      sourceLabel: string;
      sourceUrl: string;
      bounds: [[number, number], [number, number]];
    };
  };
  mode: Mode;
  visibleModels: Set<string>;
  onVisibleModelsChange: (next: Set<string>) => void;
  modelCycleLabel?: string;
  /** Unified map-layers control state (v2 addendum Round 2) — lifted to
   *  page.tsx; the LayersControl panel rendered here is a controlled/
   *  presentational component only (see lib/layers.ts). Replaces the old
   *  standalone floating RADAR button. */
  layers: LayerState;
  onLayersToggle: (key: LayerKey) => void;
  windThreshold: WindThreshold;
  onWindThresholdChange: (threshold: WindThreshold) => void;
  /** Whether the intensity panel actually has anything to show right now
   *  (active mode, a selected storm, intensity data loaded) — forwarded to
   *  LayersControl so the Graphs checkbox disables rather than lying about
   *  what toggling it will do. */
  hasGraphs: boolean;
  /** Full NHC outlook prose in quiet mode. Used only to surface the explicit
   * no-formation status on the map when that statement is present. */
  outlookText?: string;
  /** Every non-selected manifest storm (B2, final review) — drawn as a cone
   *  in the same styling as the selected storm's, plus a small monospace
   *  name label at its current position. */
  otherStorms: OtherStorm[];
  discussion: TextProduct | null;
  discussionOpen: boolean;
  onDiscussionOpenChange: (open: boolean) => void;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const VERSIONED_DATA_OPTIONS = {
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
};
const WIND_THRESHOLDS: WindThreshold[] = [39, 58, 74];

async function geoJsonFetcher(url: string): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch wind probability: ${response.status}`);
  return response.json() as Promise<GeoJSON.FeatureCollection>;
}

async function imageObjectUrlFetcher(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch satellite imagery: ${response.status}`);
  return URL.createObjectURL(await response.blob());
}

function modelColor(props: GeoJSON.GeoJsonProperties): string {
  // Every GEFS/ECMWF ensemble member shares one flat, faint color by design
  // (see modelColors.ts's ENSEMBLE_COLOR comment) rather than an individual
  // per-code color — there can be 60+ of them.
  if (resolveGroup(props) === "ensemble") return ENSEMBLE_COLOR;
  const model = String(props?.model ?? "");
  return MODEL_COLORS[model] ?? DEFAULT_MODEL_COLOR;
}

/** Removes every Marker in the list and empties it, in place. */
function clearMarkers(markers: Marker[]): void {
  for (const m of markers) m.remove();
  markers.length = 0;
}

/**
 * A small north-arrow compass rose — a standard real-map convention (not
 * decoration unique to any one content mode), rendered in both quiet and
 * active modes now that the basemap is real satellite imagery. Plain
 * HTML/SVG overlay (not a MapLibre layer): it's static, not data-driven, so
 * it doesn't need a source/layer round-trip. White strokes + a drop-shadow
 * filter (see globals.css's .gw-compass) keep it legible over imagery of
 * any brightness.
 */
function CompassRose() {
  return (
    <svg className="gw-compass" viewBox="0 0 60 60" aria-hidden="true">
      <g transform="translate(30,32)" stroke="#fff" fill="none">
        <circle r="20" strokeWidth="1.5" />
        <path d="M0,-20 L3.5,-6 L0,0 L-3.5,-6 Z" fill="#fff" stroke="none" />
        <text y="-26" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10" fill="#fff" stroke="none">
          N
        </text>
      </g>
    </svg>
  );
}

export default function StormMap({
  geo,
  mode,
  visibleModels,
  onVisibleModelsChange,
  modelCycleLabel,
  layers,
  onLayersToggle,
  windThreshold,
  onWindThresholdChange,
  hasGraphs,
  outlookText,
  otherStorms,
  discussion,
  discussionOpen,
  onDiscussionOpenChange,
}: StormMapProps) {
  const { data: windField, error: windFieldError } = useSWR<GeoJSON.FeatureCollection>(
    layers.windField ? geo.windFieldUrl ?? null : null,
    geoJsonFetcher,
    VERSIONED_DATA_OPTIONS
  );
  const selectedWindProbUrl = geo.windProbUrls[windThreshold] ?? null;
  const { data: windProb, error: windProbError } = useSWR<GeoJSON.FeatureCollection>(
    layers.windProb ? selectedWindProbUrl : null,
    geoJsonFetcher,
    VERSIONED_DATA_OPTIONS
  );
  const { data: satelliteObjectUrl } = useSWR<string>(
    layers.satellite ? geo.satellite?.url ?? null : null,
    imageObjectUrlFetcher,
    VERSIONED_DATA_OPTIONS
  );
  const availableWindThresholds = WIND_THRESHOLDS.filter((threshold) => Boolean(geo.windProbUrls[threshold]));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const noFormationExpected =
    mode === "quiet" &&
    outlookText?.toLowerCase().includes(
      "tropical cyclone formation is not expected during the next 7 days"
    );

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
    const markers: Marker[] = [];
    for (const f of points) {
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const tau = Number(f.properties?.TAU ?? f.properties?.tauH ?? f.properties?.tau);
      const isCurrent = tau === 0;
      if (isCurrent && !layers.satellite && !layers.windField) {
        const icon = document.createElement("div");
        const symbol = stormSymbolKind(f.properties);
        icon.className = `gw-current-storm-icon gw-storm-symbol-${symbol}`;
        icon.setAttribute("aria-label", `${trackPointLabel(f.properties)} current position`);
        icon.setAttribute("role", "img");
        markers.push(
          new Marker({ element: icon, anchor: "center" }).setLngLat([lon, lat]).addTo(map)
        );
      }
      const el = document.createElement("div");
      el.className = "gw-map-label gw-track-label";
      el.textContent = trackPointLabel(f.properties);
      markers.push(
        new Marker({
          element: el,
          anchor: "left",
          offset: isCurrent ? [20, -13] : [10, -10],
        }).setLngLat([lon, lat]).addTo(map)
      );
    }
    trackMarkersRef.current = markers;
  }, [geo.track, layers.satellite, layers.windField, loaded]);

  // --- observed storm history, kept separate from the official forecast ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.history) as GeoJSONSource | undefined;
    src?.setData(geo.history ?? EMPTY_FC);
  }, [geo.history, loaded]);

  // --- archived, time-matched GOES image reprojected to Web Mercator ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (!layers.satellite || !geo.satellite || !satelliteObjectUrl) {
      map.setLayoutProperty(LAYER_IDS.satellite, "visibility", "none");
      return;
    }

    // ImageSource defers loading while its only layer is hidden. Make the
    // layer visible before swapping the placeholder so the archived image
    // starts downloading immediately when the user enables it.
    map.setLayoutProperty(LAYER_IDS.satellite, "visibility", "visible");
    const [[west, south], [east, north]] = geo.satellite.bounds;
    const src = map.getSource(SOURCE_IDS.satellite) as ImageSource | undefined;
    src?.updateImage({
      url: satelliteObjectUrl,
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    });
  }, [geo.satellite, layers.satellite, loaded, satelliteObjectUrl]);

  // --- watch/warning lines (fixed colors, independent of mode) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.wwlines) as GeoJSONSource | undefined;
    src?.setData(withColor(geo.wwlines, (props) => wwColor(props?.TCWW as string | undefined)));
  }, [geo.wwlines, loaded]);

  // --- current analyzed wind field (NHC initial 34/50/64 kt radii) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.windField) as GeoJSONSource | undefined;
    src?.setData(windField ?? { type: "FeatureCollection", features: [] });
  }, [windField, loaded]);

  // --- wind-probability shaded field (Round 2, v2 addendum) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(SOURCE_IDS.windProb) as GeoJSONSource | undefined;
    src?.setData(withColor(windProb, (props) => windProbColor(props?.PERCENTAGE as string | undefined)));
  }, [windProb, loaded]);

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
    map.setFilter(LAYER_IDS.modelsEnsemble, ["all", ["==", ["get", "kind"], "ensemble"], inVisible]);
    map.setFilter(
      LAYER_IDS.modelsSolid,
      ["all", ["!=", ["get", "kind"], "ai"], ["!=", ["get", "kind"], "ensemble"], inVisible]
    );
    map.setFilter(LAYER_IDS.modelsDashed, ["all", ["==", ["get", "kind"], "ai"], inVisible]);
  }, [geo.models, visibleModels, loaded]);

  // --- unified layers control: cone / model-tracks master on-off / radar
  // (Round 2, v2 addendum) — each just toggles GL layer visibility; the
  // underlying source data and, for models, the visibleModels filter above
  // are untouched, so re-enabling a layer restores exactly what was there
  // before (no state is lost by hiding a layer). ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const coneVis = layers.cone ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.coneFill, "visibility", coneVis);
    map.setLayoutProperty(LAYER_IDS.coneLineCasing, "visibility", coneVis);
    map.setLayoutProperty(LAYER_IDS.coneLine, "visibility", coneVis);
  }, [layers.cone, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const visibility = layers.history && geo.history ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.historyLineCasing, "visibility", visibility);
    map.setLayoutProperty(LAYER_IDS.historyLine, "visibility", visibility);
    map.setLayoutProperty(LAYER_IDS.historyPoints, "visibility", visibility);
  }, [geo.history, layers.history, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const modelsVis = layers.models ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.modelsEnsemble, "visibility", modelsVis);
    map.setLayoutProperty(LAYER_IDS.modelsSolid, "visibility", modelsVis);
    map.setLayoutProperty(LAYER_IDS.modelsDashed, "visibility", modelsVis);
  }, [layers.models, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setLayoutProperty(LAYER_IDS.radar, "visibility", layers.radar ? "visible" : "none");
  }, [layers.radar, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const windFieldVis = layers.windField ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.windFieldFill, "visibility", windFieldVis);
  }, [layers.windField, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const windProbVis = layers.windProb ? "visible" : "none";
    map.setLayoutProperty(LAYER_IDS.windProbFill, "visibility", windProbVis);
    map.setLayoutProperty(LAYER_IDS.windProbLine, "visibility", windProbVis);
  }, [layers.windProb, loaded]);

  return (
    <div className="gw-map-frame">
      <div ref={containerRef} className="gw-map" />
      <CompassRose />
      {noFormationExpected && (
        <div className="quiet-map-status" role="status">
          <small>Seven-day outlook</small>
          <b>No tropical cyclone formation expected</b>
          <span>The National Hurricane Center does not expect tropical cyclone development during the next seven days.</span>
        </div>
      )}
      {discussionOpen && discussion && (
        <ForecastDiscussion discussion={discussion} onClose={() => onDiscussionOpenChange(false)} />
      )}
      <div className="map-attribution">{ESRI_ATTRIBUTION}</div>
      {layers.satellite && geo.satellite && (
        <a
          className="satellite-attribution"
          href={geo.satellite.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          GOES-16 · {cdtDateTime(geo.satellite.issued)} · {geo.satellite.sourceLabel}
        </a>
      )}
      <div className="map-controls">
        <LayersControl
          layers={layers}
          onToggle={onLayersToggle}
          hasGraphs={hasGraphs}
          hasHistory={Boolean(geo.history)}
          hasSatellite={Boolean(geo.satellite)}
          satelliteLabel={geo.satellite ? cdtDateTime(geo.satellite.issued) : undefined}
          hasWindField={Boolean(geo.windFieldUrl)}
          windFieldLoading={layers.windField && Boolean(geo.windFieldUrl) && !windField && !windFieldError}
          windFieldError={Boolean(windFieldError)}
          hasDiscussion={Boolean(discussion)}
          discussionOpen={discussionOpen}
          onDiscussionToggle={() => onDiscussionOpenChange(!discussionOpen)}
          availableWindThresholds={availableWindThresholds}
          windThreshold={windThreshold}
          onWindThresholdChange={onWindThresholdChange}
          visibleModels={visibleModels}
          onVisibleModelsChange={onVisibleModelsChange}
          models={mode === "active" ? geo.models : null}
          cycleLabel={modelCycleLabel}
          windProbLoading={layers.windProb && Boolean(selectedWindProbUrl) && !windProb && !windProbError}
          windProbError={Boolean(windProbError)}
        />
      </div>
    </div>
  );
}
