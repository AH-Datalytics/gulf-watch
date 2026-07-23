import { describe, expect, it } from "vitest";
import { deriveAlertsState, filterMetroAlerts, type NWSAlertFeature } from "../alerts";

const orleansHurricaneWarning: NWSAlertFeature = {
  properties: {
    event: "Hurricane Warning",
    areaDesc: "Orleans; Jefferson",
    geocode: { SAME: ["022071", "022051"] },
  },
};

// Same event+area as above, from an adjacent polygon segment — must dedupe.
const duplicateOrleansHurricaneWarning: NWSAlertFeature = {
  properties: {
    event: "Hurricane Warning",
    areaDesc: "Orleans; Jefferson",
    geocode: { SAME: ["022071"] },
  },
};

// Rapides Parish — not one of the five metro SAME codes.
const nonMetroParishAlert: NWSAlertFeature = {
  properties: {
    event: "Flood Warning",
    areaDesc: "Rapides",
    geocode: { SAME: ["022079"] },
  },
};

const stTammanyTsWatch: NWSAlertFeature = {
  properties: {
    event: "Tropical Storm Watch",
    areaDesc: "St. Tammany",
    geocode: { SAME: ["022103"] },
  },
};

const surgeWarning: NWSAlertFeature = {
  properties: {
    event: "Storm Surge Warning",
    areaDesc: "Lake Pontchartrain",
    geocode: { SAME: ["022071"] },
  },
};

const orleansFloodAdvisory: NWSAlertFeature = {
  properties: {
    event: "Flood Advisory",
    areaDesc: "Orleans",
    geocode: { SAME: ["022071"] },
  },
};

describe("filterMetroAlerts", () => {
  it("keeps only alerts whose SAME codes intersect the metro parishes", () => {
    const rows = filterMetroAlerts([orleansHurricaneWarning, nonMetroParishAlert]);
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe("Hurricane Warning");
  });

  it("dedupes identical event+area pairs", () => {
    const rows = filterMetroAlerts([orleansHurricaneWarning, duplicateOrleansHurricaneWarning]);
    expect(rows).toHaveLength(1);
  });

  it("sorts Warning before Watch before Advisory", () => {
    const rows = filterMetroAlerts([orleansFloodAdvisory, stTammanyTsWatch, orleansHurricaneWarning]);
    expect(rows.map((r) => r.event)).toEqual([
      "Hurricane Warning",
      "Tropical Storm Watch",
      "Flood Advisory",
    ]);
  });

  it("colors Hurricane Warning red, Storm Surge purple, Tropical Storm blue, else the rule token", () => {
    const rows = filterMetroAlerts([
      orleansHurricaneWarning,
      surgeWarning,
      stTammanyTsWatch,
      orleansFloodAdvisory,
    ]);
    const byEvent = Object.fromEntries(rows.map((r) => [r.event, r.color]));
    expect(byEvent["Hurricane Warning"]).toBe("#d94141");
    expect(byEvent["Storm Surge Warning"]).toBe("#b04fd6");
    expect(byEvent["Tropical Storm Watch"]).toBe("#4a7fd4");
    expect(byEvent["Flood Advisory"]).toBe("var(--rule)");
  });

  it("returns an empty array for no features", () => {
    expect(filterMetroAlerts([])).toEqual([]);
  });
});

describe("deriveAlertsState", () => {
  it("is unavailable when there's an error and no data has ever loaded", () => {
    const state = deriveAlertsState(undefined, new Error("fetch failed"));
    expect(state).toEqual({ rows: [], unavailable: true });
  });

  it("is NOT unavailable while the initial request is simply still in flight (no error yet)", () => {
    const state = deriveAlertsState(undefined, undefined);
    expect(state).toEqual({ rows: [], unavailable: false });
  });

  it("prefers stale cached data over a transient revalidation error — NOT unavailable", () => {
    // SWR's actual behavior: `data` stays as the last successful response
    // while `error` is also set, when a background revalidation fails.
    const state = deriveAlertsState({ features: [orleansHurricaneWarning] }, new Error("revalidation failed"));
    expect(state.unavailable).toBe(false);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].event).toBe("Hurricane Warning");
  });

  it("derives rows from data with no error", () => {
    const state = deriveAlertsState({ features: [orleansHurricaneWarning, nonMetroParishAlert] }, undefined);
    expect(state).toEqual({
      rows: [
        {
          key: "Hurricane Warning|Orleans; Jefferson",
          event: "Hurricane Warning",
          areaDesc: "Orleans; Jefferson",
          color: "#d94141",
        },
      ],
      unavailable: false,
    });
  });
});
