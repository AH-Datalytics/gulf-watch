// Pure text-shaping helpers for the Forecast Discussion rail section —
// unit tested in __tests__/discussion.test.ts. ForecastDiscussion.tsx wraps
// this with the collapsed/expanded UI state.
//
// ingest/gulfwatch/text.py already strips the WMO/AWIPS transmission header
// (the "000 / WTNT42 KNHC 232037 / TCDAT2" three-liner) before storing
// text.json, but keeps the product's own title block ("Tropical Storm
// Bertha Discussion Number 18 / NWS National Hurricane Center.../ 400 PM CDT
// Thu Jul 23 2026") and forecaster sign-off ("$$\nForecaster ..."), since
// those are still "body" as far as the ingest side is concerned. The rail
// already shows the storm name/advisory/issue time elsewhere (StormHeader),
// so this module drops that redundant title block plus the sign-off,
// leaving just the narrative paragraphs a reader actually wants.

/** Splits raw NHC product text into paragraphs on blank lines, collapsing
 *  each paragraph's internal line-wraps into single spaces. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const SIGNOFF_RE = /^\${2}/;

/**
 * The Forecast Discussion's narrative paragraphs only: drops the leading
 * title/byline block (the product's own first paragraph — storm name,
 * center, issuance line) when there's more than one paragraph, and drops any
 * trailing "$$"-prefixed forecaster sign-off paragraph.
 */
export function discussionParagraphs(text: string): string[] {
  const all = splitParagraphs(text);
  const withoutTitle = all.length > 1 ? all.slice(1) : all;
  return withoutTitle.filter((p) => !SIGNOFF_RE.test(p));
}
