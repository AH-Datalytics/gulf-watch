import { describe, expect, it } from "vitest";
import {
  buildGraticule,
  excludeOfficialModel,
  outlookAreaLabel,
  outlookColor,
  polygonLabelPoint,
  trackPointLabel,
  withColor,
  WW_COLORS,
  wwColor,
  type ModeColors,
} from "../mapStyle";

// Both fixtures are real token sets (copied from globals.css), not just the
// quiet one: outlookColor() previously aliased --warn-ssw/--warn-hw, which
// match --outlook-low/--outlook-high by coincidence in quiet mode but diverge
// in active mode (--warn-ssw is storm-surge purple there) — a quiet-only
// fixture couldn't have caught that.
const QUIET_COLORS: ModeColors = {
  water: "#f4efe3",
  land: "#eae1ca",
  coast: "#6b5d45",
  grid: "#ddd2b8",
  gridLabel: "#b0a385",
  accent: "#1f3a5f",
  accent2: "#1f3a5f",
  warnHw: "#b3402e",
  warnSsw: "#d97b29",
  warnTsw: "#1f3a5f",
  outlookLow: "#d97b29",
  outlookHigh: "#b3402e",
};

const ACTIVE_COLORS: ModeColors = {
  water: "#0d1830",
  land: "#1a2a49",
  coast: "#33507e",
  grid: "#14213a",
  gridLabel: "#5f7495",
  accent: "#e9c46a",
  accent2: "#ff9a5c",
  warnHw: "#d94141",
  warnSsw: "#b04fd6",
  warnTsw: "#4a7fd4",
  outlookLow: "#d97b29",
  outlookHigh: "#b3402e",
};

describe("wwColor", () => {
  // Real NHC codes confirmed against a live fetch of
  // storms/al022026/wwlines.geojson and ingest/tests/test_shp.py.
  it("classifies real HWR as hurricane warning", () => {
    expect(wwColor("HWR")).toBe(WW_COLORS.hurricaneWarning);
  });
  it("classifies real HWA as hurricane watch", () => {
    expect(wwColor("HWA")).toBe(WW_COLORS.hurricaneWatch);
  });
  it("classifies real TWR as TS warning", () => {
    expect(wwColor("TWR")).toBe(WW_COLORS.tsWarning);
  });
  it("classifies real TWA as TS watch", () => {
    expect(wwColor("TWA")).toBe(WW_COLORS.tsWatch);
  });

  // Demo fixture (web/public/demo/wwlines.geojson) uses simplified codes.
  it("classifies demo HU as hurricane warning", () => {
    expect(wwColor("HU")).toBe(WW_COLORS.hurricaneWarning);
  });
  it("classifies demo TR as TS warning", () => {
    expect(wwColor("TR")).toBe(WW_COLORS.tsWarning);
  });
  it("classifies demo SS as storm surge", () => {
    expect(wwColor("SS")).toBe(WW_COLORS.surge);
  });

  it("is case-insensitive and defaults gracefully on missing/unknown codes", () => {
    expect(wwColor("hwr")).toBe(WW_COLORS.hurricaneWarning);
    expect(wwColor(undefined)).toBe(WW_COLORS.tsWarning);
  });
});

describe("outlookColor", () => {
  it("uses --outlook-low for low risk, in both modes", () => {
    expect(outlookColor("low", QUIET_COLORS)).toBe(QUIET_COLORS.outlookLow);
    expect(outlookColor("low", ACTIVE_COLORS)).toBe(ACTIVE_COLORS.outlookLow);
  });

  it("uses --outlook-high for medium and high risk, in both modes", () => {
    expect(outlookColor("medium", QUIET_COLORS)).toBe(QUIET_COLORS.outlookHigh);
    expect(outlookColor("high", QUIET_COLORS)).toBe(QUIET_COLORS.outlookHigh);
    expect(outlookColor("medium", ACTIVE_COLORS)).toBe(ACTIVE_COLORS.outlookHigh);
    expect(outlookColor("high", ACTIVE_COLORS)).toBe(ACTIVE_COLORS.outlookHigh);
  });

  it("never returns --warn-ssw/--warn-hw — those are a different semantic axis (Alerts.tsx severity, not genesis risk)", () => {
    // Regression check for the exact bug found in review: low-risk genesis
    // areas rendering in --warn-ssw's active-mode purple (#b04fd6) instead of
    // the intended orange.
    expect(outlookColor("low", ACTIVE_COLORS)).not.toBe(ACTIVE_COLORS.warnSsw);
    expect(outlookColor("low", ACTIVE_COLORS)).toBe("#d97b29");
    expect(outlookColor("high", ACTIVE_COLORS)).not.toBe(ACTIVE_COLORS.warnHw);
  });
});

describe("trackPointLabel", () => {
  it("builds a label from the demo fixture's category+label fields", () => {
    expect(trackPointLabel({ category: "2", label: "WED 4A" })).toBe("CAT 2 · WED 4A");
  });
  it("passes through non-numeric demo categories like TS", () => {
    expect(trackPointLabel({ category: "TS", label: "FRI 4P" })).toBe("TS · FRI 4P");
  });
  it("derives CAT N from real STORMTYPE=HU + MAXWIND (knots)", () => {
    // 90kt -> ~103.6mph -> Cat 2.
    expect(trackPointLabel({ STORMTYPE: "HU", MAXWIND: 90, DATELBL: "1:00 PM Wed" })).toBe(
      "CAT 2 · 1:00 PM Wed"
    );
  });
  it("shows the real STORMTYPE as-is for non-HU classifications", () => {
    expect(trackPointLabel({ STORMTYPE: "TS", DATELBL: "4:00 AM Thu" })).toBe("TS · 4:00 AM Thu");
    expect(trackPointLabel({ STORMTYPE: "TD", DATELBL: "1:00 AM Fri" })).toBe("TD · 1:00 AM Fri");
  });
  it("returns empty string with no usable properties", () => {
    expect(trackPointLabel(null)).toBe("");
    expect(trackPointLabel({})).toBe("");
  });
});

describe("outlookAreaLabel", () => {
  it("formats the 7-day probability", () => {
    expect(outlookAreaLabel({ PROB7DAY: "60%" })).toBe("60% · 7-DAY");
  });
  it("returns empty string when PROB7DAY is missing", () => {
    expect(outlookAreaLabel({})).toBe("");
  });
});

describe("polygonLabelPoint", () => {
  it("averages a polygon's exterior ring", () => {
    const [lon, lat] = polygonLabelPoint({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    })!;
    expect(lon).toBeCloseTo(0.8, 5); // (0+2+2+0+0)/5
    expect(lat).toBeCloseTo(0.8, 5);
  });

  it("returns null for a geometry type with no polygon ring", () => {
    expect(polygonLabelPoint({ type: "Point", coordinates: [0, 0] })).toBeNull();
  });
});

describe("buildGraticule", () => {
  it("generates evenly spaced meridian and parallel lines", () => {
    const { lines } = buildGraticule({ lonMin: -96, lonMax: -92, latMin: 20, latMax: 24 }, 2);
    // Meridians at -96, -94, -92 (3) + parallels at 20, 22, 24 (3) = 6 lines.
    expect(lines.features).toHaveLength(6);
  });

  it("keeps labels strictly inside the generation bbox (no edge-clipped labels)", () => {
    const { labels } = buildGraticule({ lonMin: -96, lonMax: -92, latMin: 20, latMax: 24 }, 2, 21, -95);
    for (const l of labels) {
      if (l.axis === "meridian") {
        expect(l.lon).toBeGreaterThan(-96);
        expect(l.lon).toBeLessThan(-92);
      }
    }
  });
});

describe("withColor", () => {
  it("injects a _color property computed per feature", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { TCWW: "HU" }, geometry: { type: "Point", coordinates: [0, 0] } },
      ],
    };
    const out = withColor(fc, (props) => wwColor(props?.TCWW as string));
    expect(out.features[0].properties?._color).toBe(WW_COLORS.hurricaneWarning);
  });

  it("returns an empty FeatureCollection for null/undefined input", () => {
    expect(withColor(undefined, () => "#fff").features).toHaveLength(0);
    expect(withColor(null, () => "#fff").features).toHaveLength(0);
  });
});

describe("excludeOfficialModel", () => {
  // Regression pin: OFCL/kind "official" must never reach the spaghetti
  // layers — the always-on white track (drawn from track.geojson, a
  // completely separate source) already covers it, and letting it double as
  // toggleable spaghetti let a user's "All models"/checkbox state make the
  // official track disappear entirely.
  it("strips kind === 'official' features, keeping every other kind", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { model: "OFCL", kind: "official" },
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        },
        {
          type: "Feature",
          properties: { model: "AVNO", kind: "physics" },
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        },
        {
          type: "Feature",
          properties: { model: "AIFS", kind: "ai" },
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        },
      ],
    };
    const out = excludeOfficialModel(fc);
    expect(out.features.map((f) => f.properties?.model).sort()).toEqual(["AIFS", "AVNO"]);
    expect(out.features.some((f) => f.properties?.kind === "official")).toBe(false);
  });

  it("returns an empty FeatureCollection for null/undefined input", () => {
    expect(excludeOfficialModel(undefined).features).toHaveLength(0);
    expect(excludeOfficialModel(null).features).toHaveLength(0);
  });
});
