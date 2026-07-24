"use client";

import { useState } from "react";
import type { LayerKey, LayerState } from "@/lib/layers";

export interface LayersControlProps {
  layers: LayerState;
  onToggle: (key: LayerKey) => void;
  /** Whether the selected storm carries a real WSP shapefile to shade
   *  (see types.ts's StormEntry.files.windprob) — the row still shows but
   *  disables when there's nothing to draw, same convention as Rain. */
  hasWindProb: boolean;
  /** Whether the intensity panel has anything to show right now (active
   *  mode, a selected storm, intensity data loaded). */
  hasGraphs: boolean;
}

/**
 * Unified map-layers control — one familiar, collapsible map-app panel
 * (top-right of the map) replacing the old standalone floating radar
 * button. Plain-language rows, no HUD chrome, per the register directive.
 *
 * Wind probability was redesigned mid-build per direct user feedback while
 * reviewing the running dev server: an earlier point-marker "pill" design
 * ("I don't like either pill of the wind chances, not needed") was replaced
 * with a shaded probability field matching NHC's own wind-probability
 * graphics (https://www.nhc.noaa.gov/gis/'s real per-cycle WSP shapefile) —
 * see mapStyle.ts's windProbColor.
 */
export function LayersControl({ layers, onToggle, hasWindProb, hasGraphs }: LayersControlProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="layers-control">
      <button
        type="button"
        className="layers-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Layers
        <span className="chev" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="layers-body">
          <label className="layer-row">
            <input type="checkbox" checked={layers.cone} onChange={() => onToggle("cone")} />
            Forecast cone
          </label>
          <label className="layer-row">
            <input type="checkbox" checked={layers.models} onChange={() => onToggle("models")} />
            Model tracks
          </label>
          <label className={`layer-row${hasWindProb ? "" : " disabled"}`}>
            <input
              type="checkbox"
              checked={layers.windProb}
              disabled={!hasWindProb}
              onChange={() => onToggle("windProb")}
            />
            Wind probability
          </label>
          <label className="layer-row disabled">
            <input type="checkbox" checked={false} disabled readOnly />
            Rain
            <span className="layer-note">not available for this system</span>
          </label>
          <label className="layer-row">
            <input type="checkbox" checked={layers.radar} onChange={() => onToggle("radar")} />
            Radar
          </label>
          <div className="layers-divider" />
          <label className={`layer-row${hasGraphs ? "" : " disabled"}`}>
            <input
              type="checkbox"
              checked={layers.graphs}
              disabled={!hasGraphs}
              onChange={() => onToggle("graphs")}
            />
            Graphs
          </label>
        </div>
      )}
    </div>
  );
}
