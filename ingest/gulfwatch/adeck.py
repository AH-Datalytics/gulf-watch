"""ATCF a-deck (model guidance) parser for Gulf Watch.

Parses ATCF a-deck text (as fetched from
https://ftp.nhc.noaa.gov/atcf/aid_public/a{stormid}.dat.gz and decompressed)
into the models.geojson / intensity.json shapes used by the ingest pipeline.

Pure function, no network I/O.
"""

from __future__ import annotations

KT_TO_MPH = 1.15078

# Model whitelist: ATCF tech code -> (display label, kind).
# `kind` matches the models.geojson / intensity.json contract:
# "physics" | "ai" | "consensus" | "official".
MODELS = {
    "OFCL": ("Official", "official"),
    "AVNO": ("GFS", "physics"),
    "EMXI": ("ECMWF", "physics"),
    "HFSA": ("HAFS-A", "physics"),
    "HFSB": ("HAFS-B", "physics"),
    "EGRR": ("UKMET", "physics"),
    "TVCA": ("Consensus", "consensus"),
    "DSHP": ("SHIPS", "physics"),
    "LGEM": ("LGEM", "physics"),
}

# Intensity-guidance-only models: included in intensity.json but never drawn
# as a track on the map (excluded from models_geojson).
INTENSITY_ONLY = {"DSHP", "LGEM"}


def _decode_coord(raw: str) -> float:
    """Decode an ATCF lat/lon field (e.g. '265N', '0897W') to signed degrees.

    Values are tenths of a degree; N/E are positive, S/W are negative.
    """
    value = float(raw[:-1]) / 10 * (-1 if raw[-1] in "WS" else 1)
    return round(value, 1)


def parse_adeck(text: str) -> dict:
    """Parse ATCF a-deck text into the models.geojson + intensity.json shapes.

    Uses only the latest cycle (YYYYMMDDHH) present in the file. Within that
    cycle, per (tech, tau) duplicate rows (one per wind-radii threshold) are
    deduped, keeping the first. Rows with lat or lon of 0 are dropped
    entirely (junk/null position). Rows with a missing vmax field are also
    dropped entirely; rows with a present but non-positive vmax keep their
    track point but are excluded from the intensity series.

    Returns:
        {"models_geojson": <FeatureCollection dict>,
         "intensity": <intensity.json dict>,
         "cycle": "YYYYMMDDHH"}
    """
    rows = []
    latest_cycle = None
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        fields = [f.strip() for f in line.split(",")]
        if len(fields) < 9:
            continue
        cycle = fields[2]
        if latest_cycle is None or cycle > latest_cycle:
            latest_cycle = cycle
        rows.append(fields)

    # tech -> {tau: [lon, lat]}
    track_points: dict[str, dict[int, list]] = {}
    # tech -> {tau: mph}
    intensity_points: dict[str, dict[int, int]] = {}

    for fields in rows:
        if fields[2] != latest_cycle:
            continue

        tech = fields[4].upper()
        if tech not in MODELS:
            continue

        tau_str, lat_str, lon_str, vmax_str = fields[5], fields[6], fields[7], fields[8]
        if not tau_str or not lat_str or not lon_str:
            continue
        try:
            tau = int(tau_str)
        except ValueError:
            continue

        lat = _decode_coord(lat_str)
        lon = _decode_coord(lon_str)
        if lat == 0 or lon == 0:
            continue  # junk/null position

        if vmax_str == "":
            continue  # vmax missing entirely: whole row is unusable

        vmax_kt = int(vmax_str)

        tech_track = track_points.setdefault(tech, {})
        if tau not in tech_track:
            tech_track[tau] = [lon, lat]

        if vmax_kt > 0:
            tech_intensity = intensity_points.setdefault(tech, {})
            if tau not in tech_intensity:
                tech_intensity[tau] = round(vmax_kt * KT_TO_MPH)

    features = []
    series = []
    for tech, (label, kind) in MODELS.items():
        pts = track_points.get(tech)
        if pts and tech not in INTENSITY_ONLY:
            coords = [pts[t] for t in sorted(pts)]
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {
                    "model": tech,
                    "label": label,
                    "kind": kind,
                    "cycle": latest_cycle,
                },
            })

        ipts = intensity_points.get(tech)
        if ipts:
            points = [{"tauH": t, "mph": ipts[t]} for t in sorted(ipts)]
            series.append({
                "model": tech,
                "label": label,
                "kind": kind,
                "points": points,
            })

    return {
        "models_geojson": {"type": "FeatureCollection", "features": features},
        "intensity": {"cycle": latest_cycle, "series": series},
        "cycle": latest_cycle,
    }
