// Model spaghetti-line / intensity-panel colors. v2: darkened from the old
// dark-navy-background palette (docs/superpowers/specs/two-moods-v2-mockup.html)
// so every line stays legible against BOTH a white rail/chart panel and
// satellite imagery on the map — the old palette's pure white OFCL/TVCA and
// several pale pastels (HFSB, AIFS, DMWL) were only readable on a dark
// background and would vanish on the new light theme.
//
// Keys are AID (a-deck / models.geojson "model" property) codes from the
// MODELS whitelist in shared-contracts.md / ingest/gulfwatch/adeck.py.

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
  // Intensity-only models (SHIPS/LGEM statistical guidance) — no map track,
  // so these two appear only in the intensity panel, never here in the
  // map's model legend/spaghetti.
  DSHP: "#3f8f76", // SHIPS
  LGEM: "#b5555a", // LGEM
};

export const DEFAULT_MODEL_COLOR = "#8a94a3";
