"use client";

import { useEffect, useRef, useState } from "react";
import StormMap from "@/components/StormMap";
import { IntensityPanel } from "@/components/IntensityPanel";
import { Rail } from "@/components/Rail";
import { useMetroAlerts } from "@/components/Alerts";
import { cdtTime } from "@/lib/format";
import { DEFAULT_LAYER_STATE, toggleLayer } from "@/lib/layers";
import { allModelCodes } from "@/lib/mapStyle";
import { useDashboard } from "@/lib/useDashboard";

export default function Home() {
  const dashboard = useDashboard();
  const [visibleModels, setVisibleModels] = useState<Set<string>>(new Set());
  const [layers, setLayers] = useState(DEFAULT_LAYER_STATE);

  // Every model track present in the CURRENT storm's models.geojson,
  // defaulted to "all visible" (Round 2, v2 addendum: a data-driven default
  // replaces the old hardcoded 8-code whitelist, which can't work anymore
  // now that different storms/demos carry wildly different model rosters —
  // the historical Ida sample alone has ~80 track features). Re-seeded only
  // when the SELECTED storm/model-cycle actually changes, so toggling
  // individual checkboxes in the rail doesn't get stomped by this effect on
  // every unrelated re-render.
  const modelsKey = dashboard.storm ? `${dashboard.storm.id}:${dashboard.storm.modelCycle}` : "";
  const lastModelsKeyRef = useRef<string>("");
  useEffect(() => {
    if (!dashboard.geo.models) return;
    if (lastModelsKeyRef.current === modelsKey) return;
    lastModelsKeyRef.current = modelsKey;
    setVisibleModels(new Set(allModelCodes(dashboard.geo.models)));
  }, [dashboard.geo.models, modelsKey]);

  const { rows: alerts } = useMetroAlerts();
  const hasHurricaneWarning = alerts.some((a) => a.event.includes("Hurricane Warning"));

  const hasGraphs = dashboard.mode === "active" && !!dashboard.storm && !!dashboard.intensity;

  return (
    <div className="app-shell">
      {dashboard.stale && dashboard.manifest && (
        <div className="stale-banner">
          Data may be delayed — last updated {cdtTime(dashboard.manifest.generated)}
        </div>
      )}

      <div className="masthead">
        <div>
          <div className="title">
            The <em>Gulf Watch</em>
            <span>
              {dashboard.mode === "active" && dashboard.storm
                ? `Tracking ${dashboard.storm.name} · New Orleans tropical weather desk`
                : "a New Orleans tropical weather desk"}
            </span>
          </div>
          <div className="org">AH Datalytics</div>
        </div>
        {hasHurricaneWarning && <div className="warnchip">Hurricane warning in effect</div>}
      </div>

      <div className="main">
        <Rail
          mode={dashboard.mode}
          storm={dashboard.storm}
          outlookText={dashboard.outlookText}
          visibleModels={visibleModels}
          onVisibleModelsChange={setVisibleModels}
          models={dashboard.geo.models}
          probs={dashboard.probs}
          textProducts={dashboard.textProducts}
        />
        <div className="mapcol">
          <StormMap
            geo={dashboard.geo}
            mode={dashboard.mode}
            visibleModels={visibleModels}
            layers={layers}
            onLayersToggle={(key) => setLayers((s) => toggleLayer(s, key))}
            hasGraphs={hasGraphs}
            otherStorms={dashboard.otherStorms}
          />
          {dashboard.demo && <div className="simtag">{dashboard.demoTag}</div>}
          {hasGraphs && layers.graphs && dashboard.storm && dashboard.intensity && (
            <IntensityPanel
              intensity={dashboard.intensity}
              storm={dashboard.storm}
              track={dashboard.geo.track}
              visibleModels={visibleModels}
              onClose={() => setLayers((s) => toggleLayer(s, "graphs"))}
            />
          )}
        </div>
      </div>

      <div className="disclaimer">
        Not an official forecast. For decisions, consult the National Hurricane Center and NWS New
        Orleans/Baton Rouge.
      </div>
    </div>
  );
}
