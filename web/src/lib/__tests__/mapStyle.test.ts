import { describe, expect, it } from "vitest";
import {
  buildGraticule,
  outlookAreaLabel,
  outlookColor,
  polygonLabelPoint,
  trackPointLabel,
  withColor,
  WW_COLORS,
  wwColor,
  type ModeColors,
} from "../mapStyle";

const COLORS: ModeColors = {
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
  ink: "#2b241a",
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
  it("uses the hurricane-warning token for high risk", () => {
    expect(outlookColor("high", COLORS)).toBe(COLORS.warnHw);
  });
  it("uses the storm-surge/low token for low or medium risk", () => {
    expect(outlookColor("low", COLORS)).toBe(COLORS.warnSsw);
    expect(outlookColor("medium", COLORS)).toBe(COLORS.warnSsw);
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
