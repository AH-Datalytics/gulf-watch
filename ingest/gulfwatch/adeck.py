"""ATCF a-deck (model guidance) parser for Gulf Watch.

Parses ATCF a-deck text (as fetched from
https://ftp.nhc.noaa.gov/atcf/aid_public/a{stormid}.dat.gz and decompressed,
or from the historical https://ftp.nhc.noaa.gov/atcf/archive/{year}/
aal{stormid}.dat.gz archive) into the models.geojson / intensity.json shapes
used by the ingest pipeline.

Pure function, no network I/O.
"""

from __future__ import annotations

import re

KT_TO_MPH = 1.15078

# Named model whitelist: ATCF tech code -> (display label, kind, group).
#
# `kind` matches the models.geojson / intensity.json contract:
# "physics" | "ai" | "consensus" | "official" (unchanged meaning -- drives
# solid-vs-dashed line style and the intensity panel's category-guidance
# styling).
#
# `group` is the newer, coarser grouping used by the frontend's unified
# legend/layers control: "official" | "deterministic" | "consensus" |
# "ensemble". Every NAMED model below is either official/deterministic/
# consensus; "ensemble" is reserved for the dynamically-recognized GEFS/
# ECMWF ensemble-member codes (see _ensemble_meta below) and is never a
# value in this dict.
#
# Round 2 (v2 addendum) expanded this from the original 6 map-drawn models
# (AVNO/EMXI/HFSA/HFSB/EGRR/TVCA) to the full quality set: those 6 remain
# (current, 2026-era ATCF codes), plus 2021-era equivalents actually present
# in the Hurricane Ida archive deck (CMC/CMCI, NVGM, CTCX/COTC, HMON, HWRF,
# EGRI) and additional consensus aids (TVCN, GFEX, HCCA, IVCN).
MODELS = {
    "OFCL": ("Official", "official", "official"),
    # Original 6 (current-era codes; drawn on the map today).
    "AVNO": ("GFS", "physics", "deterministic"),
    "EMXI": ("ECMWF", "physics", "deterministic"),
    "HFSA": ("HAFS-A", "physics", "deterministic"),
    "HFSB": ("HAFS-B", "physics", "deterministic"),
    "EGRR": ("UKMET", "physics", "deterministic"),
    "TVCA": ("Consensus", "consensus", "consensus"),
    # Additional major deterministic aids -- codes actually present in the
    # Hurricane Ida (al092021) archive a-deck; several are era-specific
    # (HWRF/HMON were the operational regional hurricane models in 2021,
    # ahead of HAFS-A/B's 2023 debut) or interpolated siblings of a model
    # above (CMCI/EGRI/COTC fill in the standard synoptic taus between that
    # model's native, sparser output times).
    "CMC": ("CMC", "physics", "deterministic"),
    "CMCI": ("CMC (interpolated)", "physics", "deterministic"),
    "NVGM": ("NAVGEM", "physics", "deterministic"),
    "CTCX": ("COAMPS-TC", "physics", "deterministic"),
    "COTC": ("COAMPS-TC (interpolated)", "physics", "deterministic"),
    "HMON": ("HMON", "physics", "deterministic"),
    "HWRF": ("HWRF", "physics", "deterministic"),
    "EGRI": ("UKMET (interpolated)", "physics", "deterministic"),
    # Consensus aids (beyond TVCA above).
    "TVCN": ("TVCN Consensus", "consensus", "consensus"),
    "GFEX": ("GFS Ensemble Mean", "consensus", "consensus"),
    "HCCA": ("HFIP Corrected Consensus", "consensus", "consensus"),
    "IVCN": ("Intensity Consensus", "consensus", "consensus"),
    # Intensity-guidance-only statistical aids (see INTENSITY_ONLY below).
    "DSHP": ("SHIPS", "physics", "deterministic"),
    "LGEM": ("LGEM", "physics", "deterministic"),
}

# Intensity-guidance-only models: included in intensity.json but never drawn
# as a track on the map (excluded from models_geojson).
#
# IVCN (Intensity Consensus) structurally carries no position of its own in
# ATCF -- every row's lat/lon is the null "0N"/"0W" placeholder (confirmed
# against the real Ida archive deck) -- so it belongs here alongside
# DSHP/LGEM (which DO carry a valid mirrored position but are excluded from
# the map by choice). See the lat/lon==0 handling in parse_adeck below for
# why IVCN needs an additional carve-out that DSHP/LGEM don't.
INTENSITY_ONLY = {"DSHP", "LGEM", "IVCN"}

# GEFS ensemble members (AP01..AP30/31) and ECMWF ensemble members (UE00..)
# are not individually named above -- there can be ~30-50 of them and the
# exact count/numbering varies run to run. They're recognized dynamically by
# ATCF tech-code pattern instead, always placed in the "ensemble" group/kind,
# with a generic per-member label. Ensemble members get a map track (full
# spaghetti) but are deliberately excluded from intensity.json (an intensity
# chart with 30+ extra lines would be unreadable clutter, and there's no
# individual per-member toggle in the UI to isolate one anyway -- the
# legend's ensemble row is a single group checkbox).
_GEFS_ENSEMBLE_RE = re.compile(r"^AP\d{2}$")
_ECMWF_ENSEMBLE_RE = re.compile(r"^UE\d{2}$")


def _ensemble_meta(tech: str) -> tuple[str, str, str] | None:
    """Returns (label, kind, group) for a dynamically-recognized ensemble
    member tech code, or None if `tech` doesn't match either ensemble
    family's pattern."""
    if _GEFS_ENSEMBLE_RE.match(tech):
        return (f"GEFS {tech[2:]}", "ensemble", "ensemble")
    if _ECMWF_ENSEMBLE_RE.match(tech):
        return (f"ECMWF Ens {tech[2:]}", "ensemble", "ensemble")
    return None


def _model_meta(tech: str) -> tuple[str, str, str] | None:
    """Returns (label, kind, group) for any whitelisted tech -- named
    (MODELS) or ensemble-pattern -- or None if `tech` isn't recognized at
    all (the original a-deck-wide skip-unknown-tech behavior)."""
    if tech in MODELS:
        return MODELS[tech]
    return _ensemble_meta(tech)


def _decode_coord(raw: str) -> float:
    """Decode an ATCF lat/lon field (e.g. '265N', '0897W') to signed degrees.

    Values are tenths of a degree; N/E are positive, S/W are negative.
    """
    value = float(raw[:-1]) / 10 * (-1 if raw[-1] in "WS" else 1)
    return round(value, 1)


def parse_adeck(text: str) -> dict:
    """Parse ATCF a-deck text into the models.geojson + intensity.json shapes.

    Each whitelisted model (named in MODELS, or a dynamically-recognized
    GEFS/ECMWF ensemble member -- see _model_meta) is filtered independently
    to its own latest cycle (YYYYMMDDHH) present in the file -- NOT a single
    file-wide latest cycle. Models run on different schedules (e.g.
    GFS/AVNO every 6h vs. ECMWF/EMXI only at 00z/12z), so a global-latest
    filter would silently drop a model entirely whenever some other model
    has a newer run in the file. The top-level "cycle" (and intensity.json's
    "cycle") reflect the newest cycle across all whitelisted models.

    Within each model's own latest cycle, per (tech, tau) duplicate rows
    (one per wind-radii threshold) are deduped, keeping the first. Rows with
    lat or lon of 0 are dropped entirely (junk/null position) UNLESS the
    tech is in INTENSITY_ONLY, where an all-zero position is the normal,
    structural case for a track-less intensity aid (IVCN) rather than junk.
    Rows with a missing OR malformed (non-numeric, non-blank -- e.g. a
    placeholder like "****") vmax field are also dropped entirely; rows with
    a present, well-formed but non-positive vmax keep their track point but
    are excluded from the intensity series.

    Ensemble-member techs (GEFS AP##/ECMWF UE##) contribute a map track like
    any other whitelisted model, but are excluded from intensity.json
    entirely (see _ensemble_meta's docstring above).

    Returns:
        {"models_geojson": <FeatureCollection dict>,
         "intensity": <intensity.json dict>,
         "cycle": "YYYYMMDDHH"}
    """
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        fields = [f.strip() for f in line.split(",")]
        if len(fields) < 9:
            continue
        rows.append(fields)

    # Each whitelisted model's own latest cycle, independent of other models.
    latest_cycle_by_model: dict[str, str] = {}
    for fields in rows:
        tech = fields[4].upper()
        if _model_meta(tech) is None:
            continue
        cycle = fields[2]
        if tech not in latest_cycle_by_model or cycle > latest_cycle_by_model[tech]:
            latest_cycle_by_model[tech] = cycle

    # Top-level cycle: newest cycle across all whitelisted models present.
    newest_cycle = max(latest_cycle_by_model.values()) if latest_cycle_by_model else None

    # tech -> {tau: [lon, lat]}
    track_points: dict[str, dict[int, list]] = {}
    # tech -> {tau: mph}
    intensity_points: dict[str, dict[int, int]] = {}

    for fields in rows:
        tech = fields[4].upper()
        if _model_meta(tech) is None:
            continue
        if fields[2] != latest_cycle_by_model[tech]:
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
        if tech not in INTENSITY_ONLY and (lat == 0 or lon == 0):
            continue  # junk/null position

        if vmax_str == "":
            continue  # vmax missing entirely: whole row is unusable

        try:
            vmax_kt = int(vmax_str)
        except ValueError:
            continue  # malformed vmax (non-numeric, non-blank): skip row, don't kill the storm

        tech_track = track_points.setdefault(tech, {})
        if tau not in tech_track:
            tech_track[tau] = [lon, lat]

        if vmax_kt > 0:
            tech_intensity = intensity_points.setdefault(tech, {})
            if tau not in tech_intensity:
                tech_intensity[tau] = round(vmax_kt * KT_TO_MPH)

    features = []
    series = []
    for tech in latest_cycle_by_model:
        label, kind, group = _model_meta(tech)  # type: ignore[misc]

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
                    "group": group,
                    "cycle": latest_cycle_by_model[tech],
                },
            })

        # Ensemble members are excluded from the intensity series entirely
        # (see _ensemble_meta's docstring) -- only named MODELS contribute.
        if tech in MODELS:
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
        "intensity": {"cycle": newest_cycle, "series": series},
        "cycle": newest_cycle,
    }
