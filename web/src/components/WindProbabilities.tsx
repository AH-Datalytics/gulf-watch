"use client";

import { findPoint, NEW_ORLEANS_POINT, otherPoints, pointLabel } from "@/lib/probs";
import type { ProbsEntry } from "@/lib/types";

export interface WindProbabilitiesProps {
  /** storms/{id}/probs.json for the selected storm. `null` while loading (or
   *  if the fetch failed); an empty array is a normal, loaded "no matching
   *  points this advisory" result. */
  probs: ProbsEntry[] | null;
}

/**
 * Rail hero section — full-period (120h) chance of tropical-storm-force and
 * hurricane-force winds at New Orleans, plus a small table of nearby points
 * (Grand Isle, Houma, Slidell, Gulfport) when the PWS text product carries
 * them. Most advisories won't include every point — that's expected, not an
 * error (see ingest/gulfwatch/probs.py).
 */
export function WindProbabilities({ probs }: WindProbabilitiesProps) {
  if (probs === null) {
    return <div className="kicker">Wind chances in New Orleans</div>;
  }

  const nola = findPoint(probs, NEW_ORLEANS_POINT);
  const others = otherPoints(probs);

  return (
    <div>
      <div className="kicker">Wind chances in New Orleans</div>
      {nola ? (
        <div className="wind-hero">
          <div className="wind-hero-stat">
            <div className="wind-hero-value num">{nola.ts34}%</div>
            <div className="wind-hero-label">Chance of tropical storm force winds</div>
          </div>
          <div className="wind-hero-stat">
            <div className="wind-hero-value num">{nola.hurricane64}%</div>
            <div className="wind-hero-label">Chance of hurricane force winds</div>
          </div>
        </div>
      ) : (
        <p className="body-text">Wind probability data isn&apos;t available for New Orleans on this advisory.</p>
      )}
      {others.length > 0 && (
        <table className="wind-table">
          <thead>
            <tr>
              <th>Nearby</th>
              <th>TS force</th>
              <th>50+ mph</th>
              <th>Hurricane</th>
            </tr>
          </thead>
          <tbody>
            {others.map((p) => (
              <tr key={p.point}>
                <td>{pointLabel(p.point)}</td>
                <td className="num">{p.ts34}%</td>
                <td className="num">{p.kt50}%</td>
                <td className="num">{p.hurricane64}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
