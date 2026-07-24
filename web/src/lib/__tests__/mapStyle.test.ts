import { describe, expect, it } from "vitest";
import {
  allModelCodes,
  buildGraticule,
  excludeOfficialModel,
  hasAiGuidance,
  mergeFeatureCollections,
  modelRows,
  outlookAreaLabel,
  outlookColor,
  polygonLabelPoint,
  resolveGroup,
  trackPointLabel,
  WIND_PROB_BANDS,
  windProbColor,
  withColor,
  WW_COLORS,
  wwColor,
  type ModeColors,
} from "../mapStyle";

function line(properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature {
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
  };
}

// Real token set (copied from globals.css's v2 single light theme) plus a
// synthetic "alternate" set, so outlookColor()'s independence from
// --warn-ssw/--warn-hw is still verified against a palette where those two
// diverge from --outlook-low/--outlook-high (rather than only ever matching
// by coincidence).
const QUIET_COLORS: ModeColors = {
  grid: "rgba(255, 255, 255, 0.45)",
  gridLabel: "rgba(255, 255, 255, 0.92)",
  accent: "#1f3a5f",
  accent2: "#c2703d",
  warnHw: "#c0392b",
  warnSsw: "#8e44ad",
  warnTsw: "#2f6fae",
  outlookLow: "#d97b29",
  outlookHigh: "#b3402e",
};

const ACTIVE_COLORS: ModeColors = {
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

describe("hasAiGuidance", () => {
  // N9: ModelLegend's "AI Guidance" group must only render when there's a
  // real kind==="ai" feature to show — the demo Solene fixture has one,
  // but the live feed and ?demo=bertha never do (AIFS is stubbed to always
  // return [], see ingest/gulfwatch/aifs.py).
  it("is false for undefined/null models", () => {
    expect(hasAiGuidance(undefined)).toBe(false);
    expect(hasAiGuidance(null)).toBe(false);
  });

  it("is false for an empty FeatureCollection", () => {
    expect(hasAiGuidance({ type: "FeatureCollection", features: [] })).toBe(false);
  });

  it("is false when every feature is physics/consensus/official, no ai kind present", () => {
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
      ],
    };
    expect(hasAiGuidance(fc)).toBe(false);
  });

  it("is true when at least one feature is kind === 'ai'", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
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
    expect(hasAiGuidance(fc)).toBe(true);
  });
});

describe("resolveGroup", () => {
  // Round 2 (v2 addendum): models.geojson features carry an explicit
  // "group" property going forward — the whitelist/grouping expansion in
  // ingest/gulfwatch/adeck.py.
  it("uses the explicit group property when present", () => {
    expect(resolveGroup({ kind: "physics", group: "ensemble" })).toBe("ensemble");
    expect(resolveGroup({ kind: "consensus", group: "consensus" })).toBe("consensus");
  });

  // Backward compatibility: bertha's committed fixture and the live blob
  // store (until its next ingest redeploy) predate the "group" property
  // entirely.
  it("falls back to kind-based defaults when group is absent", () => {
    expect(resolveGroup({ kind: "official" })).toBe("official");
    expect(resolveGroup({ kind: "consensus" })).toBe("consensus");
    expect(resolveGroup({ kind: "physics" })).toBe("deterministic");
    expect(resolveGroup({ kind: "ai" })).toBe("deterministic");
  });

  it("defaults to deterministic for missing/unrecognized properties", () => {
    expect(resolveGroup(null)).toBe("deterministic");
    expect(resolveGroup({})).toBe("deterministic");
  });
});

describe("modelRows / allModelCodes", () => {
  const models: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      line({ model: "OFCL", label: "Official", kind: "official", group: "official" }),
      line({ model: "AVNO", label: "GFS", kind: "physics", group: "deterministic" }),
      line({ model: "AVNO", label: "GFS", kind: "physics", group: "deterministic" }), // duplicate, e.g. a second line segment
      line({ model: "TVCA", label: "Consensus", kind: "consensus", group: "consensus" }),
      line({ model: "AP01", label: "GEFS 01", kind: "ensemble", group: "ensemble" }),
      line({ model: "AP02", label: "GEFS 02", kind: "ensemble", group: "ensemble" }),
    ],
  };

  it("excludes group===official and dedupes by model code", () => {
    const rows = modelRows(models);
    expect(rows.map((r) => r.code).sort()).toEqual(["AP01", "AP02", "AVNO", "TVCA"]);
    expect(rows.find((r) => r.code === "OFCL")).toBeUndefined();
  });

  it("returns an empty array for null/undefined input", () => {
    expect(modelRows(null)).toEqual([]);
    expect(modelRows(undefined)).toEqual([]);
  });

  it("allModelCodes mirrors modelRows' codes", () => {
    expect(allModelCodes(models).sort()).toEqual(["AP01", "AP02", "AVNO", "TVCA"]);
  });
});

describe("windProbColor", () => {
  // Real PERCENTAGE values confirmed against the Hurricane Ida archive's
  // 2021082718_wsp34knt120hr_5km shapefile (11 graduated bands).
  it("maps every real NHC WSP percentage band to a distinct color", () => {
    const bands = [
      "<5%", "5-10%", "10-20%", "20-30%", "30-40%", "40-50%",
      "50-60%", "60-70%", "70-80%", "80-90%", ">90%",
    ];
    const colors = bands.map(windProbColor);
    expect(new Set(colors).size).toBe(bands.length); // all distinct
  });

  it("falls back to a neutral color for an unrecognized/missing band", () => {
    expect(windProbColor("bogus")).toBe("#8a94a3");
    expect(windProbColor(undefined)).toBe("#8a94a3");
    expect(windProbColor(null)).toBe("#8a94a3");
  });
});

describe("WIND_PROB_BANDS", () => {
  // Backs the Layers control's wind-probability legend (Round 2 addendum).
  it("has all 11 real NHC WSP bands, low to high, matching windProbColor", () => {
    expect(WIND_PROB_BANDS.map((b) => b.label)).toEqual([
      "<5%", "5-10%", "10-20%", "20-30%", "30-40%", "40-50%",
      "50-60%", "60-70%", "70-80%", "80-90%", ">90%",
    ]);
    for (const band of WIND_PROB_BANDS) {
      expect(band.color).toBe(windProbColor(band.label));
    }
  });
});

describe("mergeFeatureCollections", () => {
  // B2 (final review): every non-selected storm's cone gets merged into one
  // FeatureCollection for a single shared MapLibre source/layer pair.
  it("concatenates features from multiple FeatureCollections", () => {
    const a: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { id: "a" }, geometry: { type: "Point", coordinates: [0, 0] } }],
    };
    const b: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { id: "b" }, geometry: { type: "Point", coordinates: [1, 1] } }],
    };
    const out = mergeFeatureCollections([a, b]);
    expect(out.type).toBe("FeatureCollection");
    expect(out.features.map((f) => f.properties?.id)).toEqual(["a", "b"]);
  });

  it("skips undefined/null entries without erroring", () => {
    const a: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { id: "a" }, geometry: { type: "Point", coordinates: [0, 0] } }],
    };
    const out = mergeFeatureCollections([a, undefined, null]);
    expect(out.features).toHaveLength(1);
  });

  it("returns an empty FeatureCollection for an empty list", () => {
    expect(mergeFeatureCollections([]).features).toHaveLength(0);
  });
});
