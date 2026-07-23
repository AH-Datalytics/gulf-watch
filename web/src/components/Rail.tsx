"use client";

import type { Mode, StormEntry } from "@/lib/types";
import { formatCycle } from "@/lib/format";
import { Alerts } from "./Alerts";
import { Gauges } from "./Gauges";
import { ModelLegend } from "./ModelLegend";
import { OutlookPanel } from "./OutlookPanel";
import { StormHeader } from "./StormHeader";

export interface RailProps {
  mode: Mode;
  storm: StormEntry | null;
  outlookText: { issued: string; text: string } | null;
  visibleModels: Set<string>;
  onVisibleModelsChange: (next: Set<string>) => void;
  /** models.geojson for the selected storm — forwarded to ModelLegend so it
   *  can decide whether to render the "AI Guidance" group (N9). */
  models?: GeoJSON.FeatureCollection | null;
}

/**
 * Left rail — active mode: storm header, watches/warnings, model guidance
 * legend, tide gauges; quiet mode: "no active systems" + seven-day outlook +
 * watches/warnings + tide gauges. Gauges sits after the model legend in
 * active mode and after the outlook/alerts block in quiet mode, matching the
 * mockup's rail order in both variants. Task 11's intensity panel lives
 * under the map, not here.
 */
export function Rail({ mode, storm, outlookText, visibleModels, onVisibleModelsChange, models }: RailProps) {
  return (
    <div className="rail">
      {mode === "active" && storm ? (
        <>
          <StormHeader storm={storm} />
          <Alerts mode={mode} />
          <ModelLegend
            visibleModels={visibleModels}
            onChange={onVisibleModelsChange}
            cycleLabel={formatCycle(storm.modelCycle)}
            models={models}
          />
          <Gauges mode={mode} />
        </>
      ) : (
        <>
          <OutlookPanel outlookText={outlookText} />
          <Alerts mode={mode} />
          <Gauges mode={mode} />
        </>
      )}
      <div className="foot">
        {mode === "active" ? (
          // N8 (final review): ECMWF/GOOGLE WL removed — no AI-model data
          // ships in v1 (AIFS is stubbed to always return [], see aifs.py).
          // IEM/mesonet credited here since radar is now user-enableable
          // (see the RADAR toggle, StormMap.tsx).
          <>NHC / NWS LIX / NOAA CO-OPS / IEM NEXRAD</>
        ) : (
          <>Sources: National Hurricane Center · NWS New Orleans/Baton Rouge · NOAA Tides &amp; Currents</>
        )}
      </div>
    </div>
  );
}
