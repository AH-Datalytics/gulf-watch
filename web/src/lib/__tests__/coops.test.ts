import { describe, expect, it } from "vitest";
import { deriveGaugeState, toSeries, type CoopsPredictionsResponse, type CoopsWaterLevelResponse } from "../coops";

import newCanalWater from "./fixtures/water_8761927_new_canal.json";
import newCanalPred from "./fixtures/pred_8761927_new_canal.json";
import shellBeachWater from "./fixtures/water_8761305_shell_beach.json";
import shellBeachPred from "./fixtures/pred_8761305_shell_beach.json";
import grandIsleWater from "./fixtures/water_8761724_grand_isle.json";
import grandIslePred from "./fixtures/pred_8761724_grand_isle.json";

describe("toSeries — real CO-OPS fixtures", () => {
  // Fixtures are trimmed (~3h of 6-min observations + ~8 hourly predictions)
  // real responses fetched from api.tidesandcurrents.noaa.gov on 2026-07-23.
  // All three metro stations returned harmonic predictions on this fetch —
  // none of them turned out to lack predictions (the brief flagged New Canal
  // as the likely no-predictions case, but that's not what the live API
  // returned this time), so the missing-predictions/null-departure branch
  // below is exercised with a synthetic predJson instead.

  it("New Canal: derives points, latest, and departure from real data", () => {
    const series = toSeries(
      newCanalWater as CoopsWaterLevelResponse,
      newCanalPred as CoopsPredictionsResponse
    );
    expect(series.points).toHaveLength(30);
    expect(series.latest).toBeCloseTo(2.103, 3);
    // Last obs (10:48) is past the last hourly prediction (10:00, v=0.383),
    // so the interpolated prediction clamps to that last row's value.
    expect(series.departure).toBeCloseTo(2.103 - 0.383, 3);
    expect(series.points[series.points.length - 1].pred).toBeCloseTo(0.383, 3);
  });

  it("Shell Beach: derives departure from real data", () => {
    const series = toSeries(
      shellBeachWater as CoopsWaterLevelResponse,
      shellBeachPred as CoopsPredictionsResponse
    );
    expect(series.latest).toBeCloseTo(2.772, 3);
    expect(series.departure).toBeCloseTo(2.772 - 1.404, 3);
  });

  it("Grand Isle: every point gets a real numeric obs value", () => {
    const series = toSeries(
      grandIsleWater as CoopsWaterLevelResponse,
      grandIslePred as CoopsPredictionsResponse
    );
    expect(series.points.length).toBeGreaterThan(0);
    for (const p of series.points) {
      expect(Number.isFinite(p.obs)).toBe(true);
    }
  });

  it("interpolates a mid-hour observation between two hourly predictions", () => {
    const water: CoopsWaterLevelResponse = {
      data: [{ t: "2026-07-23 09:30", v: "1.0" }],
    };
    // 09:00 -> 0.325, 10:00 -> 0.383; 09:30 is the midpoint.
    const series = toSeries(water, newCanalPred as CoopsPredictionsResponse);
    const midPred = series.points[0].pred;
    expect(midPred).toBeCloseTo((0.325 + 0.383) / 2, 3);
  });
});

describe("toSeries — edge cases", () => {
  it("null departure when predictions are missing entirely", () => {
    const water: CoopsWaterLevelResponse = {
      data: [
        { t: "2026-07-23 10:00", v: "1.5" },
        { t: "2026-07-23 10:06", v: "1.6" },
      ],
    };
    const series = toSeries(water, null);
    expect(series.latest).toBeCloseTo(1.6, 3);
    expect(series.departure).toBeNull();
    expect(series.points.every((p) => p.pred === undefined)).toBe(true);
  });

  it("null departure when predictions response is present but empty", () => {
    const water: CoopsWaterLevelResponse = {
      data: [{ t: "2026-07-23 10:00", v: "1.5" }],
    };
    const series = toSeries(water, { predictions: [] });
    expect(series.departure).toBeNull();
  });

  it("empty water data -> empty points, latest 0, departure null", () => {
    const series = toSeries({ data: [] }, { predictions: [] });
    expect(series).toEqual({ points: [], latest: 0, departure: null });
  });

  it("missing water/pred fields entirely (undefined) behaves like empty arrays", () => {
    expect(toSeries(undefined, undefined)).toEqual({ points: [], latest: 0, departure: null });
    expect(toSeries(null, null)).toEqual({ points: [], latest: 0, departure: null });
  });

  it("skips non-numeric or blank 'v' rows instead of crashing", () => {
    const water: CoopsWaterLevelResponse = {
      data: [
        { t: "2026-07-23 10:00", v: "1.5" },
        { t: "2026-07-23 10:06", v: "" },
        { t: "2026-07-23 10:12", v: "-" },
        { t: "2026-07-23 10:18", v: "1.8" },
      ],
    };
    const series = toSeries(water, null);
    expect(series.points).toHaveLength(2);
    expect(series.points.map((p) => p.obs)).toEqual([1.5, 1.8]);
    expect(series.latest).toBeCloseTo(1.8, 3);
  });

  it("a CO-OPS error envelope on predictions is treated as no predictions", () => {
    const water: CoopsWaterLevelResponse = {
      data: [{ t: "2026-07-23 10:00", v: "1.5" }],
    };
    const series = toSeries(water, { error: { message: "No data was found." } });
    expect(series.departure).toBeNull();
  });
});

describe("deriveGaugeState", () => {
  const sample = { points: [{ t: "2026-07-23 10:00", obs: 1.5 }], latest: 1.5, departure: null };

  it("is unavailable when there's an error and no data has ever loaded", () => {
    expect(deriveGaugeState(undefined, new Error("fetch failed"))).toEqual({
      series: null,
      unavailable: true,
    });
  });

  it("is NOT unavailable while the initial request is still in flight (no error yet)", () => {
    expect(deriveGaugeState(undefined, undefined)).toEqual({ series: null, unavailable: false });
  });

  it("prefers stale cached data over a transient revalidation error", () => {
    const state = deriveGaugeState(sample, new Error("revalidation failed"));
    expect(state.unavailable).toBe(false);
    expect(state.series).toEqual(sample);
  });

  it("derives series from data with no error", () => {
    expect(deriveGaugeState(sample, undefined)).toEqual({ series: sample, unavailable: false });
  });
});
