import { describe, expect, it } from "vitest";
import { computeStale, demoTag, manifestUrl, otherStorms, selectStorm } from "../useDashboard";
import type { Manifest, StormEntry } from "../types";

// Pure demo-variant -> manifest URL / map-corner tag mapping (Task 12: the
// ?demo=bertha archive replay). Only these two pure functions are exercised
// here — useDashboard() itself is a client hook (useSWR/useSyncExternalStore)
// and isn't unit-tested at this level.

describe("manifestUrl", () => {
  it("live (non-demo) fetches the Blob-hosted manifest", () => {
    expect(manifestUrl(null)).toBe("/manifest.json");
  });

  it("?demo=ida fetches the Hurricane Ida historical-sample manifest", () => {
    expect(manifestUrl("ida")).toBe("/demo/ida/manifest.json");
  });

  it("?demo=quiet fetches the quiet-mode demo manifest", () => {
    expect(manifestUrl("quiet")).toBe("/demo/manifest-quiet.json");
  });

  it("?demo=bertha fetches the archived Bertha manifest", () => {
    expect(manifestUrl("bertha")).toBe("/demo/bertha/manifest.json");
  });

  // Round 2 (v2 addendum): the fictional Hurricane Solene demo (formerly
  // ?demo=1) was retired once the real Ida historical sample landed — any
  // unrecognized demo value now falls back to Ida instead of Solene.
  it("?demo=1 (formerly Solene) now falls back to the Ida flagship sample", () => {
    expect(manifestUrl("1")).toBe("/demo/ida/manifest.json");
  });

  it("any other non-null demo value falls back to the Ida flagship sample", () => {
    expect(manifestUrl("anything-else")).toBe("/demo/ida/manifest.json");
  });
});

describe("demoTag", () => {
  it("is null when not in demo mode", () => {
    expect(demoTag(null)).toBeNull();
  });

  it("?demo=ida uses the historical-sample tag", () => {
    expect(demoTag("ida")).toBe("HISTORICAL SAMPLE — HURRICANE IDA · AUG 27 2021");
  });

  it("?demo=quiet uses the simulated-storm tag (unchanged from before Task 12)", () => {
    expect(demoTag("quiet")).toBe("SIMULATED STORM — DEMO DATA");
  });

  it("?demo=bertha uses the archived-data tag, not 'SIMULATED'", () => {
    const tag = demoTag("bertha");
    expect(tag).toBe("ARCHIVED DATA — TS BERTHA · ADV 016 · JUL 23 2026");
    expect(tag).not.toContain("SIMULATED");
  });

  it("?demo=1 (formerly Solene) now uses the Ida historical-sample tag", () => {
    expect(demoTag("1")).toBe("HISTORICAL SAMPLE — HURRICANE IDA · AUG 27 2021");
  });
});

// N4 (final review): demo showcases replay a fixed, long-past `generated`
// timestamp on purpose — the staleness banner must never appear for them,
// no matter how old that timestamp is.
describe("computeStale", () => {
  const ANCIENT_MANIFEST: Manifest = {
    generated: "2000-01-01T00:00:00Z",
    mode: "active",
    storms: [],
    outlook: { geojson: "outlook.geojson", text: "outlook.json", issued: "2000-01-01T00:00:00Z" },
    errors: [],
  };

  it("is false in demo mode even for a very old `generated` timestamp", () => {
    expect(computeStale(ANCIENT_MANIFEST, "active", true)).toBe(false);
    expect(computeStale(ANCIENT_MANIFEST, "quiet", true)).toBe(false);
  });

  it("is true for a live (non-demo) manifest past its mode's threshold", () => {
    expect(computeStale(ANCIENT_MANIFEST, "active", false)).toBe(true);
    expect(computeStale(ANCIENT_MANIFEST, "quiet", false)).toBe(true);
  });

  it("is false with no manifest yet, live or demo", () => {
    expect(computeStale(undefined, "quiet", false)).toBe(false);
    expect(computeStale(undefined, "quiet", true)).toBe(false);
  });

  it("is false for a fresh live manifest within threshold", () => {
    const fresh: Manifest = { ...ANCIENT_MANIFEST, generated: new Date().toISOString() };
    expect(computeStale(fresh, "active", false)).toBe(false);
  });
});

// B2 (final review): v1 shows all cones, detail for strongest Gulf threat —
// selectStorm picks the one storm that gets full map/rail detail; otherStorms
// is everything else, which gets a cone + name label only.
function makeStorm(overrides: Partial<StormEntry>): StormEntry {
  return {
    id: "al992026",
    name: "Solene",
    classification: "HU",
    intensityMph: 105,
    pressureMb: 967,
    movementDir: "NW",
    movementMph: 12,
    lat: 26.0,
    lon: -88.0,
    advisoryNum: "14",
    advisoryTime: "2026-07-22T21:00:00Z",
    nextAdvisoryTime: "2026-07-23T03:00:00Z",
    inGulfBox: true,
    modelCycle: "2026072212",
    files: {
      cone: "cone.geojson",
      track: "track.geojson",
      wwlines: "wwlines.geojson",
      models: "models.geojson",
      intensity: "intensity.json",
      text: "text.json",
      probs: "probs.json",
    },
    ...overrides,
  };
}

describe("selectStorm", () => {
  it("returns null for no storms", () => {
    expect(selectStorm([])).toBeNull();
  });

  it("picks the strongest inGulfBox storm over a stronger out-of-Gulf storm", () => {
    const solene = makeStorm({ id: "al992026", name: "Solene", intensityMph: 105, inGulfBox: true });
    const tobias = makeStorm({ id: "al982026", name: "Tobias", intensityMph: 50, inGulfBox: true });
    const strongerButOutside = makeStorm({
      id: "ep012026",
      name: "Outside",
      intensityMph: 150,
      inGulfBox: false,
    });
    expect(selectStorm([tobias, solene, strongerButOutside])?.id).toBe("al992026");
  });

  it("falls back to the strongest storm overall when none are inGulfBox", () => {
    const weak = makeStorm({ id: "a", intensityMph: 40, inGulfBox: false });
    const strong = makeStorm({ id: "b", intensityMph: 90, inGulfBox: false });
    expect(selectStorm([weak, strong])?.id).toBe("b");
  });
});

describe("otherStorms", () => {
  it("excludes the selected storm, keeping every other one", () => {
    const solene = makeStorm({ id: "al992026", name: "Solene" });
    const tobias = makeStorm({ id: "al982026", name: "Tobias" });
    const result = otherStorms([solene, tobias], solene);
    expect(result.map((s) => s.id)).toEqual(["al982026"]);
  });

  it("returns every storm when nothing is selected", () => {
    const solene = makeStorm({ id: "al992026" });
    const tobias = makeStorm({ id: "al982026" });
    expect(otherStorms([solene, tobias], null).map((s) => s.id)).toEqual(["al992026", "al982026"]);
  });

  it("returns an empty list when the only storm is the selected one", () => {
    const solene = makeStorm({ id: "al992026" });
    expect(otherStorms([solene], solene)).toEqual([]);
  });
});
