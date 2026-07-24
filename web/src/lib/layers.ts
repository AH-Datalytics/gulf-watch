// Unified map-layers control state (v2 addendum Round 2) — lifted to
// page.tsx per the task brief ("Layer states lift to page.tsx") and passed
// down to StormMap/LayersControl. Pure, framework-free so it's unit
// testable without rendering anything.

export type LayerKey = "cone" | "models" | "windProb" | "rain" | "radar" | "graphs";

export interface LayerState {
  /** Forecast cone (track uncertainty polygon). */
  cone: boolean;
  /** Model spaghetti — the master on/off switch; ModelLegend's per-model
   *  checkboxes still control WHICH models show once this is on. */
  models: boolean;
  /** Shaded wind-speed-probability field (34kt/TS-force threshold), when
   *  the selected storm carries the real NHC WSP shapefile — see
   *  types.ts's StormEntry.files.windprob. Redesigned mid-build from an
   *  earlier point-marker "pill" per direct user feedback ("I don't like
   *  either pill of the wind chances, not needed... can the wind
   *  probability selector match [NHC's own shaded graphics]?"). */
  windProb: boolean;
  /** Rainfall/QPF — always unavailable today (no ingested QPF product
   *  exists yet for any storm, live or historical; see
   *  ingest/scripts/build_ida_sample.py's module docstring). Kept in the
   *  layer-state shape/UI now so the control surface is ready for it. */
  rain: boolean;
  /** NEXRAD radar overlay (was a standalone floating button before Round 2;
   *  now one row in the unified Layers control). */
  radar: boolean;
  /** Shows/hides the intensity guidance panel under the map. */
  graphs: boolean;
}

export const DEFAULT_LAYER_STATE: LayerState = {
  cone: true,
  models: true,
  windProb: true,
  rain: false,
  radar: false,
  graphs: true,
};

/** Pure toggle: flips one layer's boolean, returning a new LayerState
 *  (never mutates `state`). */
export function toggleLayer(state: LayerState, key: LayerKey): LayerState {
  return { ...state, [key]: !state[key] };
}
