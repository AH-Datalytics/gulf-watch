"use client";

import { Fragment } from "react";
import { modelRows } from "@/lib/mapStyle";
import { DEFAULT_MODEL_COLOR, ENSEMBLE_COLOR, MODEL_COLORS } from "@/lib/modelColors";

export interface ModelLegendProps {
  visibleModels: Set<string>;
  onChange: (next: Set<string>) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  cycleLabel?: string;
  models?: GeoJSON.FeatureCollection | null;
}

/** Forecast-track choices embedded in Map options. Primary choices use
 * plain language; technical model codes stay behind Advanced. */
export function ModelLegend({
  visibleModels,
  onChange,
  enabled,
  onEnabledChange,
  cycleLabel,
  models,
}: ModelLegendProps) {
  const rows = modelRows(models);
  const deterministic = rows.filter((row) => row.group === "deterministic");
  const ensemble = rows.filter((row) => row.group === "ensemble");
  const ensembleCodes = ensemble.map((row) => row.code);
  const gefsCodes = ensemble
    .filter((row) => row.label.startsWith("GEFS"))
    .map((row) => row.code);
  const ecmwfCodes = ensemble
    .filter((row) => row.label.startsWith("ECMWF"))
    .map((row) => row.code);
  const namedEnsembleCodes = new Set([...gefsCodes, ...ecmwfCodes]);
  const otherEnsembleCodes = ensembleCodes.filter((code) => !namedEnsembleCodes.has(code));
  // Consensus aids usually sit close to the official forecast and add clutter
  // without presenting a meaningfully distinct scenario to general users.
  const allCodes = [...deterministic, ...ensemble].map((row) => row.code);
  const selectedCount = allCodes.filter((code) => visibleModels.has(code)).length;
  const allSelected = enabled && allCodes.length > 0 && selectedCount === allCodes.length;

  function choose(codes: string[]) {
    onChange(new Set(codes));
    onEnabledChange(codes.length > 0);
  }

  function toggle(code: string) {
    const next = new Set([...visibleModels].filter((selected) => allCodes.includes(selected)));
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
    onEnabledChange(next.size > 0);
  }

  function toggleModelSet(codes: string[]) {
    const allOn = codes.length > 0 && codes.every((code) => visibleModels.has(code));
    const next = new Set([...visibleModels].filter((selected) => allCodes.includes(selected)));
    for (const code of codes) {
      if (allOn) next.delete(code);
      else next.add(code);
    }
    onChange(next);
    onEnabledChange(next.size > 0);
  }

  return (
    <section className="guidance-section" aria-labelledby="forecast-track-heading">
      <div className="map-options-section-title" id="forecast-track-heading">Forecast track</div>
      <p className="map-options-help">The official NHC track is always visible. Model tracks show possible scenarios.</p>
      <div className="guidance-choice-list">
        <button type="button" className={!enabled ? "selected" : ""} onClick={() => choose([])}>
          <span><b>Official forecast</b></span>
          <span aria-hidden="true">{!enabled ? "✓" : ""}</span>
        </button>
        <button type="button" className={allSelected ? "selected" : ""} onClick={() => choose(allCodes)}>
          <span><b>Forecast model tracks</b><small>Show other projected paths</small></span>
          <span aria-hidden="true">{allSelected ? "✓" : ""}</span>
        </button>
      </div>
      <details className="advanced-models">
        <summary>Choose individual models</summary>
        {cycleLabel && <div className="advanced-cycle">Guidance cycle: {cycleLabel}</div>}
        <div className="legend-actions" aria-label="Model selection actions">
          <button type="button" onClick={() => choose(allCodes)} disabled={allSelected}>Select all</button>
          <button type="button" onClick={() => choose([])} disabled={selectedCount === 0}>Clear all</button>
        </div>
        <div className="models">
          {deterministic.length > 0 && (
            <Fragment>
              <div className="grp">Individual models</div>
              {deterministic.map((model) => (
                <label className="m" key={model.code}>
                  <input type="checkbox" checked={visibleModels.has(model.code)} onChange={() => toggle(model.code)} />
                  <span className={`sw${model.kind === "ai" ? " dash" : ""}`} style={{ borderColor: MODEL_COLORS[model.code] ?? DEFAULT_MODEL_COLOR }} />
                  {model.label}
                </label>
              ))}
            </Fragment>
          )}
          {ensemble.length > 0 && (
            <Fragment>
              <div className="grp">Ensemble model tracks</div>
              <div className="grp-note">
                Each system is run with slightly different initial conditions. The spread of tracks shows forecast uncertainty.
              </div>
              {gefsCodes.length > 0 && (
                <label className="m">
                  <input type="checkbox" checked={gefsCodes.every((code) => visibleModels.has(code))} onChange={() => toggleModelSet(gefsCodes)} />
                  <span className="sw" style={{ borderColor: ENSEMBLE_COLOR }} />
                  GEFS ensemble ({gefsCodes.length} members)
                </label>
              )}
              {ecmwfCodes.length > 0 && (
                <label className="m">
                  <input type="checkbox" checked={ecmwfCodes.every((code) => visibleModels.has(code))} onChange={() => toggleModelSet(ecmwfCodes)} />
                  <span className="sw" style={{ borderColor: ENSEMBLE_COLOR }} />
                  ECMWF ensemble ({ecmwfCodes.length} members)
                </label>
              )}
              {otherEnsembleCodes.length > 0 && (
                <label className="m">
                  <input type="checkbox" checked={otherEnsembleCodes.every((code) => visibleModels.has(code))} onChange={() => toggleModelSet(otherEnsembleCodes)} />
                  <span className="sw" style={{ borderColor: ENSEMBLE_COLOR }} />
                  Other ensemble members ({otherEnsembleCodes.length})
                </label>
              )}
            </Fragment>
          )}
        </div>
      </details>
    </section>
  );
}
