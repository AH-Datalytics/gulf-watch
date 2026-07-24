"use client";

import { Fragment } from "react";
import { hasAiGuidance } from "@/lib/mapStyle";
import { MODEL_COLORS } from "@/lib/modelColors";

interface ModelMeta {
  code: string;
  label: string;
}

interface ModelGroup {
  label: string;
  dashed: boolean;
  models: ModelMeta[];
}

// Physics vs. AI Guidance grouping per the mockup's model legend. OFCL isn't
// listed — it's always drawn as the solid white official track, not a
// toggleable guidance line. DSHP/LGEM (INTENSITY_ONLY, per shared-contracts)
// never appear here since they have no map track to toggle.
const GROUPS: ModelGroup[] = [
  {
    label: "Physics",
    dashed: false,
    models: [
      { code: "AVNO", label: "GFS" },
      { code: "EMXI", label: "ECMWF" },
      { code: "HFSA", label: "HAFS-A" },
      { code: "HFSB", label: "HAFS-B" },
      { code: "EGRR", label: "UKMET" },
      { code: "TVCA", label: "Consensus" },
    ],
  },
  {
    label: "AI Guidance",
    dashed: true,
    models: [
      { code: "AIFS", label: "AIFS (ECMWF)" },
      { code: "DMWL", label: "DeepMind WL" },
    ],
  },
];

const ALL_CODES = GROUPS.flatMap((g) => g.models.map((m) => m.code));

export interface ModelLegendProps {
  visibleModels: Set<string>;
  onChange: (next: Set<string>) => void;
  /** e.g. "12Z" — shown in the kicker as "Guidance — 12Z Cycle". */
  cycleLabel?: string;
  /** models.geojson for the selected storm — used only to decide whether
   *  the "AI Guidance" group has anything real to show (see {@link hasAiGuidance}). */
  models?: GeoJSON.FeatureCollection | null;
}

export function ModelLegend({ visibleModels, onChange, cycleLabel, models }: ModelLegendProps) {
  function toggle(code: string) {
    const next = new Set(visibleModels);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  }

  const groups = hasAiGuidance(models) ? GROUPS : GROUPS.filter((g) => g.label !== "AI Guidance");

  return (
    <div>
      <div className="kicker">
        Forecast models
        {cycleLabel && <span className="issued"> · {cycleLabel} cycle</span>}
      </div>
      <div className="models">
        {groups.map((group) => (
          <Fragment key={group.label}>
            <div className="grp">{group.label}</div>
            {group.models.map((model) => (
              <label className="m" key={model.code}>
                <input
                  type="checkbox"
                  checked={visibleModels.has(model.code)}
                  onChange={() => toggle(model.code)}
                />
                <span
                  className={`sw${group.dashed ? " dash" : ""}`}
                  style={{ borderColor: MODEL_COLORS[model.code] }}
                />
                {model.label}
              </label>
            ))}
          </Fragment>
        ))}
      </div>
      <div className="legend-actions">
        <button type="button" onClick={() => onChange(new Set(["TVCA"]))}>
          Consensus only
        </button>
        <button type="button" onClick={() => onChange(new Set(ALL_CODES))}>
          All models
        </button>
      </div>
    </div>
  );
}
