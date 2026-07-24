"""One-off builder for the Hurricane Ida flagship historical sample
(/demo/ida, `?demo=ida`) -- v2 addendum Round 2.

Fetches REAL archived NHC/ATCF data for Hurricane Ida (al092021), advisory
6 (issued 500 PM EDT / 2100Z Fri Aug 27 2021 -- the archived advisory
closest to the "Aug 27 18z-Aug 28 00z evening" window: advisory 6 sits at
the exact center of it; advisory 6A follows at 0000Z Aug 28 and advisory 7
at 0300Z Aug 28, both later), and converts it through the SAME ingest
modules the live pipeline uses (gulfwatch.shp / gulfwatch.adeck /
gulfwatch.probs / gulfwatch.text) -- no separate historical-only parsing
logic. Output lands in web/public/demo/ida/, in the exact shapes/paths the
frontend already consumes for any other demo variant (see bertha's
web/public/demo/bertha/ for the sibling pattern).

Sources (all real, all fetched live by this script -- nothing here is
synthesized):
  - NHC GIS forecast archive zip (cone/track/ww):
    https://www.nhc.noaa.gov/gis/forecast/archive/al092021_5day_006.zip
  - ATCF full a-deck archive (model guidance):
    https://ftp.nhc.noaa.gov/atcf/archive/2021/aal092021.dat.gz
    truncated to rows at or before advisory 6's own cycle (2021082718) --
    later rows belong to LATER advisories and would leak future-relative-
    to-advisory-6 model guidance into this snapshot.
  - Archived NHC text products (advisory 6): Forecast Discussion, Public
    Advisory, and Wind Speed Probabilities (PWS), from
    https://www.nhc.noaa.gov/archive/2021/al09/al092021.{discus,public,wndprb}.006.shtml

Wind probability (map layer): a real NHC GIS wind-speed-probability (WSP)
shapefile -- a graduated 11-band percentage-polygon set (34kt/TS-force
threshold), from
https://www.nhc.noaa.gov/gis/forecast/archive/2021082718_wsp_120hr5km.zip
(cycle 2021082718 matches advisory 6 exactly). This replaced an earlier
point-marker design mid-build per direct user feedback favoring a shaded
field like NHC's own "wind_probs_34"/"most_likely_toa_34" graphics
(https://www.nhc.noaa.gov/archive/2021/IDA_graphics.php) -- converted
through the same gulfwatch.shp.zip_to_geojson tooling as cone/track/ww.

Rain/QPF: NOT included. WPC's Quantitative Precipitation Forecast is a
gridded GRIB2 product with no clean per-cycle archived shapefile/GeoJSON
equivalent that the existing shp-based ingest tooling can convert (unlike
the genesis-outlook, cone/track/ww, and wind-probability products, which
ARE NHC shapefiles); building a GRIB2-to-contour pipeline from scratch was
judged out of scope for a one-off historical sample. Per the task brief,
the Ida sample ships WITHOUT a rain layer rather than fabricating one --
see docs/superpowers/specs/2026-07-24-v2-redesign-addendum.md.

Advisory-6-specific facts NOT carried by any of the three source products
above (current position/intensity/movement -- normally sourced from the
LIVE CurrentStorms.json feed, which has no historical archive) come from
the advisory's own official forecast-track "pts" shapefile layer (the
tau=0 point IS advisory 6's officially analyzed current position/
intensity/movement -- the same NHC product, just read directly instead of
through CurrentStorms.json's live mirror of it).

Run: `python scripts/build_ida_sample.py` from ingest/ (needs network
access + the repo's web/public/demo/ida/ directory as the output target).
"""

from __future__ import annotations

import gzip
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gulfwatch import adeck, nhc, probs, shp, text
from gulfwatch.pipeline import _is_cone, _is_track, _is_wwlines, _select_features

STORM_ID = "al092021"
ADVISORY_NUM = "6"
ADVISORY_TIME = "2021-08-27T21:00:00Z"  # 500 PM EDT Fri Aug 27 2021
NEXT_ADVISORY_TIME = "2021-08-28T03:00:00Z"  # advisory 7, 1100 PM EDT same night
ADECK_CUTOFF_CYCLE = "2021082718"  # newest cycle at/before advisory 6's issuance

GIS_ZIP_URL = "https://www.nhc.noaa.gov/gis/forecast/archive/al092021_5day_006.zip"
ADECK_URL = "https://ftp.nhc.noaa.gov/atcf/archive/2021/aal092021.dat.gz"
DISCUS_URL = "https://www.nhc.noaa.gov/archive/2021/al09/al092021.discus.006.shtml"
PUBLIC_URL = "https://www.nhc.noaa.gov/archive/2021/al09/al092021.public.006.shtml"
WNDPRB_URL = "https://www.nhc.noaa.gov/archive/2021/al09/al092021.wndprb.006.shtml"
WSP_ZIP_URL = "https://www.nhc.noaa.gov/gis/forecast/archive/2021082718_wsp_120hr5km.zip"

OUT_DIR = Path(__file__).resolve().parent.parent.parent / "web" / "public" / "demo" / "ida"

TIMEOUT_S = 30
RETRY_BACKOFF_S = 10
MAX_ATTEMPTS = 3


def _get(url: str) -> requests.Response:
    """GET with retries + backoff -- NHC's archive hosts (particularly
    ftp.nhc.noaa.gov) have shown transient DNS-resolution flakiness in
    practice; per this repo's own network policy (shared-contracts.md),
    every fetch gets a timeout and at least one retry rather than failing
    the whole build on a one-off blip."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = requests.get(url, timeout=TIMEOUT_S)
            resp.raise_for_status()
            return resp
        except Exception as exc:  # noqa: BLE001 - deliberately broad, single retry loop
            last_exc = exc
            if attempt < MAX_ATTEMPTS:
                print(f"  ... fetch failed (attempt {attempt}/{MAX_ATTEMPTS}): {exc}; retrying in {RETRY_BACKOFF_S}s")
                time.sleep(RETRY_BACKOFF_S)
    assert last_exc is not None
    raise last_exc


def _is_wsp34(name: str) -> bool:
    return "wsp34" in name


def _advisory6_current_point(track_fc: dict) -> dict:
    """The tau=0 feature of the forecast track points layer IS advisory 6's
    officially analyzed current position/intensity/movement -- the same
    fact CurrentStorms.json mirrors live for a live storm."""
    for f in track_fc["features"]:
        if f.get("geometry", {}).get("type") == "Point" and f["properties"].get("TAU") == 0:
            return f["properties"]
    raise ValueError("no tau=0 forecast point found in advisory 6's track layer")


def build() -> None:
    print(f"gulf-watch: building Ida flagship sample -- {STORM_ID} advisory {ADVISORY_NUM}")

    gis_zip = _get(GIS_ZIP_URL).content
    merged = shp.zip_to_geojson(gis_zip)
    cone_fc = _select_features(merged, _is_cone)
    track_fc = _select_features(merged, _is_track)
    wwlines_fc = _select_features(merged, _is_wwlines)
    print(
        f"  GIS: cone={len(cone_fc['features'])} track={len(track_fc['features'])} "
        f"wwlines={len(wwlines_fc['features'])} features"
    )

    adeck_gz = _get(ADECK_URL).content
    adeck_text_full = gzip.decompress(adeck_gz).decode("latin-1")
    # Truncate to advisory 6's own snapshot: keep only rows at or before the
    # cutoff cycle (YYYYMMDDHH strings compare correctly lexically since
    # they're fixed-width zero-padded) -- otherwise every model's "latest
    # cycle" would resolve to Ida's LAST run of the whole file (early
    # September, well after landfall and dissipation).
    adeck_lines = [
        line
        for line in adeck_text_full.splitlines()
        if len(fields := [f.strip() for f in line.split(",")]) >= 3 and fields[2] <= ADECK_CUTOFF_CYCLE
    ]
    adeck_text = "\n".join(adeck_lines)
    parsed = adeck.parse_adeck(adeck_text)
    n_models = len(parsed["models_geojson"]["features"])
    n_series = len(parsed["intensity"]["series"])
    print(f"  a-deck: cycle={parsed['cycle']} models_geojson features={n_models} intensity series={n_series}")

    discus_shtml = _get(DISCUS_URL).text
    public_shtml = _get(PUBLIC_URL).text
    text_json = text.build_text_json(
        discussion_shtml=discus_shtml,
        discussion_issued=ADVISORY_TIME,
        advisory_shtml=public_shtml,
        advisory_issued=ADVISORY_TIME,
    )

    wndprb_shtml = _get(WNDPRB_URL).text
    probs_json = probs.parse_probs(wndprb_shtml)
    print(f"  probs: {[p['point'] for p in probs_json]}")

    wsp_zip = _get(WSP_ZIP_URL).content
    wsp_merged = shp.zip_to_geojson(wsp_zip)
    windprob_fc = _select_features(wsp_merged, _is_wsp34)
    print(f"  windprob (34kt): {len(windprob_fc['features'])} probability-band polygons")

    current = _advisory6_current_point(track_fc)
    lat, lon = float(current["LAT"]), float(current["LON"])
    vmax_kt = int(current["MAXWIND"])
    pressure_mb = int(current["MSLP"])
    movement_dir = nhc.deg_to_compass(int(current["TCDIR"]))
    movement_mph = int(current["TCSPD"])
    classification = str(current["STORMTYPE"])
    in_gulf = nhc.in_gulf_box(lat, lon)

    manifest_entry = {
        "id": STORM_ID,
        "name": "Ida",
        "classification": classification,
        "intensityMph": round(vmax_kt * adeck.KT_TO_MPH),
        "pressureMb": pressure_mb,
        "movementDir": movement_dir,
        "movementMph": movement_mph,
        "lat": lat,
        "lon": lon,
        "advisoryNum": ADVISORY_NUM,
        "advisoryTime": ADVISORY_TIME,
        "nextAdvisoryTime": NEXT_ADVISORY_TIME,
        "inGulfBox": in_gulf,
        "modelCycle": parsed["cycle"],
        "files": {
            "cone": "ida/cone.geojson",
            "track": "ida/track.geojson",
            "wwlines": "ida/wwlines.geojson",
            "models": "ida/models.geojson",
            "intensity": "ida/intensity.json",
            "text": "ida/text.json",
            "probs": "ida/probs.json",
            "windprob": "ida/windprob.geojson",
        },
    }

    # No active genesis outlook applies to a historical storm replay -- an
    # empty FeatureCollection (rather than reusing the shared fictional-demo
    # outlook fixture) avoids drawing an unrelated genesis wedge on the map.
    outlook_geojson = {"type": "FeatureCollection", "features": []}
    outlook_json = {
        "issued": ADVISORY_TIME,
        "text": "Historical sample replay -- no genesis outlook applies.",
    }

    manifest = {
        "generated": ADVISORY_TIME,
        "mode": "active" if in_gulf else "quiet",
        "storms": [manifest_entry],
        "outlook": {"geojson": "ida/outlook.geojson", "text": "ida/outlook.json", "issued": ADVISORY_TIME},
        "errors": [],
        "_demo": (
            "HISTORICAL SAMPLE -- HURRICANE IDA. Real archived NHC/ATCF data for al092021 "
            "advisory 6 (2100Z Aug 27 2021), converted through the same ingest pipeline used "
            "for live storms. No rain/QPF layer: no clean per-cycle archived QPF product was "
            "available to convert (see build_ida_sample.py's module docstring)."
        ),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    _write_json(OUT_DIR / "manifest.json", manifest)
    _write_json(OUT_DIR / "cone.geojson", cone_fc)
    _write_json(OUT_DIR / "track.geojson", track_fc)
    _write_json(OUT_DIR / "wwlines.geojson", wwlines_fc)
    _write_json(OUT_DIR / "models.geojson", parsed["models_geojson"])
    _write_json(OUT_DIR / "intensity.json", parsed["intensity"])
    _write_json(OUT_DIR / "text.json", text_json)
    _write_json(OUT_DIR / "probs.json", probs_json)
    _write_json(OUT_DIR / "windprob.geojson", windprob_fc)
    _write_json(OUT_DIR / "outlook.geojson", outlook_geojson)
    _write_json(OUT_DIR / "outlook.json", outlook_json)

    print(f"gulf-watch: wrote Ida flagship sample to {OUT_DIR}")


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data), encoding="utf-8")


if __name__ == "__main__":
    build()
