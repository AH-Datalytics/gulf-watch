"use client";

import { useState } from "react";
import StormMap from "@/components/StormMap";
import { useDashboard } from "@/lib/useDashboard";

// Every model in the shared-contracts.md whitelist that's actually plotted on
// the map (INTENSITY_ONLY models DSHP/LGEM are never drawn). All visible by
// default; Task 9's legend toggles individual models off via this same set.
const ALL_MAP_MODELS = new Set([
  "OFCL",
  "AVNO",
  "EMXI",
  "HFSA",
  "HFSB",
  "EGRR",
  "TVCA",
  "AIFS",
  "DMWL",
]);

export default function Home() {
  const dashboard = useDashboard();
  const [visibleModels, setVisibleModels] = useState<Set<string>>(ALL_MAP_MODELS);
  const [showRadar, setShowRadar] = useState(false);

  // Task 9 will read/write these two via the rail (model legend checkboxes,
  // radar toggle); for now they're just lifted here so StormMap has them.
  void setVisibleModels;
  void setShowRadar;

  return (
    <div className="app-shell">
      <div className="main">
        <div className="rail" />
        <div className="mapcol">
          <StormMap
            geo={dashboard.geo}
            mode={dashboard.mode}
            visibleModels={visibleModels}
            showRadar={showRadar}
          />
        </div>
      </div>
    </div>
  );
}
