"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
 * Forecast-model filter — a compact dropdown trigger (closed by default,
 * showing a "N of M" selected-count summary) that opens a checkbox panel on
 * click, closing on an outside click or Escape. Redesigned mid-build per
 * direct user feedback ("the model selection should be a dropdown filter,
 * baseball savant style") — the model roster can run to ~18 rows (13
 * deterministic + 4 consensus + 1 ensemble group for the Ida sample), which
 * dominated the rail as an always-open block; collapsed by default reads
 * like a normal stats-site filter control instead.
 *
 * Rows are grouped by each model's resolved `group` (see mapStyle.ts's
 * resolveGroup): "Deterministic" and "Consensus" each get one row per
 * individual model code (checkbox per model); "Ensemble" collapses every
 * GEFS/ECMWF member into a single group checkbox — there can be 60+ of
 * them, with no individual per-member toggle in the UI, matching how they
 * render on the map (one shared faint color/thin line, not a distinct
 * color per member).
 */
export function ModelLegend({ visibleModels, onChange, cycleLabel, models }: ModelLegendProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const rows = modelRows(models);
  const deterministic = rows.filter((r) => r.group === "deterministic");
  const consensus = rows.filter((r) => r.group === "consensus");
  const ensemble = rows.filter((r) => r.group === "ensemble");
  const ensembleCodes = ensemble.map((r) => r.code);
  const allCodes = rows.map((r) => r.code);
  const selectedCount = allCodes.filter((c) => visibleModels.has(c)).length;

  // Close on an outside click or Escape — standard dropdown-filter behavior
  // (Baseball Savant-style: click the trigger to open, click away to close,
  // no separate "Apply"/"Done" button needed since each checkbox already
  // applies immediately via onChange).
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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
    <div className="model-select" ref={rootRef}>
      <div className="kicker">
        Forecast models
        {cycleLabel && <span className="issued"> · {cycleLabel} cycle</span>}
      </div>
      <button
        type="button"
        className="model-select-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          {selectedCount} of {allCodes.length} shown
        </span>
        <span className="chev" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="model-select-panel">
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
      )}
    </div>
  );
}
