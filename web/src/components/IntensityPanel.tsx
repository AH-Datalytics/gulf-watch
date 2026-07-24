"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
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
  /** Fully hides the panel (same effect as unchecking "Graphs" in the map's
   *  Layers control) — rendered as a small × next to the collapse handle. */
  onClose: () => void;
}

// Series with no map-toggle checkbox in ModelLegend (they're intensity-only
// statistical/consensus guidance with no forecast track to draw) — these
// always render here regardless of `visibleModels`, same as OFCL, because
// there's no other UI for a user to ever make them visible otherwise. IVCN
// (Intensity Consensus) joined DSHP/LGEM in Round 2 — it structurally has
// no ATCF position either (see ingest/gulfwatch/adeck.py's INTENSITY_ONLY).
const ALWAYS_ON_MODELS = new Set(["OFCL", "DSHP", "LGEM", "IVCN"]);

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
  { lower: CATEGORY_THRESHOLDS_MPH.C4, upper: CATEGORY_THRESHOLDS_MPH.C5, label: "CAT 4", color: "var(--band-4)" },
  { lower: CATEGORY_THRESHOLDS_MPH.C5, upper: Infinity, label: "CAT 5", color: "var(--band-5)" },
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

/** Y-axis ticks every 25 mph from 0 to yMax inclusive (yMax is itself always
 *  a multiple of 25 — see yDomain above). */
function buildYTicks(yMax: number): number[] {
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += 25) ticks.push(v);
  return ticks;
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

function categoryLabel(mph: number): string {
  if (mph >= CATEGORY_THRESHOLDS_MPH.C5) return "Category 5";
  if (mph >= CATEGORY_THRESHOLDS_MPH.C4) return "Category 4";
  if (mph >= CATEGORY_THRESHOLDS_MPH.C3) return "Category 3";
  if (mph >= CATEGORY_THRESHOLDS_MPH.C2) return "Category 2";
  if (mph >= CATEGORY_THRESHOLDS_MPH.C1) return "Category 1";
  if (mph >= CATEGORY_THRESHOLDS_MPH.TS) return "Tropical storm";
  return "Below tropical-storm force";
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
export function IntensityPanel({ intensity, storm, track, visibleModels, onClose }: IntensityPanelProps) {
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
  const yTicks = useMemo(() => buildYTicks(yMax), [yMax]);
  const landfall = useMemo(() => landfallTau(track, intensity), [track, intensity]);
  const officialPeak = useMemo(() => {
    const official = intensity.series.find((series) => series.model === "OFCL");
    return official ? Math.max(...official.points.map((point) => point.mph)) : null;
  }, [intensity.series]);

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
        <div>
          <div className="t">Intensity forecast</div>
          <div className="s">Maximum sustained winds · next {maxTauH} hours</div>
        </div>
        {officialPeak != null && (
          <div className="ipanel-peak">
            <span>Official peak</span>
            <b>{Math.round(officialPeak)} mph</b>
            <small>{categoryLabel(officialPeak)}</small>
          </div>
        )}
        <div className="ipanel-controls">
          <button type="button" className="ipanel-btn" onClick={onClose} title="Close intensity">
            ×
          </button>
        </div>
      </div>
      <div className="ipanel-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 46, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="tauH"
            type="number"
            domain={[0, maxTauH || 1]}
            ticks={ticks}
            tickFormatter={(value: number) =>
              value === 0 ? "Now" : cdtTickLabel(addHoursIso(storm.advisoryTime, value))
            }
            stroke="var(--rule)"
            tick={{ fill: "var(--ink-dim)", fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            domain={[0, yMax]}
            ticks={yTicks}
            tickFormatter={(value: number) => `${value}`}
            width={44}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--ink-dim)", fontSize: 12 }}
            label={{
              value: "mph",
              angle: -90,
              position: "insideLeft",
              fill: "var(--ink-dim)",
              fontSize: 11.5,
            }}
          />
          <CartesianGrid horizontal vertical={false} stroke="var(--rule)" strokeDasharray="3 3" />
          {visibleBands.map((b) => (
            <ReferenceArea
              key={b.label}
              y1={b.lower}
              y2={Math.min(b.upper, yMax)}
              fill={b.color}
              fillOpacity={0.14}
              stroke="none"
              ifOverflow="visible"
              label={{
                value: b.label,
                position: "insideTopRight",
                fill: "#52676c",
                fontSize: 11,
              }}
            />
          ))}
          {landfall != null && (
            <ReferenceLine
              x={landfall}
              stroke="var(--accent-2)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              ifOverflow="visible"
              label={{
                value: "Landfall",
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
                fontSize: 11.5,
                fontWeight: 600,
              }}
            />
          )}
          {displayedSeries.map((s) => (
            <Line
              key={s.model}
              dataKey={s.model}
              name={s.label}
              stroke={modelColor(s.model)}
              strokeWidth={s.model === "OFCL" ? 2.8 : 1.6}
              strokeDasharray={s.kind === "ai" ? "5 4" : undefined}
              dot={s.model === "OFCL" ? { r: 3.5, fill: "var(--accent)", strokeWidth: 0 } : false}
              activeDot={{ r: 3.5 }}
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
      <div className="ipanel-legend" aria-label="Visible intensity guidance">
        {displayedSeries.map((series) => (
          <span key={series.model} className={series.model === "OFCL" ? "official" : ""}>
            <i style={{ background: modelColor(series.model) }} />
            {series.model === "OFCL" ? "Official NHC" : series.label}
          </span>
        ))}
      </div>
    </div>
  );
}
