// Model spaghetti-line / intensity-panel colors. v2: darkened from the old
// dark-navy-background palette (docs/superpowers/specs/two-moods-v2-mockup.html)
// so every line stays legible against BOTH a white rail/chart panel and
// satellite imagery on the map — the old palette's pure white OFCL/TVCA and
// several pale pastels (HFSB, AIFS, DMWL) were only readable on a dark
// background and would vanish on the new light theme.
//
// Keys are AID (a-deck / models.geojson "model" property) codes from the
// MODELS whitelist in shared-contracts.md / ingest/gulfwatch/adeck.py.
//
// Round 2 (v2 addendum, full spaghetti): the whitelist grew from 6 map-drawn
// models to ~19 named models (deterministic + consensus) plus dynamically
// recognized GEFS/ECMWF ensemble members. Ensemble members don't get an
// individual color here — they render as one shared faint/thin line color
// (ENSEMBLE_COLOR below), by design (a single legend checkbox controls all
// ~30-60 of them together; distinct per-member colors would be noise, not
// signal).

export const MODEL_COLORS: Record<string, string> = {
  AVNO: "#d9622e", // GFS
  EMXI: "#1f6fb2", // ECMWF
  HFSA: "#8e5fc4", // HAFS-A
  HFSB: "#b8860b", // HAFS-B
  EGRR: "#2e8b57", // UKMET
  TVCA: "#2a2f36", // Consensus — near-black, meant to stand out
  OFCL: "#1f3a5f", // Official — navy accent
  AIFS: "#0e8fa3", // AIFS (ECMWF) — AI guidance
  DMWL: "#c2478f", // DeepMind WL — AI guidance
  // Intensity-only models (SHIPS/LGEM statistical guidance, + IVCN intensity
  // consensus which structurally has no track) — no map track, so these
  // appear only in the intensity panel, never in the map's model legend.
  DSHP: "#3f8f76", // SHIPS
  LGEM: "#b5555a", // LGEM
  IVCN: "#6a4fa0", // Intensity Consensus
  // Additional major deterministic aids (2021-era codes present in the
  // Hurricane Ida archive, plus interpolated siblings of models above).
  CMC: "#a13d63", // CMC (Canadian GDPS)
  CMCI: "#c06a8c", // CMC (interpolated) — lighter tint of CMC
  NVGM: "#4f6d2f", // Navy NAVGEM
  CTCX: "#c78a1e", // COAMPS-TC
  COTC: "#dba852", // COAMPS-TC (interpolated) — lighter tint of CTCX
  HMON: "#1b8a8f", // HMON
  HWRF: "#5b4fc4", // HWRF
  EGRI: "#5aa478", // UKMET (interpolated) — lighter tint of EGRR
  // Additional consensus aids (beyond TVCA above).
  TVCN: "#585f68", // TVCN Consensus
  GFEX: "#8a6d3b", // GFS Ensemble Mean
  HCCA: "#3f3a6b", // HFIP Corrected Consensus
};

export const DEFAULT_MODEL_COLOR = "#8a94a3";

/** Shared color for every GEFS/ECMWF ensemble-member line — deliberately
 *  one flat, faint color rather than per-member colors (see module comment
 *  above); paired with a thin, low-opacity line in mapStyle.ts. White (like
 *  the official track/cone's casing technique) rather than a blue-gray: a
 *  blue-gray haze at low opacity blended into the satellite basemap's own
 *  blue water color and read as a muddy smear rather than a clean envelope
 *  of guidance lines; white stays legible as a distinct "haze" layer over
 *  both water and land. */
export const ENSEMBLE_COLOR = "#ffffff";
