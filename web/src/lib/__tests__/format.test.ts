import { describe, expect, it } from "vitest";
import {
  categoryFor,
  cdtTickLabel,
  cdtDateTime,
  cdtTime,
  countdown,
  formatCycle,
  nextOutlookIssueTime,
  stormTypeLabel,
} from "../format";

describe("categoryFor", () => {
  it("classifies below tropical storm threshold as TD", () => {
    expect(categoryFor(38)).toBe("TD");
  });

  it("classifies 39 mph as TS (tropical storm threshold)", () => {
    expect(categoryFor(39)).toBe("TS");
  });

  it("classifies 73 mph as TS (just under Cat 1 threshold of 74)", () => {
    expect(categoryFor(73)).toBe("TS");
  });

  it("classifies 74 mph as Cat 1", () => {
    expect(categoryFor(74)).toBe("1");
  });

  it("classifies 95 mph as Cat 1 (just under Cat 2 threshold of 96)", () => {
    expect(categoryFor(95)).toBe("1");
  });

  it("classifies 96 mph as Cat 2", () => {
    expect(categoryFor(96)).toBe("2");
  });

  it("classifies 111 mph as Cat 3", () => {
    expect(categoryFor(111)).toBe("3");
  });

  it("classifies 130 mph as Cat 4", () => {
    expect(categoryFor(130)).toBe("4");
  });

  it("classifies 157 mph as Cat 5", () => {
    expect(categoryFor(157)).toBe("5");
  });

  it("classifies a very high value as Cat 5", () => {
    expect(categoryFor(200)).toBe("5");
  });
});

describe("cdtTime", () => {
  it("renders a fixed UTC instant in America/Chicago as 12-hour CDT time", () => {
    // 2026-07-22T21:00:00Z is 4:00 PM CDT (UTC-5 during daylight saving).
    expect(cdtTime("2026-07-22T21:00:00Z")).toBe("4:00 PM CDT");
  });

  it("renders midnight UTC correctly", () => {
    // 2026-07-23T05:00:00Z is midnight CDT.
    expect(cdtTime("2026-07-23T05:00:00Z")).toBe("12:00 AM CDT");
  });

  it("renders noon UTC correctly", () => {
    // 2026-07-22T17:00:00Z is noon CDT.
    expect(cdtTime("2026-07-22T17:00:00Z")).toBe("12:00 PM CDT");
  });
});

describe("cdtDateTime", () => {
  it("adds the Central calendar date for historical advisory context", () => {
    expect(cdtDateTime("2021-08-27T21:00:00Z")).toBe("Aug 27, 2021 at 4:00 PM CDT");
  });
});

describe("countdown", () => {
  it("formats hours and minutes remaining as T-minus", () => {
    const now = new Date("2026-07-22T18:19:00Z");
    const target = "2026-07-22T21:00:00Z"; // 2h41m later
    expect(countdown(target, now)).toBe("T−2:41");
  });

  it("pads single-digit minutes", () => {
    const now = new Date("2026-07-22T18:55:00Z");
    const target = "2026-07-22T21:00:00Z"; // 2h05m later
    expect(countdown(target, now)).toBe("T−2:05");
  });

  it("handles a target under an hour away", () => {
    const now = new Date("2026-07-22T20:30:00Z");
    const target = "2026-07-22T21:00:00Z"; // 0h30m later
    expect(countdown(target, now)).toBe("T−0:30");
  });

  it("clamps to T-0:00 once the target has passed", () => {
    const now = new Date("2026-07-22T22:00:00Z");
    const target = "2026-07-22T21:00:00Z"; // already passed
    expect(countdown(target, now)).toBe("T−0:00");
  });
});

describe("stormTypeLabel", () => {
  it("maps known NHC classification codes", () => {
    expect(stormTypeLabel("MH")).toBe("Major Hurricane");
    expect(stormTypeLabel("HU")).toBe("Hurricane");
    expect(stormTypeLabel("TS")).toBe("Tropical Storm");
    expect(stormTypeLabel("TD")).toBe("Tropical Depression");
  });

  it("passes through an unrecognized code as-is", () => {
    expect(stormTypeLabel("XX")).toBe("XX");
  });
});

describe("formatCycle", () => {
  it("extracts the hour and appends Z", () => {
    expect(formatCycle("2026072212")).toBe("12Z");
  });

  it("handles a midnight cycle", () => {
    expect(formatCycle("2026072300")).toBe("00Z");
  });
});

describe("cdtTickLabel", () => {
  it("renders a compact weekday+hour tick (intensity panel style)", () => {
    // 2026-07-22T21:00:00Z is 4:00 PM CDT on a Wednesday.
    expect(cdtTickLabel("2026-07-22T21:00:00Z")).toBe("WED 4P");
  });

  it("renders an AM tick on the following day", () => {
    // 2026-07-23T09:00:00Z is 4:00 AM CDT on a Thursday.
    expect(cdtTickLabel("2026-07-23T09:00:00Z")).toBe("THU 4A");
  });
});

describe("nextOutlookIssueTime", () => {
  it("finds the next of the four daily CDT slots (1 PM issued -> 7 PM)", () => {
    // 2026-07-22T18:00:00Z is 1:00 PM CDT.
    expect(nextOutlookIssueTime("2026-07-22T18:00:00Z")).toBe("7:00 PM CDT");
  });

  it("wraps to the next day's 1 AM after the 7 PM slot", () => {
    // 2026-07-23T00:00:00Z is 7:00 PM CDT (July 22).
    expect(nextOutlookIssueTime("2026-07-23T00:00:00Z")).toBe("1:00 AM CDT");
  });

  it("does not preserve minutes from an off-schedule source timestamp", () => {
    expect(nextOutlookIssueTime("2026-07-22T17:13:24Z")).toBe("1:00 PM CDT");
  });
});
