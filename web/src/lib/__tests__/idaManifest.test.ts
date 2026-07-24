import { readFileSync } from "node:fs";
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

describe("Ida flagship sample manifest", () => {
  it("is served from the URL manifestUrl('ida') resolves", () => {
    expect(manifestUrl("ida")).toBe("/demo/ida/manifest.json");
  });

  it("is a single active storm: Hurricane Ida, al092021, advisory 6", () => {
    expect(manifest.mode).toBe("active");
    expect(manifest.storms).toHaveLength(1);
    const ida = manifest.storms[0];
    expect(ida.id).toBe("al092021");
    expect(ida.name).toBe("Ida");
    expect(ida.advisoryNum).toBe("6");
    expect(ida.inGulfBox).toBe(true);
  });

  it("every storm file path is rewritten under ida/, relative to DEMO_BASE — same contract as bertha", () => {
    const ida = manifest.storms[0];
    for (const path of Object.values(ida.files)) {
      expect(path.startsWith("ida/")).toBe(true);
    }
  });

  it("carries a real windprob (34kt WSP shapefile) file — the shaded wind-probability layer's data source", () => {
    expect(manifest.storms[0].files.windprob).toBe("ida/windprob.geojson");
  });

  it("carries no fabricated rain/QPF product — the addendum explicitly allows shipping without one", () => {
    // Deliberately NOT part of the files contract (cone/track/wwlines/
    // models/intensity/text/probs only) — asserting its absence here pins
    // that no rain key was ever added without real data behind it.
    expect(Object.keys(manifest.storms[0].files)).not.toContain("rain");
  });
});
