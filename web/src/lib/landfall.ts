// Pure helper backing the intensity panel's LANDFALL reference line.
//
// v1 simplification (per task-11-brief.md): rather than real land-polygon
// intersection, "landfall" is approximated as the first point in the
// official forecast track (track.geojson) that crosses north of 29.2°N —
// roughly the Louisiana/Mississippi Gulf coastline latitude — walking the
// track in TAU order. A "crossing" requires the *previous* point to be south
// of the line and the current point to be at/above it, so a track that
// starts north of 29.2 already (see below) or never reaches it isn't
// misread as an immediate landfall.
//
// Latitude is read from the Point feature's own geometry coordinate, not a
// `LAT` property: a live fetch of storms/al022026/track.geojson from the
// production blob store shows `LAT` rounded to an integer (29 for points
// whose real latitude is 29.9/29.7/29.3), which would understate positions
// just north of the threshold. The demo fixture (web/public/demo/track.geojson)
// has no `LAT` property at all. Geometry coordinates are always present on a
// GeoJSON Point and are exact, so they're used unconditionally.
//
// The crossing's TAU must also match an actual tauH present in the
// intensity series (some upstream feeds could in principle disagree on
// forecast-hour grids) — if it doesn't, the marker is omitted rather than
// interpolated, matching the brief's "must not crash" requirement for both
// demo and live data.

import type { IntensitySeries } from "./types";

export const LANDFALL_LAT = 29.2;

interface TrackTauLat {
  tau: number;
  lat: number;
}

function trackPointsByTau(trackFc: GeoJSON.FeatureCollection): TrackTauLat[] {
  return trackFc.features
    .filter((f) => f.geometry.type === "Point")
    .map((f) => {
      const props = f.properties ?? {};
      const tau = Number(props.TAU ?? props.FHOUR);
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      const lat = Number(coords[1]);
      return { tau, lat };
    })
    .filter((p) => Number.isFinite(p.tau) && Number.isFinite(p.lat))
    .sort((a, b) => a.tau - b.tau);
}

/**
 * The intensity-panel tauH at which the official track first crosses
 * LANDFALL_LAT heading north, or null when there's no such crossing (track
 * missing/empty, never reaches the line, already north of it at TAU 0, or
 * the crossing's TAU has no matching point in the intensity series).
 */
export function landfallTau(
  trackFc: GeoJSON.FeatureCollection | null | undefined,
  intensity: IntensitySeries | null | undefined
): number | null {
  if (!trackFc || !intensity) return null;

  const points = trackPointsByTau(trackFc);
  let crossingTau: number | null = null;
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].lat < LANDFALL_LAT && points[i].lat >= LANDFALL_LAT) {
      crossingTau = points[i].tau;
      break;
    }
  }
  if (crossingTau === null) return null;

  const knownTaus = new Set(intensity.series.flatMap((s) => s.points.map((p) => p.tauH)));
  return knownTaus.has(crossingTau) ? crossingTau : null;
}
