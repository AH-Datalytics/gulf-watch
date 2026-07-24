import { describe, expect, it } from "vitest";
import { findPoint, NEW_ORLEANS_POINT, otherPoints, OTHER_POINTS_ORDER, pointLabel } from "../probs";
import type { ProbsEntry } from "../types";

const SAMPLE: ProbsEntry[] = [
  { point: "NEW ORLEANS LA", ts34: 62, kt50: 18, hurricane64: 4 },
  { point: "SLIDELL LA", ts34: 55, kt50: 12, hurricane64: 2 },
  { point: "GRAND ISLE LA", ts34: 70, kt50: 25, hurricane64: 8 },
];

describe("findPoint", () => {
  it("finds a present point by exact name", () => {
    expect(findPoint(SAMPLE, NEW_ORLEANS_POINT)).toEqual(SAMPLE[0]);
  });

  it("returns null for an absent point", () => {
    expect(findPoint(SAMPLE, "GULFPORT MS")).toBeNull();
  });

  it("returns null for null/undefined probs", () => {
    expect(findPoint(null, NEW_ORLEANS_POINT)).toBeNull();
    expect(findPoint(undefined, NEW_ORLEANS_POINT)).toBeNull();
  });
});

describe("otherPoints", () => {
  it("returns present points in OTHER_POINTS_ORDER, skipping absent ones and New Orleans itself", () => {
    const result = otherPoints(SAMPLE);
    expect(result.map((p) => p.point)).toEqual(["GRAND ISLE LA", "SLIDELL LA"]);
  });

  it("returns an empty list for null/undefined/empty probs", () => {
    expect(otherPoints(null)).toEqual([]);
    expect(otherPoints(undefined)).toEqual([]);
    expect(otherPoints([])).toEqual([]);
  });

  it("respects the documented order constant", () => {
    expect(OTHER_POINTS_ORDER).toEqual(["GRAND ISLE LA", "HOUMA LA", "SLIDELL LA", "GULFPORT MS"]);
  });
});

describe("pointLabel", () => {
  it("strips the state suffix and title-cases", () => {
    expect(pointLabel("NEW ORLEANS LA")).toBe("New Orleans");
    expect(pointLabel("GRAND ISLE LA")).toBe("Grand Isle");
    expect(pointLabel("GULFPORT MS")).toBe("Gulfport");
  });

  it("handles a single-word point", () => {
    expect(pointLabel("HOUMA LA")).toBe("Houma");
  });
});
