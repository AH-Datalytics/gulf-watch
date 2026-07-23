"use client";

import { useState } from "react";
import StormMap from "@/components/StormMap";
import { Rail } from "@/components/Rail";
import { useMetroAlerts } from "@/components/Alerts";
import { cdtTime } from "@/lib/format";
import { useDashboard } from "@/lib/useDashboard";

// Every guidance model that's toggleable spaghetti on the map (INTENSITY_ONLY
// DSHP/LGEM are never drawn; OFCL is excluded on purpose — the official NHC
// track is always drawn from track.geojson's own white 2.2px line/points, so
// treating OFCL as toggleable spaghetti too would duplicate it and could make
// it vanish entirely if unchecked; see StormMap.tsx's excludeOfficialModel()).
// All visible by default; the rail's model legend toggles individual models
// off, and must agree with this set exactly (its own model list has no OFCL
// entry either).
const ALL_MAP_MODELS = new Set(["AVNO", "EMXI", "HFSA", "HFSB", "EGRR", "TVCA", "AIFS", "DMWL"]);

export default function Home() {
  const dashboard = useDashboard();
  const [visibleModels, setVisibleModels] = useState<Set<string>>(ALL_MAP_MODELS);
  const [showRadar, setShowRadar] = useState(false);
  // Task-11+ concern (radar toggle UI isn't part of any task's explicit scope
  // yet); left lifted here so StormMap already has the prop wired.
  void setShowRadar;

  const { rows: alerts } = useMetroAlerts();
  const hasHurricaneWarning = alerts.some((a) => a.event.includes("Hurricane Warning"));

  return (
    <div className="app-shell">
      {dashboard.stale && dashboard.manifest && (
        <div className="stale-banner">
          Data may be delayed — last updated {cdtTime(dashboard.manifest.generated)}
        </div>
      )}

      <div className="masthead">
        {dashboard.mode === "quiet" ? (
          <>
            <div className="title">
              The <em>Gulf Watch</em> — a New Orleans tropical weather desk
            </div>
            <div className="org">AH Datalytics · Tropical Outlook</div>
          </>
        ) : (
          <>
            <div className="title">
              The Gulf Watch <span>· New Orleans Tropical Weather Desk · AH Datalytics</span>
            </div>
            {hasHurricaneWarning && <div className="warnchip">Hurricane Warning in Effect</div>}
          </>
        )}
      </div>

      <div className="main">
        <Rail
          mode={dashboard.mode}
          storm={dashboard.storm}
          outlookText={dashboard.outlookText}
          visibleModels={visibleModels}
          onVisibleModelsChange={setVisibleModels}
        />
        <div className="mapcol">
          <StormMap
            geo={dashboard.geo}
            mode={dashboard.mode}
            visibleModels={visibleModels}
            showRadar={showRadar}
          />
          {dashboard.demo && <div className="simtag">SIMULATED STORM — DEMO DATA</div>}
        </div>
      </div>

      <div className="disclaimer">
        Not an official forecast. For decisions, consult the National Hurricane Center and NWS New
        Orleans/Baton Rouge.
      </div>
    </div>
  );
}
