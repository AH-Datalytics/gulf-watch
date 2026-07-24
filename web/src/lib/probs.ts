// Pure helpers over storms/{id}/probs.json (ProbsEntry[]) for the
// WindProbabilities rail section — unit tested in __tests__/probs.test.ts.

import type { ProbsEntry } from "./types";

export const NEW_ORLEANS_POINT = "NEW ORLEANS LA";

/** Display order for the "nearby points" table — Grand Isle, Houma, Slidell,
 *  shown only when present in the parsed probs (per the addendum: "small
 *  table of nearby points ... if present"). Gulfport dropped mid-build per
 *  direct user feedback ("lose the gulfport nearby, not needed") — this is
 *  a display-order change only; ingest's probs.py TARGET_POINTS whitelist
 *  (what NHC data gets captured at all) is untouched, so a Gulfport row
 *  simply never renders even if a future advisory's probs.json carries it. */
export const OTHER_POINTS_ORDER = ["GRAND ISLE LA", "HOUMA LA", "SLIDELL LA"];

/** Finds a named point's row, or null if it's not in this advisory's table. */
export function findPoint(probs: ProbsEntry[] | null | undefined, point: string): ProbsEntry | null {
  return probs?.find((p) => p.point === point) ?? null;
}

/** The nearby-points table rows, in {@link OTHER_POINTS_ORDER}, skipping any
 *  point absent from this advisory. */
export function otherPoints(probs: ProbsEntry[] | null | undefined): ProbsEntry[] {
  if (!probs) return [];
  return OTHER_POINTS_ORDER.map((name) => probs.find((p) => p.point === name)).filter(
    (p): p is ProbsEntry => p != null
  );
}

const STATE_SUFFIX_RE = /\s+(LA|MS|TX|AL|FL)$/;

/** Human, mixed-case place name, e.g. "GRAND ISLE LA" -> "Grand Isle". */
export function pointLabel(point: string): string {
  return point
    .replace(STATE_SUFFIX_RE, "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
