import { describe, expect, it } from "vitest";
import { landfallTau } from "../landfall";
import type { IntensitySeries } from "../types";

// Copied verbatim from web/public/demo/track.geojson (2026-07-22 fixture):
// a five-point forecast track running from the central Gulf (25.0N) north
// to just past the coast (30.0N), crossing 29.2N between TAU 48 (28.3N) and
// TAU 72 (30.0N).
const DEMO_TRACK: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-85.0, 25.0],
          [-85.9, 25.8],
          [-86.8, 26.7],
          [-88.7, 28.3],
          [-90.5, 30.0],
        ],
      },
      properties: { shapefile: "al992026-014_5day_lin" },
    },
    { type: "Feature", geometry: { type: "Point", coordinates: [-85.0, 25.0] }, properties: { TAU: 0, MAXWIND: 105 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-85.9, 25.8] }, properties: { TAU: 12, MAXWIND: 110 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-86.8, 26.7] }, properties: { TAU: 24, MAXWIND: 105 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-88.7, 28.3] }, properties: { TAU: 48, MAXWIND: 95 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-90.5, 30.0] }, properties: { TAU: 72, MAXWIND: 50 } },
  ],
};

// Matches DEMO_TRACK's TAU grid exactly (copied shape from
// web/public/demo/intensity.json's tauH values).
const DEMO_INTENSITY: IntensitySeries = {
  cycle: "2026072212",
  series: [
    {
      model: "OFCL",
      label: "Official",
      kind: "official",
      points: [
        { tauH: 0, mph: 105 },
        { tauH: 12, mph: 110 },
        { tauH: 24, mph: 105 },
        { tauH: 48, mph: 95 },
        { tauH: 72, mph: 50 },
      ],
    },
  ],
};

describe("landfallTau", () => {
  it("returns the tau of the first north-crossing of 29.2N (demo fixture)", () => {
    expect(landfallTau(DEMO_TRACK, DEMO_INTENSITY)).toBe(72);
  });

  it("returns null when the track never reaches 29.2N (storm stays well south)", () => {
    const southTrack: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-85.0, 20.0] }, properties: { TAU: 0 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-85.5, 21.0] }, properties: { TAU: 12 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-86.0, 22.5] }, properties: { TAU: 24 } },
      ],
    };
    expect(landfallTau(southTrack, DEMO_INTENSITY)).toBeNull();
  });

  it("returns null when the track starts north of 29.2N already (no crossing, e.g. live Bertha)", () => {
    // Matches the real production shape (storms/al022026/track.geojson,
    // fetched 2026-07-23): first point already north of the line, then
    // drifting further west/slightly south — never a below->above transition.
    const alreadyNorthTrack: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-93.8, 29.9] }, properties: { TAU: 0 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-95.2, 29.7] }, properties: { TAU: 12 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-98.5, 29.3] }, properties: { TAU: 24 } },
      ],
    };
    expect(landfallTau(alreadyNorthTrack, DEMO_INTENSITY)).toBeNull();
  });

  it("returns null when the crossing tau has no matching intensity point", () => {
    const oddTauTrack: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-85.0, 25.0] }, properties: { TAU: 0 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-90.5, 30.0] }, properties: { TAU: 61 } },
      ],
    };
    expect(landfallTau(oddTauTrack, DEMO_INTENSITY)).toBeNull();
  });

  it("returns null for a missing track or intensity series", () => {
    expect(landfallTau(null, DEMO_INTENSITY)).toBeNull();
    expect(landfallTau(DEMO_TRACK, null)).toBeNull();
    expect(landfallTau(undefined, undefined)).toBeNull();
  });

  it("returns null for an empty track (no point features)", () => {
    expect(landfallTau({ type: "FeatureCollection", features: [] }, DEMO_INTENSITY)).toBeNull();
  });
});
