"use client";

import { useMemo } from "react";
import { WW_COLORS, WW_LEGEND_ITEMS, wwKind } from "@/lib/mapStyle";
import { nolaHasHurricaneWarning } from "@/lib/nhcWarnings";

export interface CoastalAlertsLegendProps {
  warnings?: GeoJSON.FeatureCollection | null;
  publicAdvisoryText?: string | null;
}

/** Map key for the NHC watch/warning segments drawn directly along the coast. */
export function CoastalAlertsLegend({ warnings, publicAdvisoryText }: CoastalAlertsLegendProps) {
  const items = useMemo(() => {
    const present = new Set(
      (warnings?.features ?? []).map((feature) => wwKind(feature.properties?.TCWW as string | undefined))
    );
    return WW_LEGEND_ITEMS.filter((item) => present.has(item.kind));
  }, [warnings]);
  const nolaWarning = useMemo(
    () => nolaHasHurricaneWarning(publicAdvisoryText),
    [publicAdvisoryText]
  );

  if (items.length === 0) return null;

  return (
    <section className="coastal-alert-legend" aria-labelledby="coastal-alert-legend-title">
      <div className="kicker" id="coastal-alert-legend-title">Warning summary</div>
      <p><b>NHC coastal alerts for this advisory.</b></p>
      {nolaWarning && (
        <div className="nola-warning-callout">
          <b>New Orleans metro area</b>
          <span>Hurricane warning in effect</span>
        </div>
      )}
      <p className="coastal-alert-note">Colors match the coastal lines on the map.</p>
      <div className="coastal-alert-key">
        {items.map((item) => (
          <div key={item.kind}>
            <i style={{ background: WW_COLORS[item.kind] }} aria-hidden="true" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
