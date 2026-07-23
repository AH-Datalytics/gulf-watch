// Model spaghetti-line colors, copied verbatim from the mockup's model legend
// (docs/superpowers/specs/two-moods-v2-mockup.html, .models block) so the map
// (this file) and the Task 9 rail legend draw from one source of truth.
//
// Keys are AID (a-deck / models.geojson "model" property) codes from the
// MODELS whitelist in shared-contracts.md / ingest/gulfwatch/adeck.py.

export const MODEL_COLORS: Record<string, string> = {
  AVNO: "#ef8354", // GFS
  EMXI: "#64a6dd", // ECMWF
  HFSA: "#b58cd9", // HAFS-A
  HFSB: "#e2c765", // HAFS-B
  EGRR: "#6fcf97", // UKMET
  TVCA: "#ffffff", // Consensus
  OFCL: "#ffffff", // Official
  AIFS: "#5ec8d8", // AIFS (ECMWF) — AI guidance
  DMWL: "#f0a8d0", // DeepMind WL — AI guidance
};

export const DEFAULT_MODEL_COLOR = "#8ca0bf";
