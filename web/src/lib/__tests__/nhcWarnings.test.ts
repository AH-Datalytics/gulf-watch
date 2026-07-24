import { describe, expect, it } from "vitest";
import { nolaHasHurricaneWarning } from "../nhcWarnings";

describe("nolaHasHurricaneWarning", () => {
  it("recognizes New Orleans inside the Hurricane Warning block", () => {
    expect(nolaHasHurricaneWarning(`
A Hurricane Warning is in effect for...
* Intracoastal City Louisiana to the Mouth of the Pearl River
* Lake Pontchartrain, Lake Maurepas, and Metropolitan New Orleans

A Storm Surge Watch is in effect for...
* Mobile Bay
`)).toBe(true);
  });

  it("does not use a New Orleans mention from a different warning block", () => {
    expect(nolaHasHurricaneWarning(`
A Hurricane Warning is in effect for...
* Coastal Mississippi

A Tropical Storm Warning is in effect for...
* Metropolitan New Orleans
`)).toBe(false);
  });

  it("returns false when the advisory is missing", () => {
    expect(nolaHasHurricaneWarning(null)).toBe(false);
  });
});
