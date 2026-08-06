import { describe, expect, it } from "vitest";
import { radarAgeMinutes, radarValidTime } from "../radar";

describe("radar metadata", () => {
  it("reads IEM's current composite valid time", () => {
    expect(radarValidTime({ meta: { valid: "2026-07-25T17:50:00Z" } })).toBe(
      "2026-07-25T17:50:00Z"
    );
  });

  it("rejects missing or invalid valid times", () => {
    expect(() => radarValidTime({ meta: {} })).toThrow(/valid timestamp/);
    expect(() => radarValidTime({ meta: { valid: "not-a-date" } })).toThrow(/valid timestamp/);
  });

  it("reports whole minutes and does not show negative ages", () => {
    expect(radarAgeMinutes("2026-07-25T17:50:00Z", new Date("2026-07-25T17:57:59Z"))).toBe(7);
    expect(radarAgeMinutes("2026-07-25T17:50:00Z", new Date("2026-07-25T17:49:00Z"))).toBe(0);
  });
});
