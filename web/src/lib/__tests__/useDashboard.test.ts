import { describe, expect, it } from "vitest";
import { demoTag, manifestUrl } from "../useDashboard";

// Pure demo-variant -> manifest URL / map-corner tag mapping (Task 12: the
// ?demo=bertha archive replay). Only these two pure functions are exercised
// here — useDashboard() itself is a client hook (useSWR/useSyncExternalStore)
// and isn't unit-tested at this level.

describe("manifestUrl", () => {
  it("live (non-demo) fetches the Blob-hosted manifest", () => {
    expect(manifestUrl(null)).toBe("/manifest.json");
  });

  it("?demo=1 fetches the Solene demo manifest", () => {
    expect(manifestUrl("1")).toBe("/demo/manifest.json");
  });

  it("?demo=quiet fetches the quiet-mode demo manifest", () => {
    expect(manifestUrl("quiet")).toBe("/demo/manifest-quiet.json");
  });

  it("?demo=bertha fetches the archived Bertha manifest", () => {
    expect(manifestUrl("bertha")).toBe("/demo/bertha/manifest.json");
  });

  it("any other non-null demo value falls back to the Solene demo manifest", () => {
    expect(manifestUrl("anything-else")).toBe("/demo/manifest.json");
  });
});

describe("demoTag", () => {
  it("is null when not in demo mode", () => {
    expect(demoTag(null)).toBeNull();
  });

  it("?demo=1 uses the simulated-storm tag", () => {
    expect(demoTag("1")).toBe("SIMULATED STORM — DEMO DATA");
  });

  it("?demo=quiet uses the simulated-storm tag too (unchanged from before Task 12)", () => {
    expect(demoTag("quiet")).toBe("SIMULATED STORM — DEMO DATA");
  });

  it("?demo=bertha uses the archived-data tag, not 'SIMULATED'", () => {
    const tag = demoTag("bertha");
    expect(tag).toBe("ARCHIVED DATA — TS BERTHA · ADV 016 · JUL 23 2026");
    expect(tag).not.toContain("SIMULATED");
  });
});
