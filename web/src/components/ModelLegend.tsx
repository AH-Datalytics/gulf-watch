"use client";

import { Fragment } from "react";
import { modelRows } from "@/lib/mapStyle";
import { DEFAULT_MODEL_COLOR, ENSEMBLE_COLOR, MODEL_COLORS } from "@/lib/modelColors";

export interface ModelLegendProps {
  visibleModels: Set<string>;
  onChange: (next: Set<string>) => void;
  /** e.g. "12Z" — shown in the kicker as "Guidance — 12Z Cycle". */
  cycleLabel?: string;
  /** models.geojson for the selected storm. Round 2 (v2 addendum, full
   *  spaghetti): the legend is now entirely data-driven from this — the
   *  historical Ida sample carries a totally different model roster
   *  (CMC, NAVGEM, HMON, HWRF, 60+ GEFS/ECMWF ensemble members...) from a
   *  live storm's, so a fixed hardcoded model list can't work anymore. */
  models?: GeoJSON.FeatureCollection | null;
}

/**
 * Forecast-model legend/toggle list. Rows are grouped by each model's
 * resolved `group` (see mapStyle.ts's resolveGroup): "Deterministic" and
 * "Consensus" each get one row per individual model code (checkbox per
 * model, as before); "Ensemble" collapses every GEFS/ECMWF member into a
 * single group checkbox — there can be 60+ of them, with no individual
 * per-member toggle in the UI, matching how they render on the map (one
 * shared faint color/thin line, not a distinct color per member).
 */
export function ModelLegend({ visibleModels, onChange, cycleLabel, models }: ModelLegendProps) {
  const rows = modelRows(models);
  const deterministic = rows.filter((r) => r.group === "deterministic");
  const consensus = rows.filter((r) => r.group === "consensus");
  const ensemble = rows.filter((r) => r.group === "ensemble");
  const ensembleCodes = ensemble.map((r) => r.code);
  const allCodes = rows.map((r) => r.code);

  function toggle(code: string) {
    const next = new Set(visibleModels);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  }

  function toggleEnsemble() {
    const allOn = ensembleCodes.length > 0 && ensembleCodes.every((c) => visibleModels.has(c));
    const next = new Set(visibleModels);
    for (const c of ensembleCodes) {
      if (allOn) next.delete(c);
      else next.add(c);
    }
    onChange(next);
  }

  return (
    <div>
      <div className="kicker">
        Forecast models
        {cycleLabel && <span className="issued"> · {cycleLabel} cycle</span>}
      </div>
      <div className="models">
        {deterministic.length > 0 && (
          <Fragment>
            <div className="grp">Deterministic</div>
            {deterministic.map((model) => (
              <label className="m" key={model.code}>
                <input
                  type="checkbox"
                  checked={visibleModels.has(model.code)}
                  onChange={() => toggle(model.code)}
                />
                <span
                  className={`sw${model.kind === "ai" ? " dash" : ""}`}
                  style={{ borderColor: MODEL_COLORS[model.code] ?? DEFAULT_MODEL_COLOR }}
                />
                {model.label}
              </label>
            ))}
          </Fragment>
        )}
        {consensus.length > 0 && (
          <Fragment>
            <div className="grp">Consensus</div>
            {consensus.map((model) => (
              <label className="m" key={model.code}>
                <input
                  type="checkbox"
                  checked={visibleModels.has(model.code)}
                  onChange={() => toggle(model.code)}
                />
                <span className="sw" style={{ borderColor: MODEL_COLORS[model.code] ?? DEFAULT_MODEL_COLOR }} />
                {model.label}
              </label>
            ))}
          </Fragment>
        )}
        {ensemble.length > 0 && (
          <Fragment>
            <div className="grp">Ensemble</div>
            <label className="m">
              <input
                type="checkbox"
                checked={ensembleCodes.every((c) => visibleModels.has(c))}
                onChange={toggleEnsemble}
              />
              <span className="sw" style={{ borderColor: ENSEMBLE_COLOR }} />
              Ensemble members ({ensemble.length})
            </label>
          </Fragment>
        )}
      </div>
      <div className="legend-actions">
        {consensus.length > 0 && (
          <button type="button" onClick={() => onChange(new Set(consensus.map((r) => r.code)))}>
            Consensus only
          </button>
        )}
        <button type="button" onClick={() => onChange(new Set(allCodes))}>
          All models
        </button>
      </div>
    </div>
  );
}
