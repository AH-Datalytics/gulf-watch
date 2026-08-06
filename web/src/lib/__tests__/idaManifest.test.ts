import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manifestUrl } from "../useDashboard";
import type { Manifest } from "../types";

// Regression pin for the Hurricane Ida flagship historical sample (v2
// addendum Round 2, built by ingest/scripts/build_ida_sample.py from real
// NHC/ATCF archives). Reads the actual committed fixture from disk rather
// than a copied-inline sample, so a future accidental re-run/edit of the
// build script that breaks the path-rewriting contract fails a test instead
// of silently shipping a broken /demo/ida.
const manifest: Manifest = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "public", "demo", "ida", "manifest.json"), "utf-8")
);
const demoRoot = join(__dirname, "..", "..", "..", "public", "demo");

function coordinatePairs(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return [[value[0], value[1]]];
  }
  return value.flatMap(coordinatePairs);
}

describe("Ida flagship sample manifest", () => {
  it("is served from the URL manifestUrl('ida') resolves", () => {
    expect(manifestUrl("ida")).toBe("/demo/ida/manifest.json");
  });

  it("is a single active storm with real advisory 6–10 replay frames", () => {
    expect(manifest.mode).toBe("active");
    expect(manifest.storms).toHaveLength(1);
    const ida = manifest.storms[0];
    expect(ida.id).toBe("al092021");
    expect(ida.name).toBe("Ida");
    expect(ida.advisoryNum).toBe("5");
    expect(ida.inGulfBox).toBe(true);
    expect(ida.advisories?.map((frame) => frame.advisoryNum)).toEqual(["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);
  });

  it("every storm file path is rewritten under ida/, relative to DEMO_BASE — same contract as bertha", () => {
    const ida = manifest.storms[0];
    for (const path of Object.values(ida.files)) {
      expect(path.startsWith("ida/")).toBe(true);
    }
    for (const frame of ida.advisories ?? []) {
      for (const path of Object.values(frame.files)) {
        expect(path.startsWith(`ida/advisories/${frame.advisoryNum.padStart(3, "0")}/`)).toBe(true);
      }
    }
  });

  it("carries a real windprob (34kt WSP shapefile) file — the shaded wind-probability layer's data source", () => {
    expect(manifest.storms[0].files.windprob).toContain("advisories/005/windprob.geojson");
    expect(manifest.storms[0].files.windprob50).toContain("advisories/005/windprob-58mph.geojson");
    expect(manifest.storms[0].files.windprob64).toContain("advisories/005/windprob-74mph.geojson");
  });

  it("carries the official advisory-time initial wind field", () => {
    expect(manifest.storms[0].files.windfield).toContain("advisories/005/windfield.geojson");
  });

  it("carries observed history and a time-matched GOES overlay", () => {
    const ida = manifest.storms[0];
    expect(ida.files.history).toContain("advisories/005/history.geojson");
    expect(ida.satellite?.issued).toBe("2021-08-27T15:01:17Z");
    expect(ida.satellite?.sourceLabel).toContain("GOES-16");
    expect(
      existsSync(join(__dirname, "..", "..", "..", "public", "demo", ida.satellite!.image))
    ).toBe(true);
    expect(ida.advisories?.every((frame) => frame.files.history && frame.satellite)).toBe(true);
  });

  it("carries an advisory-matched archived NEXRAD image for every frame", () => {
    for (const frame of manifest.storms[0].advisories ?? []) {
      expect(frame.radar?.issued).toBe(frame.advisoryTime);
      expect(frame.radar?.sourceLabel).toContain("NEXRAD");
      expect(
        frame.radar && existsSync(join(demoRoot, frame.radar.image))
      ).toBe(true);
    }
  });

  it("carries no fabricated rain/QPF product — the addendum explicitly allows shipping without one", () => {
    // Deliberately NOT part of the files contract (cone/track/wwlines/
    // models/intensity/text/probs only) — asserting its absence here pins
    // that no rain key was ever added without real data behind it.
    expect(Object.keys(manifest.storms[0].files)).not.toContain("rain");
  });

  it("ships every file referenced by every advisory frame", () => {
    for (const frame of manifest.storms[0].advisories ?? []) {
      for (const path of Object.values(frame.files)) expect(existsSync(join(demoRoot, path))).toBe(true);
      expect(frame.satellite && existsSync(join(demoRoot, frame.satellite.image))).toBe(true);
    }
  });

  it("removes non-Ida systems from the basin-wide wind-probability archives", () => {
    for (const frame of manifest.storms[0].advisories ?? []) {
      for (const path of [frame.files.windprob, frame.files.windprob50, frame.files.windprob64]) {
        const field: GeoJSON.FeatureCollection = JSON.parse(readFileSync(join(demoRoot, path!), "utf-8"));
        const longitudes = field.features
          .flatMap((feature) =>
            coordinatePairs("coordinates" in feature.geometry ? feature.geometry.coordinates : [])
          )
          .map(([lon]) => lon);
        expect(Math.min(...longitudes)).toBeGreaterThanOrEqual(-100);
        expect(Math.max(...longitudes)).toBeLessThanOrEqual(-75);
      }
    }
  });
});
