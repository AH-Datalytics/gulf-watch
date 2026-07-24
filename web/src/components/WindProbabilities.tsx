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
    return <div className="wind-section"><div className="kicker">Wind probability</div></div>;
  }

  const nola = findPoint(probs, NEW_ORLEANS_POINT);
  const others = otherPoints(probs);

  return (
    <div className="wind-section">
      <div className="kicker">Wind probability</div>
      {nola ? (
        <>
          <div className="wind-hero-window">New Orleans · next 5 days</div>
          <div className="wind-prob-list">
            <div className="wind-prob-row">
              <span>≥ 39 mph</span>
              <i><b style={{ width: `${nola.ts34}%` }} /></i>
              <strong className="num">{nola.ts34}%</strong>
            </div>
            <div className="wind-prob-row hurricane">
              <span>≥ 74 mph</span>
              <i><b style={{ width: `${nola.hurricane64}%` }} /></i>
              <strong className="num">{nola.hurricane64}%</strong>
            </div>
          </div>
        </>
      ) : (
        <p className="body-text">Wind probability data isn&apos;t available for New Orleans on this advisory.</p>
      )}
      {others.length > 0 && (
        <details className="nearby-wind-details">
          <summary>Wind chances at nearby locations</summary>
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
        </details>
      )}
    </div>
  );
}
