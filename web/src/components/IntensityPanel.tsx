"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { CATEGORY_THRESHOLDS_MPH } from "@/lib/config";
import { cdtTickLabel } from "@/lib/format";
import { landfallTau } from "@/lib/landfall";
import { DEFAULT_MODEL_COLOR, MODEL_COLORS } from "@/lib/modelColors";
import type { IntensitySeries, StormEntry } from "@/lib/types";

export interface IntensityPanelProps {
  intensity: IntensitySeries;
  storm: StormEntry;
  track?: GeoJSON.FeatureCollection;
  visibleModels: Set<string>;
}

// Series with no map-toggle checkbox in ModelLegend (they're intensity-only
// statistical guidance with no forecast track to draw) — these always
// render here regardless of `visibleModels`, same as OFCL, because there's
// no other UI for a user to ever make them visible otherwise.
const ALWAYS_ON_MODELS = new Set(["OFCL", "DSHP", "LGEM"]);

// A band whose visible slice (after clamping to yMax) is thinner than this
// many mph renders as an unreadable sliver whose right-edge label collides
// with its neighbor's — e.g. live Bertha's mild TS-strength forecast puts
// yMax at 75, leaving only 1 mph of CAT1 band (74-75) visible, which put
// "CAT 1" and "TS" literally on top of each other (confirmed via a
// Playwright text-node dump). Bands under the threshold are dropped
// entirely rather than rendered unreadably.
const MIN_VISIBLE_BAND_MPH = 8;

const CATEGORY_BANDS = [
  { lower: CATEGORY_THRESHOLDS_MPH.TS, upper: CATEGORY_THRESHOLDS_MPH.C1, label: "TS", color: "var(--band-ts)" },
  { lower: CATEGORY_THRESHOLDS_MPH.C1, upper: CATEGORY_THRESHOLDS_MPH.C2, label: "CAT 1", color: "var(--band-1)" },
  { lower: CATEGORY_THRESHOLDS_MPH.C2, upper: CATEGORY_THRESHOLDS_MPH.C3, label: "CAT 2", color: "var(--band-2)" },
  { lower: CATEGORY_THRESHOLDS_MPH.C3, upper: CATEGORY_THRESHOLDS_MPH.C4, label: "CAT 3", color: "var(--band-3)" },
  { lower: CATEGORY_THRESHOLDS_MPH.C4, upper: CATEGORY_THRESHOLDS_MPH.C5, label: "CAT 4", color: "var(--band-3)" },
  { lower: CATEGORY_THRESHOLDS_MPH.C5, upper: Infinity, label: "CAT 5", color: "var(--band-3)" },
] as const;

function addHoursIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}

/** [0, top] where top is the smallest multiple of 25 that clears max(series mph) + a half-band of padding. */
function yDomain(series: IntensitySeries["series"]): [number, number] {
  let max = 0;
  for (const s of series) for (const p of s.points) max = Math.max(max, p.mph);
  const padded = Math.max(max, CATEGORY_THRESHOLDS_MPH.TS) + 15;
  const top = Math.ceil(padded / 25) * 25;
  return [0, top];
}

function maxTau(series: IntensitySeries["series"]): number {
  let max = 0;
  for (const s of series) for (const p of s.points) max = Math.max(max, p.tauH);
  return max;
}

/** 5 evenly-spaced tick hours across [0, maxTauH], deduped for tiny ranges. */
function buildTicks(maxTauH: number): number[] {
  if (maxTauH <= 0) return [0];
  const steps = 4;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => Math.round((i * maxTauH) / steps));
  return Array.from(new Set(ticks));
}

function modelColor(model: string): string {
  return MODEL_COLORS[model] ?? DEFAULT_MODEL_COLOR;
}

interface IntensityTooltipProps extends TooltipContentProps {
  advisoryTime: string;
}

function IntensityTooltip({ active, payload, label, advisoryTime }: IntensityTooltipProps) {
  if (!active || !payload || payload.length === 0 || typeof label !== "number") return null;
  const entries = payload.filter((p) => p.value != null);
  if (entries.length === 0) return null;

  const tauLabel = label === 0 ? "NOW" : cdtTickLabel(addHoursIso(advisoryTime, label));

  return (
    <div className="ipanel-tooltip">
      <div className="time">{tauLabel}</div>
      {entries.map((p) => (
        <div className="row" key={String(p.dataKey)}>
          <span className="sw" style={{ background: p.color }} />
          <span>{p.name}</span>
          <b>&nbsp;{Math.round(Number(p.value))} mph</b>
        </div>
      ))}
    </div>
  );
}

/**
 * Intensity guidance panel — each model's max-sustained-wind forecast
 * plotted against the Saffir-Simpson category ladder, under the map in
 * active mode only. Design per docs/superpowers/specs/two-moods-v2-mockup.html's
 * .ipanel block.
 */
export function IntensityPanel({ intensity, storm, track, visibleModels }: IntensityPanelProps) {
  const displayedSeries = useMemo(() => {
    const filtered = intensity.series.filter(
      (s) => ALWAYS_ON_MODELS.has(s.model) || visibleModels.has(s.model)
    );
    // OFCL drawn last so its white line stacks on top of the spaghetti,
    // matching the mockup.
    return [...filtered.filter((s) => s.model !== "OFCL"), ...filtered.filter((s) => s.model === "OFCL")];
  }, [intensity.series, visibleModels]);

  const [, yMax] = useMemo(() => yDomain(intensity.series), [intensity.series]);
  const maxTauH = useMemo(() => maxTau(intensity.series), [intensity.series]);
  const ticks = useMemo(() => buildTicks(maxTauH), [maxTauH]);
  const landfall = useMemo(() => landfallTau(track, intensity), [track, intensity]);

  const chartData = useMemo(() => {
    const taus = Array.from(new Set(displayedSeries.flatMap((s) => s.points.map((p) => p.tauH)))).sort(
      (a, b) => a - b
    );
    return taus.map((tauH) => {
      const row: Record<string, number> = { tauH };
      for (const s of displayedSeries) {
        const point = s.points.find((p) => p.tauH === tauH);
        if (point) row[s.model] = point.mph;
      }
      return row;
    });
  }, [displayedSeries]);

  const visibleBands = CATEGORY_BANDS.filter(
    (b) => Math.min(b.upper, yMax) - b.lower >= MIN_VISIBLE_BAND_MPH
  );

  return (
    <div className="ipanel">
      <div className="head">
        <div className="t">Intensity Guidance — max sustained winds, next {maxTauH} h</div>
        <div className="s">OFFICIAL NHC FORECAST IN WHITE · AI GUIDANCE DASHED</div>
      </div>
      <ResponsiveContainer width="100%" height={138}>
        <LineChart data={chartData} margin={{ top: 16, right: 46, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="tauH"
            type="number"
            domain={[0, maxTauH || 1]}
            ticks={ticks}
            tickFormatter={(value: number) =>
              value === 0 ? "NOW" : cdtTickLabel(addHoursIso(storm.advisoryTime, value))
            }
            stroke="var(--rule)"
            tick={{ fill: "var(--ink-dim)", fontSize: 9.5, fontFamily: "var(--font-mono)" }}
            tickLine={false}
          />
          <YAxis domain={[0, yMax]} hide />
          {visibleBands.map((b) => (
            <ReferenceArea
              key={b.label}
              y1={b.lower}
              y2={Math.min(b.upper, yMax)}
              fill={b.color}
              fillOpacity={1}
              stroke="none"
              ifOverflow="visible"
              label={{
                value: b.label,
                position: "insideTopRight",
                fill: "var(--ink-dim)",
                fontSize: 8.5,
                fontFamily: "var(--font-mono)",
              }}
            />
          ))}
          {landfall != null && (
            <ReferenceLine
              x={landfall}
              stroke="var(--accent-2)"
              strokeWidth={1}
              strokeDasharray="3 3"
              ifOverflow="visible"
              label={{
                value: "LANDFALL",
                // "top" — above the plot area entirely (in the enlarged
                // top margin), not "insideTopRight": the category bands'
                // own right-edge labels live inside the plot at the same
                // corner, and when the landfall tau lands at (or near) the
                // chart's rightmost edge the two would otherwise render at
                // the exact same coordinates (confirmed via a Playwright
                // text-node dump against the demo fixture, where landfall
                // is at the last available tau).
                position: "top",
                fill: "var(--accent-2)",
                fontSize: 8.5,
                fontFamily: "var(--font-mono)",
              }}
            />
          )}
          {displayedSeries.map((s) => (
            <Line
              key={s.model}
              dataKey={s.model}
              name={s.label}
              stroke={modelColor(s.model)}
              strokeWidth={s.model === "OFCL" ? 2.4 : 1.2}
              strokeDasharray={s.kind === "ai" ? "5 4" : undefined}
              dot={s.model === "OFCL" ? { r: 3, fill: "#fff", strokeWidth: 0 } : false}
              activeDot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          <Tooltip
            content={(props) => <IntensityTooltip {...props} advisoryTime={storm.advisoryTime} />}
            cursor={{ stroke: "var(--rule)" }}
            wrapperStyle={{ outline: "none" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
