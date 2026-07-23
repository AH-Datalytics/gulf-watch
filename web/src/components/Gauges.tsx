"use client";

import useSWR from "swr";
import { Area, ComposedChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { Mode } from "@/lib/types";
import {
  fetchGauge,
  GAUGE_STATIONS,
  deriveGaugeState,
  type GaugePoint,
  type GaugeSeries,
} from "@/lib/coops";

const REFRESH_MS = 6 * 60 * 1000;
// "Rising" arrow threshold per the brief: last-6h trend > +0.15 ft, active
// mode only (mirrors the mockup's "+3.1 ft ↑").
const TREND_WINDOW_MS = 6 * 3600 * 1000;
const TREND_THRESHOLD_FT = 0.15;

function timeMs(t: string): number {
  return new Date(t.replace(" ", "T")).getTime();
}

/** True when the observed level has risen more than TREND_THRESHOLD_FT over the trailing 6h window. */
function isRisingTrend(points: GaugePoint[]): boolean {
  if (points.length < 2) return false;
  const last = points[points.length - 1];
  const cutoff = timeMs(last.t) - TREND_WINDOW_MS;
  const baseline = points.find((p) => timeMs(p.t) >= cutoff) ?? points[0];
  return last.obs - baseline.obs > TREND_THRESHOLD_FT;
}

/** Padded [min, max] domain covering both observed and predicted values — never inverted, never NaN, even for flat or empty series. */
function yDomain(points: GaugePoint[]): [number, number] {
  if (points.length === 0) return [0, 1];

  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    min = Math.min(min, p.obs, p.pred ?? p.obs);
    max = Math.max(max, p.obs, p.pred ?? p.obs);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];

  if (min === max) {
    // Flat series (or a single point) — pad symmetrically so the domain
    // isn't zero-width (which Recharts would otherwise render as a
    // collapsed/invisible line).
    return [min - 0.5, max + 0.5];
  }
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

function formatDeparture(departure: number | null, rising: boolean): string {
  if (departure === null) return "—";
  // Avoid a "-0.0 ft" readout from floating-point rounding of a near-zero
  // negative departure.
  const rounded = Math.abs(departure) < 0.05 ? 0 : departure;
  const sign = rounded >= 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)} ft${rising ? " ↑" : ""}`;
}

interface GaugeCardProps {
  stationId: string;
  name: string;
  mode: Mode;
}

function GaugeCard({ stationId, name, mode }: GaugeCardProps) {
  const { data, error } = useSWR<GaugeSeries>(`gauge-${stationId}`, () => fetchGauge(stationId), {
    refreshInterval: REFRESH_MS,
  });
  const { series, unavailable } = deriveGaugeState(data, error);

  if (unavailable) {
    return (
      <div className="gauge">
        <div className="name">
          <b>{name}</b>
        </div>
        <p className="gauge-unavailable">Gauge unavailable</p>
      </div>
    );
  }

  if (!series) {
    // Still loading (no data, no error yet) — render the header only, same
    // "don't show anything misleading before the first successful load"
    // stance as Alerts.
    return (
      <div className="gauge">
        <div className="name">
          <b>{name}</b>
        </div>
      </div>
    );
  }

  const rising = mode === "active" && isRisingTrend(series.points);
  const hasBand = series.points.some((p) => p.pred !== undefined);
  const [yMin, yMax] = yDomain(series.points);
  const lineColor = mode === "active" ? "var(--accent-2)" : "var(--accent)";

  return (
    <div className="gauge">
      <div className="name">
        <b>{name}</b>
        <span className="val num">{formatDeparture(series.departure, rising)}</span>
      </div>
      <ResponsiveContainer width="100%" height={44}>
        <ComposedChart data={series.points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis domain={[yMin, yMax]} hide />
          {hasBand && (
            <Area
              type="monotone"
              dataKey="pred"
              stroke="none"
              fill="var(--gauge-band)"
              isAnimationActive={false}
              connectNulls
            />
          )}
          <Line
            type="monotone"
            dataKey="obs"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface GaugesProps {
  mode: Mode;
}

/**
 * Live NOAA CO-OPS tide gauge sparklines for the three metro stations — the
 * during-the-event surge-watching feature. Fetches directly from CO-OPS on
 * the client (same live-in-all-modes stance as Alerts), refreshing every 6
 * minutes. Each gauge fails independently: one station being unreachable
 * doesn't affect the other two.
 */
export function Gauges({ mode }: GaugesProps) {
  return (
    <div>
      <div className="kicker">
        {mode === "active" ? "Water Levels — last 48 hours" : "Lakefront & Coastal Gauges — last 48 hours"}
      </div>
      {GAUGE_STATIONS.map((station) => (
        <GaugeCard key={station.id} stationId={station.id} name={station.name} mode={mode} />
      ))}
    </div>
  );
}
