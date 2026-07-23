"use client";

import type { Mode, StormEntry } from "@/lib/types";
import { formatCycle } from "@/lib/format";
import { Alerts } from "./Alerts";
import { ModelLegend } from "./ModelLegend";
import { OutlookPanel } from "./OutlookPanel";
import { StormHeader } from "./StormHeader";

export interface RailProps {
  mode: Mode;
  storm: StormEntry | null;
  outlookText: { issued: string; text: string } | null;
  visibleModels: Set<string>;
  onVisibleModelsChange: (next: Set<string>) => void;
}

/**
 * Left rail — active mode: storm header, watches/warnings, model guidance
 * legend; quiet mode: "no active systems" + seven-day outlook. Task 10 adds a
 * Gauges section to both variants; Task 11's intensity panel lives under the
 * map, not here.
 */
export function Rail({ mode, storm, outlookText, visibleModels, onVisibleModelsChange }: RailProps) {
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
          />
        </>
      ) : (
        <>
          <OutlookPanel outlookText={outlookText} />
          <Alerts mode={mode} />
        </>
      )}
      <div className="foot">
        {mode === "active" ? (
          <>NHC / NWS LIX / NOAA CO-OPS / ECMWF / GOOGLE WL</>
        ) : (
          <>Sources: National Hurricane Center · NWS New Orleans/Baton Rouge · NOAA Tides &amp; Currents</>
        )}
      </div>
    </div>
  );
}
