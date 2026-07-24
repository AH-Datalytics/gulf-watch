// Self-contained MapLibre cartography for The Gulf Watch — v2 uses a real
// satellite basemap (Esri World Imagery raster tiles + an Esri reference-label
// overlay) instead of the old flat land/water polygon fill, per
// docs/superpowers/specs/2026-07-24-v2-redesign-addendum.md. The graticule is
// still generated in-code (no dependency on any land geometry). All colors
// for the layers below come from the CSS design tokens in globals.css (read
// via getComputedStyle, one light theme only now — no more per-mode
// branching) — EXCEPT the watch/warning line colors, which per the task
// brief are four fixed hex values.

import type { StyleSpecification, Map as MapLibreMap } from "maplibre-gl";

/** New Orleans marker location (fixed point of reference on both maps). */
export const NOLA_LNGLAT: [number, number] = [-90.07, 29.95];

/** Initial map bounds, per the task brief: lon -98..-80, lat 18..31. */
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [-98, 18],
  [-80, 31],
];

// Esri World Imagery (satellite/terrain) + reference labels overlay, per the
// v2 addendum. Attribution is rendered manually (StormMap.tsx's
// .map-attribution overlay) since the map itself has attributionControl:
// false.
export const ESRI_IMAGERY_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_LABELS_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
export const ESRI_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics";

// ---------------------------------------------------------------------------
// Design tokens (single light theme)
// ---------------------------------------------------------------------------

export interface ModeColors {
  grid: string;
  gridLabel: string;
  accent: string;
  accent2: string;
  warnHw: string;
  warnSsw: string;
  warnTsw: string;
  outlookLow: string;
  outlookHigh: string;
}

const FALLBACK_COLORS: ModeColors = {
  grid: "rgba(255, 255, 255, 0.45)",
  gridLabel: "rgba(255, 255, 255, 0.92)",
  accent: "#1f3a5f",
  accent2: "#c2703d",
  warnHw: "#c0392b",
  warnSsw: "#8e44ad",
  warnTsw: "#2f6fae",
  outlookLow: "#d97b29",
  outlookHigh: "#b3402e",
};

/** Reads the current --token values off <html> (server/non-DOM callers get the fallback). */
export function readModeColors(): ModeColors {
  if (typeof document === "undefined") return FALLBACK_COLORS;
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    grid: read("--grid", FALLBACK_COLORS.grid),
    gridLabel: read("--grid-label", FALLBACK_COLORS.gridLabel),
    accent: read("--accent", FALLBACK_COLORS.accent),
    accent2: read("--accent-2", FALLBACK_COLORS.accent2),
    warnHw: read("--warn-hw", FALLBACK_COLORS.warnHw),
    warnSsw: read("--warn-ssw", FALLBACK_COLORS.warnSsw),
    warnTsw: read("--warn-tsw", FALLBACK_COLORS.warnTsw),
    outlookLow: read("--outlook-low", FALLBACK_COLORS.outlookLow),
    outlookHigh: read("--outlook-high", FALLBACK_COLORS.outlookHigh),
  };
}

// ---------------------------------------------------------------------------
// Watch/warning line colors — fixed per the task brief, independent of mode.
// ---------------------------------------------------------------------------

export const WW_COLORS = {
  hurricaneWarning: "#d94141",
  hurricaneWatch: "#e8a1a1",
  tsWarning: "#4a7fd4",
  tsWatch: "#9dbdf0",
  surge: "#b04fd6",
} as const;

/**
 * Classifies a wwlines feature's TCWW code into a line color.
 *
 * Real NHC wwlin data uses 3-letter codes (confirmed against a live fetch of
 * storms/al022026/wwlines.geojson and ingest/tests/test_shp.py): HWR/HWA =
 * Hurricane Warning/Watch, TWR/TWA = Tropical Storm Warning/Watch. The demo
 * fixture (web/public/demo/wwlines.geojson) instead uses short codes "HU",
 * "SS", "TR" with no explicit watch/warning letter. Both are handled by the
 * same starts-with/ends-with heuristic: codes starting "S" are storm surge;
 * "H..." is hurricane-tier; anything else is treated as tropical-storm-tier;
 * a code ending "A" (...Watch) gets the paler shade, everything else
 * (ending "R"/"U"/other) is treated as the warning-tier color.
 */
export function wwColor(tcww: string | undefined | null): string {
  const code = (tcww ?? "").toUpperCase();
  if (code.startsWith("S")) return WW_COLORS.surge;
  const isWatch = code.endsWith("A");
  if (code.startsWith("H")) return isWatch ? WW_COLORS.hurricaneWatch : WW_COLORS.hurricaneWarning;
  return isWatch ? WW_COLORS.tsWatch : WW_COLORS.tsWarning;
}

/**
 * Outlook genesis-area fill color from NHC gtwo RISK7DAY, mode-aware (matches
 * the quiet mockup's orange/red hatch exactly). Uses the dedicated
 * --outlook-low/--outlook-high tokens, NOT --warn-ssw/--warn-hw: those are
 * watch/warning severity colors (Alerts.tsx), a different semantic axis that
 * happens to share quiet-mode hex values but diverges in active mode
 * (--warn-ssw is storm-surge purple there) — reusing them previously made a
 * low-risk genesis area render in storm-surge purple. "low" -> outlookLow;
 * "medium" and "high" both -> outlookHigh (the mockup renders its 60%/medium
 * area in the same red as its notional "high").
 */
export function outlookColor(risk7day: string | undefined | null, colors: ModeColors): string {
  return (risk7day ?? "").toLowerCase() === "low" ? colors.outlookLow : colors.outlookHigh;
}

/** Injects a `_color` property into each feature via `colorFor`, for data-driven paint (`["get","_color"]`). */
export function withColor<T extends GeoJSON.FeatureCollection>(
  fc: T | undefined | null,
  colorFor: (props: GeoJSON.GeoJsonProperties) => string
): GeoJSON.FeatureCollection {
  if (!fc) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, _color: colorFor(f.properties) },
    })),
  };
}

/**
 * Strips `kind === "official"` features from a models FeatureCollection
 * before it's drawn as spaghetti. The official NHC track already has its own
 * always-on white 2.2px line + circle points, drawn from track.geojson (see
 * LAYER_IDS.trackLine/trackPoints) — plotting OFCL a second time as
 * toggleable spaghetti would duplicate that line and, worse, make the
 * official track vanish entirely if a user happened to uncheck OFCL. OFCL is
 * therefore not toggleable at all: it's removed from the spaghetti data here,
 * before visibleModels filtering ever runs.
 */
export function excludeOfficialModel(
  fc: GeoJSON.FeatureCollection | undefined | null
): GeoJSON.FeatureCollection {
  if (!fc) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: fc.features.filter((f) => f.properties?.kind !== "official"),
  };
}

/** The four legend/layer-control groups a model track can belong to. */
export type ModelGroup = "official" | "deterministic" | "consensus" | "ensemble";

/**
 * Resolves a models.geojson feature's legend/layer-control group.
 *
 * Round 2 (v2 addendum) added an explicit `group` property to
 * models.geojson features (see ingest/gulfwatch/adeck.py) so the frontend
 * doesn't have to re-derive deterministic/consensus/ensemble from `kind`
 * alone. Older committed fixtures (bertha, the live production blob store
 * until its next ingest redeploy) predate that property, so this function
 * falls back to a kind-based default when `group` is absent — the
 * "backward compatible" contract the addendum requires: kind "official" ->
 * group "official", kind "consensus" -> group "consensus", anything else
 * (kind "physics" or "ai") -> group "deterministic". A real "ensemble"
 * group value only ever comes from the explicit property (no old fixture
 * has ever carried ensemble-member features), never from this fallback.
 */
export function resolveGroup(props: GeoJSON.GeoJsonProperties): ModelGroup {
  const explicit = props?.group;
  if (explicit === "official" || explicit === "deterministic" || explicit === "consensus" || explicit === "ensemble") {
    return explicit;
  }
  const kind = props?.kind;
  if (kind === "official") return "official";
  if (kind === "consensus") return "consensus";
  return "deterministic";
}

/**
 * One row per unique model code present in `models` (models.geojson),
 * excluding group==="official" (OFCL is always drawn as the solid white
 * official track, never a toggleable legend row — see excludeOfficialModel).
 * Used to build the ModelLegend's deterministic/consensus checkbox rows AND
 * to count the ensemble group's member codes — entirely data-driven so the
 * legend adapts to whatever models a given storm/demo actually carries
 * (the historical Ida sample's model set is completely different from a
 * live storm's) rather than a fixed hardcoded whitelist.
 */
export interface ModelRow {
  code: string;
  label: string;
  kind: string;
  group: ModelGroup;
}

export function modelRows(models: GeoJSON.FeatureCollection | null | undefined): ModelRow[] {
  if (!models) return [];
  const seen = new Map<string, ModelRow>();
  for (const f of models.features) {
    const code = String(f.properties?.model ?? "");
    if (!code || seen.has(code)) continue;
    const group = resolveGroup(f.properties);
    if (group === "official") continue;
    seen.set(code, {
      code,
      label: String(f.properties?.label ?? code),
      kind: String(f.properties?.kind ?? ""),
      group,
    });
  }
  return Array.from(seen.values());
}

/** Every non-official model code present in `models` — the natural "all
 *  models on" default for a freshly loaded storm/demo (see page.tsx). */
export function allModelCodes(models: GeoJSON.FeatureCollection | null | undefined): string[] {
  return modelRows(models).map((r) => r.code);
}

/**
 * True iff `models` (models.geojson) actually carries at least one
 * kind==="ai" feature. N9 (final review): ModelLegend.tsx's "AI Guidance"
 * group must only render when there's real AI-model data to toggle — the
 * demo Solene fixture carries AIFS features, but the real live feed and the
 * ?demo=bertha archive replay never do (AIFS is stubbed to always return
 * [], see ingest/gulfwatch/aifs.py), so showing an always-empty group there
 * would be misleading UI.
 */
export function hasAiGuidance(models: GeoJSON.FeatureCollection | null | undefined): boolean {
  if (!models) return false;
  return models.features.some((f) => f.properties?.kind === "ai");
}

/**
 * Merges a list of possibly-undefined FeatureCollections (e.g. one cone per
 * non-selected storm, B2 final review) into a single FeatureCollection for
 * one shared MapLibre source — every other storm's cone renders with the
 * same styling as the selected storm's, so one source/layer pair is enough.
 */
export function mergeFeatureCollections(
  fcs: (GeoJSON.FeatureCollection | undefined | null)[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fcs.flatMap((fc) => fc?.features ?? []),
  };
}

// ---------------------------------------------------------------------------
// Graticule (2-degree lat/lon grid, generated — no basemap tiles involved)
// ---------------------------------------------------------------------------

export interface GraticuleLabel {
  lon: number;
  lat: number;
  text: string;
  axis: "meridian" | "parallel";
}

export interface Graticule {
  lines: GeoJSON.FeatureCollection;
  labels: GraticuleLabel[];
}

// Lines are generated across a wide box (matching the clipped land extent) so
// panning has margin; labels, though, are pinned near the south/west edge of
// the *initial view* (INITIAL_BOUNDS is lon -98..-80 lat 18..31) rather than
// the wider line bbox, so they land inside the default viewport instead of
// off-screen past its edge.
const GRATICULE_BBOX = { lonMin: -100, lonMax: -72, latMin: 15, latMax: 33 };
const GRATICULE_STEP = 2;
const LABEL_LAT_EDGE = 18.4;
const LABEL_LON_EDGE = -97.6;

/** Generates a 2-degree lon/lat grid as GeoJSON LineStrings, plus label points along the south/west edges. */
export function buildGraticule(
  bbox = GRATICULE_BBOX,
  step = GRATICULE_STEP,
  labelLatEdge = LABEL_LAT_EDGE,
  labelLonEdge = LABEL_LON_EDGE
): Graticule {
  const features: GeoJSON.Feature[] = [];
  const labels: GraticuleLabel[] = [];

  const firstLon = Math.ceil(bbox.lonMin / step) * step;
  for (let lon = firstLon; lon <= bbox.lonMax; lon += step) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [lon, bbox.latMin],
          [lon, bbox.latMax],
        ],
      },
    });
    if (lon > bbox.lonMin && lon < bbox.lonMax) {
      labels.push({
        lon,
        lat: labelLatEdge,
        text: `${Math.abs(lon)}°W`,
        axis: "meridian",
      });
    }
  }

  const firstLat = Math.ceil(bbox.latMin / step) * step;
  for (let lat = firstLat; lat <= bbox.latMax; lat += step) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [bbox.lonMin, lat],
          [bbox.lonMax, lat],
        ],
      },
    });
    if (lat > bbox.latMin && lat < bbox.latMax) {
      labels.push({
        lon: labelLonEdge,
        lat,
        text: `${lat}°N`,
        axis: "parallel",
      });
    }
  }

  return { lines: { type: "FeatureCollection", features }, labels };
}

// ---------------------------------------------------------------------------
// Track point labels — real NHC track.geojson pts fields vs. demo fixture
// ---------------------------------------------------------------------------

const CATEGORY_MPH = { C5: 157, C4: 130, C3: 111, C2: 96, C1: 74 };
const KT_TO_MPH = 1.15078;

function categoryFromMph(mph: number): 1 | 2 | 3 | 4 | 5 {
  if (mph >= CATEGORY_MPH.C5) return 5;
  if (mph >= CATEGORY_MPH.C4) return 4;
  if (mph >= CATEGORY_MPH.C3) return 3;
  if (mph >= CATEGORY_MPH.C2) return 2;
  return 1;
}

/**
 * Builds a track point label like "CAT 2 · WED 1PM".
 *
 * Handles two shapes seen in practice:
 * - demo fixture (web/public/demo/track.geojson): `category` ("2"/"1"/"TS")
 *   and `label` ("WED 4A") given directly.
 * - real NHC track.geojson (confirmed via a live fetch of
 *   storms/al022026/track.geojson): no `category`/`label` fields at all —
 *   instead `STORMTYPE` ("TS"/"TD"/"STD"/"HU"), `MAXWIND` in knots, and
 *   `DATELBL` ("4:00 AM Thu"). For STORMTYPE "HU" the category number is
 *   derived from MAXWIND; other STORMTYPEs are shown as-is (TS/TD/STD/SD).
 */
export function trackPointLabel(props: GeoJSON.GeoJsonProperties): string {
  if (!props) return "";
  const dateText = String(props.DATELBL ?? props.label ?? "").trim();

  let classText = "";
  if (props.category != null) {
    const c = String(props.category);
    classText = /^\d+$/.test(c) ? `CAT ${c}` : c;
  } else if (props.STORMTYPE) {
    const stype = String(props.STORMTYPE);
    if (stype === "HU") {
      const kt = Number(props.MAXWIND) || 0;
      classText = `CAT ${categoryFromMph(Math.round(kt * KT_TO_MPH))}`;
    } else {
      classText = stype;
    }
  }

  return [classText, dateText].filter(Boolean).join(" · ");
}

/** Genesis-area label like "60% · 7-DAY" from NHC gtwo outlook properties. */
export function outlookAreaLabel(props: GeoJSON.GeoJsonProperties): string {
  if (!props) return "";
  const pct = props.PROB7DAY ?? "";
  return pct ? `${pct} · 7-DAY` : "";
}

/** Rough centroid (vertex average) of a polygon's exterior ring — fine for label placement. */
export function polygonLabelPoint(geometry: GeoJSON.Geometry): [number, number] | null {
  const ring: GeoJSON.Position[] | undefined =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates[0]?.[0]
        : undefined;
  if (!ring || ring.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  return [lon / ring.length, lat / ring.length];
}

// ---------------------------------------------------------------------------
// Style construction
// ---------------------------------------------------------------------------

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export const RADAR_TILE_URL =
  "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=nexrad-n0q&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true";

export const LAYER_IDS = {
  imagery: "gw-imagery",
  labels: "gw-labels",
  graticule: "gw-graticule",
  outlookFill: "gw-outlook-fill",
  outlookLine: "gw-outlook-line",
  coneFill: "gw-cone-fill",
  coneLineCasing: "gw-cone-line-casing",
  coneLine: "gw-cone-line",
  otherConesFill: "gw-other-cones-fill",
  otherConesLineCasing: "gw-other-cones-line-casing",
  otherConesLine: "gw-other-cones-line",
  wwlines: "gw-wwlines",
  windProbFill: "gw-windprob-fill",
  windProbLine: "gw-windprob-line",
  modelsEnsemble: "gw-models-ensemble",
  modelsSolid: "gw-models-solid",
  modelsDashed: "gw-models-dashed",
  trackLineCasing: "gw-track-line-casing",
  trackLine: "gw-track-line",
  trackPoints: "gw-track-points",
  trackNow: "gw-track-now",
  radar: "gw-radar",
} as const;

export const SOURCE_IDS = {
  imagery: "gw-imagery",
  labels: "gw-labels",
  graticule: "gw-graticule",
  outlook: "gw-outlook",
  cone: "gw-cone",
  otherCones: "gw-other-cones",
  wwlines: "gw-wwlines",
  windProb: "gw-windprob",
  models: "gw-models",
  track: "gw-track",
  radar: "gw-radar",
} as const;

// ---------------------------------------------------------------------------
// Wind-probability shaded layer (Round 2, v2 addendum — replaces an earlier
// point-marker "pill" design, dropped mid-build per user feedback in favor
// of a shaded probability field like NHC's own "wind_probs_34"/
// "most_likely_toa_34" graphics: https://www.nhc.noaa.gov/gis/ archives a
// real per-cycle GIS shapefile for exactly this — a graduated-percentage
// polygon set (11 bands, "<5%".."90%") — which converts through the same
// gulfwatch.shp.zip_to_geojson pure-shapefile tooling as cone/track/ww.
// ---------------------------------------------------------------------------

/** Sequential light-yellow -> deep-purple ramp, one stop per NHC WSP
 *  percentage band (real property values confirmed against the Hurricane
 *  Ida archive's 2021082718_wsp34knt120hr_5km shapefile). */
const WIND_PROB_COLORS: Record<string, string> = {
  "<5%": "#ffe14d",
  "5-10%": "#ffc93d",
  "10-20%": "#ffae33",
  "20-30%": "#ff8f2e",
  "30-40%": "#fa722f",
  "40-50%": "#f0532f",
  "50-60%": "#df3838",
  "60-70%": "#c22350",
  "70-80%": "#9c1e6b",
  "80-90%": "#761c82",
  ">90%": "#4f1a7a",
};

/** Maps a WSP polygon's PERCENTAGE property to its fill color; unrecognized/
 *  missing values fall back to a neutral mid-tone rather than throwing. */
export function windProbColor(percentage: string | undefined | null): string {
  return WIND_PROB_COLORS[percentage ?? ""] ?? "#8a94a3";
}

/** Ordered [label, color] pairs for the wind-probability legend
 *  (LayersControl.tsx) — same 11 bands/colors as windProbColor, just as a
 *  renderable list rather than a lookup map. */
export const WIND_PROB_BANDS: { label: string; color: string }[] = Object.entries(WIND_PROB_COLORS).map(
  ([label, color]) => ({ label, color })
);

/** Builds the initial (empty dynamic-source) MapLibre style. Colors are seeded from
 * whatever mode is current at build time; applyModeColors() re-syncs them on mode change. */
export function buildInitialStyle(): StyleSpecification {
  const c = readModeColors();
  const graticule = buildGraticule();

  return {
    version: 8,
    sources: {
      [SOURCE_IDS.imagery]: {
        type: "raster",
        tiles: [ESRI_IMAGERY_TILE_URL],
        tileSize: 256,
        attribution: ESRI_ATTRIBUTION,
      },
      [SOURCE_IDS.labels]: {
        type: "raster",
        tiles: [ESRI_LABELS_TILE_URL],
        tileSize: 256,
        attribution: ESRI_ATTRIBUTION,
      },
      [SOURCE_IDS.graticule]: { type: "geojson", data: graticule.lines },
      [SOURCE_IDS.outlook]: { type: "geojson", data: EMPTY_FC },
      [SOURCE_IDS.cone]: { type: "geojson", data: EMPTY_FC },
      [SOURCE_IDS.otherCones]: { type: "geojson", data: EMPTY_FC },
      [SOURCE_IDS.wwlines]: { type: "geojson", data: EMPTY_FC },
      [SOURCE_IDS.windProb]: { type: "geojson", data: EMPTY_FC },
      [SOURCE_IDS.models]: { type: "geojson", data: EMPTY_FC },
      [SOURCE_IDS.track]: { type: "geojson", data: EMPTY_FC },
      [SOURCE_IDS.radar]: {
        type: "raster",
        tiles: [RADAR_TILE_URL],
        tileSize: 256,
        attribution: "IEM / NEXRAD",
      },
    },
    layers: [
      {
        id: LAYER_IDS.imagery,
        type: "raster",
        source: SOURCE_IDS.imagery,
      },
      {
        id: LAYER_IDS.labels,
        type: "raster",
        source: SOURCE_IDS.labels,
      },
      {
        id: LAYER_IDS.graticule,
        type: "line",
        source: SOURCE_IDS.graticule,
        paint: { "line-color": c.grid, "line-width": 1 },
      },
      {
        id: LAYER_IDS.outlookFill,
        type: "fill",
        source: SOURCE_IDS.outlook,
        paint: { "fill-color": ["get", "_color"], "fill-opacity": 0.35 },
      },
      {
        id: LAYER_IDS.outlookLine,
        type: "line",
        source: SOURCE_IDS.outlook,
        paint: {
          "line-color": ["get", "_color"],
          "line-width": 1.5,
          "line-dasharray": [5, 4],
        },
      },
      // Cone fill is a plain white haze (reads as a highlighted region over
      // ANY satellite imagery brightness, unlike a navy fill which nearly
      // vanished into the imagery's own dark-blue water) with a dark-cased
      // white dashed outline — the same casing technique as the track line
      // below, so the cone stays legible over open water, cloud, and land.
      {
        id: LAYER_IDS.coneFill,
        type: "fill",
        source: SOURCE_IDS.cone,
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.22 },
      },
      {
        id: LAYER_IDS.coneLineCasing,
        type: "line",
        source: SOURCE_IDS.cone,
        paint: { "line-color": "#1c2024", "line-width": 3.4, "line-opacity": 0.55 },
      },
      {
        id: LAYER_IDS.coneLine,
        type: "line",
        source: SOURCE_IDS.cone,
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.6,
          "line-dasharray": [6, 4],
        },
      },
      // Other (non-selected) storms' cones — same styling as the selected
      // storm's cone above (B2, final review: "v1: show all cones, detail
      // for strongest Gulf threat").
      {
        id: LAYER_IDS.otherConesFill,
        type: "fill",
        source: SOURCE_IDS.otherCones,
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.15 },
      },
      {
        id: LAYER_IDS.otherConesLineCasing,
        type: "line",
        source: SOURCE_IDS.otherCones,
        paint: { "line-color": "#1c2024", "line-width": 2.6, "line-opacity": 0.45 },
      },
      {
        id: LAYER_IDS.otherConesLine,
        type: "line",
        source: SOURCE_IDS.otherCones,
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.2,
          "line-dasharray": [6, 4],
        },
      },
      // Wind-probability shaded field (Round 2, v2 addendum) — a graduated
      // fill (11 percentage bands) under everything else drawn above it
      // (cone/track/ww/models), matching NHC's own shaded wind-probability
      // graphics rather than a point marker.
      {
        id: LAYER_IDS.windProbFill,
        type: "fill",
        source: SOURCE_IDS.windProb,
        paint: { "fill-color": ["get", "_color"], "fill-opacity": 0.55 },
      },
      {
        id: LAYER_IDS.windProbLine,
        type: "line",
        source: SOURCE_IDS.windProb,
        paint: { "line-color": ["get", "_color"], "line-width": 0.6, "line-opacity": 0.7 },
      },
      {
        id: LAYER_IDS.wwlines,
        type: "line",
        source: SOURCE_IDS.wwlines,
        paint: { "line-color": ["get", "_color"], "line-width": 3.5, "line-opacity": 0.95 },
      },
      // Ensemble members (GEFS/ECMWF, Round 2 full-spaghetti expansion) draw
      // BELOW the named deterministic/consensus/AI lines — there can be
      // 60+ of them, so they're deliberately thin and faint (a soft white
      // haze showing the guidance envelope, same "white reads over any
      // imagery brightness" technique as the track/cone) rather than
      // competing visually with the handful of named model lines on top.
      // A blue-gray tone was tried first and read as a muddy smear where it
      // blended into the basemap's own blue water color (user feedback
      // while reviewing the running dev server: "kinda weirdly blended") —
      // white avoids that regardless of what's underneath.
      {
        id: LAYER_IDS.modelsEnsemble,
        type: "line",
        source: SOURCE_IDS.models,
        filter: ["==", ["get", "kind"], "ensemble"],
        paint: {
          "line-color": ["get", "_color"],
          "line-width": 0.7,
          "line-opacity": 0.4,
        },
      },
      {
        id: LAYER_IDS.modelsSolid,
        type: "line",
        source: SOURCE_IDS.models,
        filter: ["all", ["!=", ["get", "kind"], "ai"], ["!=", ["get", "kind"], "ensemble"]],
        paint: {
          "line-color": ["get", "_color"],
          "line-width": 1.6,
          "line-opacity": 1,
        },
      },
      {
        id: LAYER_IDS.modelsDashed,
        type: "line",
        source: SOURCE_IDS.models,
        filter: ["==", ["get", "kind"], "ai"],
        paint: {
          "line-color": ["get", "_color"],
          "line-width": 1.8,
          "line-opacity": 1,
          "line-dasharray": [2, 2],
        },
      },
      // Dark casing under the white official track — satellite imagery's
      // brightness varies a lot (open water vs. cloud vs. land), so a plain
      // white line alone can wash out over bright cloud tops; a thin dark
      // outline underneath keeps it readable everywhere, the same
      // "casing" technique real map apps use for a route line over imagery.
      {
        id: LAYER_IDS.trackLineCasing,
        type: "line",
        source: SOURCE_IDS.track,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#1c2024", "line-width": 4.2 },
      },
      {
        id: LAYER_IDS.trackLine,
        type: "line",
        source: SOURCE_IDS.track,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#ffffff", "line-width": 2.2 },
      },
      {
        id: LAYER_IDS.trackPoints,
        type: "circle",
        source: SOURCE_IDS.track,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 4.5,
          "circle-stroke-color": "#1c2024",
          "circle-stroke-width": 1.2,
        },
      },
      {
        id: LAYER_IDS.trackNow,
        type: "circle",
        source: SOURCE_IDS.track,
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          ["==", ["to-number", ["coalesce", ["get", "TAU"], 0]], 0],
        ],
        paint: {
          "circle-radius": 9,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      },
      {
        id: LAYER_IDS.radar,
        type: "raster",
        source: SOURCE_IDS.radar,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.75 },
      },
    ],
  };
}

/** Re-reads CSS tokens and restyles the token-driven, non-data-driven layers.
 *  Kept as a no-op-safe function (rather than removed outright) since v2 is a
 *  single light theme — there's no mode-driven recolor left to do, but
 *  StormMap.tsx still calls this on every mount, so it stays cheap and
 *  correct if a token ever changes at runtime. */
export function applyModeColors(map: MapLibreMap): void {
  const c = readModeColors();
  map.setPaintProperty(LAYER_IDS.graticule, "line-color", c.grid);
}
