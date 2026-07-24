"use client";

import { useState } from "react";
import type { LayerKey, LayerState, WindThreshold } from "@/lib/layers";
import { WIND_FIELD_BANDS, WIND_PROB_BANDS } from "@/lib/mapStyle";
import { ModelLegend } from "./ModelLegend";

export interface LayersControlProps {
  layers: LayerState;
  onToggle: (key: LayerKey) => void;
  hasGraphs: boolean;
  hasHistory: boolean;
  hasSatellite: boolean;
  satelliteLabel?: string;
  hasWindField: boolean;
  availableWindThresholds: WindThreshold[];
  windThreshold: WindThreshold;
  onWindThresholdChange: (threshold: WindThreshold) => void;
  visibleModels: Set<string>;
  onVisibleModelsChange: (next: Set<string>) => void;
  models?: GeoJSON.FeatureCollection | null;
  cycleLabel?: string;
  windProbLoading?: boolean;
  windProbError?: boolean;
  windFieldLoading?: boolean;
  windFieldError?: boolean;
  hasDiscussion: boolean;
  discussionOpen: boolean;
  onDiscussionToggle: () => void;
}

const WIND_THRESHOLD_LABELS: Record<WindThreshold, string> = {
  39: "39 mph · tropical-storm force",
  58: "58 mph · damaging winds",
  74: "74 mph · hurricane force",
};

/** One map-options panel for forecast interpretation and weather overlays.
 * Technical model codes remain behind an advanced disclosure. */
export function LayersControl({
  layers,
  onToggle,
  hasGraphs,
  hasHistory,
  hasSatellite,
  satelliteLabel,
  hasWindField,
  availableWindThresholds = [],
  windThreshold,
  onWindThresholdChange,
  visibleModels,
  onVisibleModelsChange,
  models,
  cycleLabel,
  windProbLoading,
  windProbError,
  windFieldLoading,
  windFieldError,
  hasDiscussion,
  discussionOpen,
  onDiscussionToggle,
}: LayersControlProps) {
  const [open, setOpen] = useState(true);
  const hasWindProb = availableWindThresholds.length > 0;

  return (
    <div className={`layers-control${open ? " open" : ""}`}>
      <button type="button" className="layers-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>Map options</span>
        <span className="chev" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="layers-body">
          {models && (
            <ModelLegend
              visibleModels={visibleModels}
              onChange={onVisibleModelsChange}
              enabled={layers.models}
              onEnabledChange={(enabled) => {
                if (enabled !== layers.models) onToggle("models");
              }}
              cycleLabel={cycleLabel}
              models={models}
            />
          )}

          <section className="weather-overlays" aria-labelledby="weather-overlays-heading">
            <div className="map-options-section-title" id="weather-overlays-heading">Weather overlays</div>
            <label className="layer-row">
              <input type="checkbox" checked={layers.cone} onChange={() => onToggle("cone")} />
              Forecast cone
            </label>
            {hasHistory && (
              <label className="layer-row">
                <input type="checkbox" checked={layers.history} onChange={() => onToggle("history")} />
                Past track <small>observed</small>
              </label>
            )}
            {hasSatellite && (
              <>
                <label className="layer-row">
                  <input type="checkbox" checked={layers.satellite} onChange={() => onToggle("satellite")} />
                  Satellite imagery
                </label>
                {layers.satellite && (
                  <div className="satellite-option-note">GOES-16 · {satelliteLabel}</div>
                )}
              </>
            )}
            <label className={`layer-row${hasWindField ? "" : " disabled"}`}>
              <input type="checkbox" checked={layers.windField} disabled={!hasWindField} onChange={() => onToggle("windField")} />
              Wind field
            </label>
            {hasWindField && layers.windField && (
              <div className="windfield-options">
                <div className="windfield-description">Current analyzed wind extent</div>
                <div className="windfield-legend" aria-label="Wind field thresholds">
                  {WIND_FIELD_BANDS.map((band) => (
                    <span key={band.knots}><i style={{ background: band.color }} />{band.mph} mph</span>
                  ))}
                </div>
                {windFieldLoading && <div className="layer-status">Loading wind field…</div>}
                {windFieldError && <div className="layer-status error">Wind field unavailable</div>}
              </div>
            )}
            <label className={`layer-row${hasWindProb ? "" : " disabled"}`}>
              <input type="checkbox" checked={layers.windProb} disabled={!hasWindProb} onChange={() => onToggle("windProb")} />
              Wind probability
            </label>
            {hasWindProb && layers.windProb && (
              <div className="windprob-options">
                <label htmlFor="wind-speed-threshold">Winds reaching at least</label>
                <select
                  id="wind-speed-threshold"
                  value={windThreshold}
                  onChange={(event) => onWindThresholdChange(Number(event.target.value) as WindThreshold)}
                >
                  {availableWindThresholds.map((threshold) => (
                    <option value={threshold} key={threshold}>{WIND_THRESHOLD_LABELS[threshold]}</option>
                  ))}
                </select>
                {windProbLoading && <div className="layer-status">Loading probability map…</div>}
                {windProbError && <div className="layer-status error">Probability map unavailable</div>}
                <div className="windprob-legend">
                  <div className="windprob-legend-bar">
                    {WIND_PROB_BANDS.map((band) => <span key={band.label} style={{ background: band.color }} />)}
                  </div>
                  <div className="windprob-legend-labels"><span>&lt;5%</span><span>Probability</span><span>&gt;90%</span></div>
                </div>
              </div>
            )}
            <label className="layer-row">
              <input type="checkbox" checked={layers.radar} onChange={() => onToggle("radar")} />
              Radar
            </label>
          </section>
          <section className="map-popout-actions" aria-labelledby="forecast-details-heading">
            <div className="map-options-section-title" id="forecast-details-heading">Forecast details</div>
            <button
              type="button"
              className={`map-action-button${layers.graphs && hasGraphs ? " active" : ""}`}
              disabled={!hasGraphs}
              onClick={() => onToggle("graphs")}
              aria-pressed={layers.graphs}
            >
              <span>Intensity graph</span>
              <small>{hasGraphs ? (layers.graphs ? "Close" : "Open") : "Unavailable"}</small>
            </button>
            <button
              type="button"
              className={`map-action-button${discussionOpen ? " active" : ""}`}
              disabled={!hasDiscussion}
              onClick={onDiscussionToggle}
              aria-pressed={discussionOpen}
            >
              <span>Forecast discussion</span>
              <small>{discussionOpen ? "Close" : "Open"}</small>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
