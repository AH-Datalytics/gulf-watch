import { describe, expect, it } from "vitest";
import { discussionParagraphs, splitParagraphs } from "../discussion";

const REAL_BERTHA_DISCUSSION = `Tropical Storm Bertha Discussion Number  18
NWS National Hurricane Center Miami FL       AL022026
400 PM CDT Thu Jul 23 2026

Bertha has been moving along the northern Gulf coast much of the
day, and it now appears to be inland over far eastern Texas.  The
storm remains very asymmetric, with nearly all of the deep
convection over the southwest quadrant, which is now moving inland
over Texas.

The poor organization of Bertha makes it hard to compute its
initial motion.  In fact, the storm is becoming increasingly
elongated and might be opening up into a trough.

$$
Forecaster Cangialosi/R. Zelinsky`;

describe("splitParagraphs", () => {
  it("splits on blank lines and collapses internal line-wraps", () => {
    const paras = splitParagraphs("Line one\nstill line one.\n\nLine two.");
    expect(paras).toEqual(["Line one still line one.", "Line two."]);
  });

  it("drops empty paragraphs", () => {
    expect(splitParagraphs("\n\nOnly.\n\n\n")).toEqual(["Only."]);
  });
});

describe("discussionParagraphs", () => {
  it("drops the title/byline block and the forecaster sign-off, keeping only narrative paragraphs", () => {
    const paras = discussionParagraphs(REAL_BERTHA_DISCUSSION);
    expect(paras).toHaveLength(2);
    expect(paras[0]).toContain("Bertha has been moving along the northern Gulf coast");
    expect(paras[1]).toContain("poor organization of Bertha");
    expect(paras.some((p) => p.startsWith("$$"))).toBe(false);
    expect(paras.some((p) => p.includes("Discussion Number"))).toBe(false);
  });

  it("keeps everything when there's only a single paragraph (no title block to drop)", () => {
    expect(discussionParagraphs("Just one paragraph of text.")).toEqual(["Just one paragraph of text."]);
  });

  it("returns an empty list for empty input", () => {
    expect(discussionParagraphs("")).toEqual([]);
  });
});
