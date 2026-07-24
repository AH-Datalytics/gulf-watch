"use client";

import type { Mode, ProbsEntry, StormEntry, StormTextProducts } from "@/lib/types";
import { formatCycle } from "@/lib/format";
import { Alerts } from "./Alerts";
import { ForecastDiscussion } from "./ForecastDiscussion";
import { ModelLegend } from "./ModelLegend";
import { OutlookPanel } from "./OutlookPanel";
import { StormHeader } from "./StormHeader";
import { WindProbabilities } from "./WindProbabilities";

export interface RailProps {
  mode: Mode;
  storm: StormEntry | null;
  outlookText: { issued: string; text: string } | null;
  visibleModels: Set<string>;
  onVisibleModelsChange: (next: Set<string>) => void;
  /** models.geojson for the selected storm — forwarded to ModelLegend so it
   *  can decide whether to render the "AI Guidance" group (N9). */
  models?: GeoJSON.FeatureCollection | null;
  /** storms/{id}/probs.json for the selected storm — see WindProbabilities. */
  probs: ProbsEntry[] | null;
  /** storms/{id}/text.json for the selected storm — see ForecastDiscussion. */
  textProducts: StormTextProducts | null;
}

/**
 * Left rail. Active mode order (per the v2 addendum): storm header, wind
 * chances at New Orleans, watches/warnings, forecast models, collapsible
 * forecast discussion. Quiet mode: "no active systems" + seven-day outlook +
 * watches/warnings. The intensity panel lives under the map, not here.
 */
export function Rail({
  mode,
  storm,
  outlookText,
  visibleModels,
  onVisibleModelsChange,
  models,
  probs,
  textProducts,
}: RailProps) {
  return (
    <div className="rail">
      {mode === "active" && storm ? (
        <>
          <StormHeader storm={storm} />
          <WindProbabilities probs={probs} />
          <Alerts mode={mode} />
          <ModelLegend
            visibleModels={visibleModels}
            onChange={onVisibleModelsChange}
            cycleLabel={formatCycle(storm.modelCycle)}
            models={models}
          />
          <ForecastDiscussion discussion={textProducts?.discussion ?? null} />
        </>
      ) : (
        <>
          <OutlookPanel outlookText={outlookText} />
          <Alerts mode={mode} />
        </>
      )}
      <div className="foot">Sources: National Hurricane Center · NWS New Orleans/Baton Rouge</div>
    </div>
  );
}
