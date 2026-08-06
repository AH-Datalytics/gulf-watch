"""Build the Hurricane Ida advisory 6–10 historical replay.

Every frame uses real, cycle-matched NHC/ATCF products: forecast GIS,
initial wind radii, wind-speed probabilities, model/intensity guidance,
text products, observed best track, and GOES-16 imagery. Outputs live below
``web/public/demo/ida/advisories/<number>/`` and share the same manifest
contract used by the live dashboard.

Run from ``ingest/`` with ``python scripts/build_ida_sample.py``.
"""

from __future__ import annotations

import gzip
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlencode

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gulfwatch import adeck, nhc, probs, shp, text
from gulfwatch.pipeline import _is_cone, _is_track, _is_wwlines, _select_features

STORM_ID = "al092021"
ADECK_URL = "https://ftp.nhc.noaa.gov/atcf/archive/2021/aal092021.dat.gz"
BEST_TRACK_ZIP_URL = "https://www.nhc.noaa.gov/gis/best_track/al092021_best_track.zip"
OUT_DIR = Path(__file__).resolve().parent.parent.parent / "web" / "public" / "demo" / "ida"
GOES_BASE = "https://noaa-goes16.s3.amazonaws.com"
SATELLITE_BOUNDS = [[-95.5, 19], [-80, 32]]
RADAR_BOUNDS = [[-98, 18], [-80, 32]]
RADAR_WMS_URL = "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q-t.cgi"
RADAR_WEB_MERCATOR_BBOX = "-10909310.0977,2037548.5448,-8905559.2635,3763310.6271"

ADVISORIES = [
    {
        "num": "5",
        "archive_num": "005",
        "issued": "2021-08-27T15:00:00Z",
        "next": "2021-08-27T21:00:00Z",
        "cycle": "2021082712",
        "satellite_issued": "2021-08-27T15:01:17Z",
        "satellite_key": "ABI-L2-MCMIPC/2021/239/15/OR_ABI-L2-MCMIPC-M6_G16_s20212391501170_e20212391503543_c20212391504039.nc",
    },
    {
        "num": "6",
        "archive_num": "006",
        "issued": "2021-08-27T21:00:00Z",
        "next": "2021-08-28T03:00:00Z",
        "cycle": "2021082718",
        "satellite_issued": "2021-08-27T21:01:17Z",
        "existing_satellite": "satellite-20210827-2101z.webp",
    },
    {
        "num": "7",
        "archive_num": "007",
        "issued": "2021-08-28T03:00:00Z",
        "next": "2021-08-28T09:00:00Z",
        "cycle": "2021082800",
        "satellite_issued": "2021-08-28T03:01:17Z",
        "satellite_mode": "infrared",
        "satellite_key": "ABI-L2-MCMIPC/2021/240/03/OR_ABI-L2-MCMIPC-M6_G16_s20212400301170_e20212400303549_c20212400304048.nc",
    },
    {
        "num": "8",
        "archive_num": "008",
        "issued": "2021-08-28T09:00:00Z",
        "next": "2021-08-28T15:00:00Z",
        "cycle": "2021082806",
        "satellite_issued": "2021-08-28T09:01:17Z",
        "satellite_mode": "infrared",
        "satellite_key": "ABI-L2-MCMIPC/2021/240/09/OR_ABI-L2-MCMIPC-M6_G16_s20212400901170_e20212400903549_c20212400904047.nc",
    },
    {
        "num": "9",
        "archive_num": "009",
        "issued": "2021-08-28T15:00:00Z",
        "next": "2021-08-28T21:00:00Z",
        "cycle": "2021082812",
        "satellite_issued": "2021-08-28T15:01:17Z",
        "satellite_key": "ABI-L2-MCMIPC/2021/240/15/OR_ABI-L2-MCMIPC-M6_G16_s20212401501171_e20212401503555_c20212401504050.nc",
    },
    {
        "num": "10",
        "archive_num": "010",
        "issued": "2021-08-28T21:00:00Z",
        "next": "2021-08-29T03:00:00Z",
        "cycle": "2021082818",
        "satellite_issued": "2021-08-28T21:01:17Z",
        "satellite_key": "ABI-L2-MCMIPC/2021/240/21/OR_ABI-L2-MCMIPC-M6_G16_s20212402101171_e20212402103555_c20212402104046.nc",
    },
    {
        "num": "11",
        "archive_num": "011",
        "issued": "2021-08-29T03:00:00Z",
        "next": "2021-08-29T09:00:00Z",
        "cycle": "2021082900",
        "satellite_issued": "2021-08-29T03:01:17Z",
        "satellite_mode": "infrared",
        "satellite_key": "ABI-L2-MCMIPC/2021/241/03/OR_ABI-L2-MCMIPC-M6_G16_s20212410301171_e20212410303543_c20212410304047.nc",
    },
    {
        "num": "12",
        "archive_num": "012",
        "issued": "2021-08-29T09:00:00Z",
        "next": "2021-08-29T15:00:00Z",
        "cycle": "2021082906",
        "satellite_issued": "2021-08-29T09:01:17Z",
        "satellite_mode": "infrared",
        "satellite_key": "ABI-L2-MCMIPC/2021/241/09/OR_ABI-L2-MCMIPC-M6_G16_s20212410901171_e20212410903549_c20212410904047.nc",
    },
    {
        "num": "13",
        "archive_num": "013",
        "issued": "2021-08-29T15:00:00Z",
        "next": "2021-08-29T21:00:00Z",
        "cycle": "2021082912",
        "satellite_issued": "2021-08-29T15:01:17Z",
        "satellite_key": "ABI-L2-MCMIPC/2021/241/15/OR_ABI-L2-MCMIPC-M6_G16_s20212411501171_e20212411503549_c20212411504044.nc",
    },
    {
        "num": "14",
        "archive_num": "014",
        "issued": "2021-08-29T21:00:00Z",
        "next": "2021-08-30T03:00:00Z",
        "cycle": "2021082918",
        "satellite_issued": "2021-08-29T21:01:17Z",
        "satellite_key": "ABI-L2-MCMIPC/2021/241/21/OR_ABI-L2-MCMIPC-M6_G16_s20212412101171_e20212412103550_c20212412104047.nc",
    },
    {
        "num": "15",
        "archive_num": "015",
        "issued": "2021-08-30T03:00:00Z",
        "next": "2021-08-30T09:00:00Z",
        "cycle": "2021083000",
        "satellite_issued": "2021-08-30T03:01:17Z",
        "satellite_mode": "infrared",
        "satellite_key": "ABI-L2-MCMIPC/2021/242/03/OR_ABI-L2-MCMIPC-M6_G16_s20212420301171_e20212420303549_c20212420304046.nc",
    },
]

TIMEOUT_S = 60
RETRY_BACKOFF_S = 5
MAX_ATTEMPTS = 3
WINDPROB_SIMPLIFY_DEGREES = 0.025


def _get(url: str) -> requests.Response:
    last_exc: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = requests.get(url, timeout=TIMEOUT_S)
            response.raise_for_status()
            return response
        except Exception as exc:  # noqa: BLE001 - one bounded network retry loop
            last_exc = exc
            if attempt < MAX_ATTEMPTS:
                print(f"  fetch failed ({attempt}/{MAX_ATTEMPTS}): {exc}; retrying")
                time.sleep(RETRY_BACKOFF_S)
    assert last_exc is not None
    raise last_exc


def _write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def _current_point(track_fc: dict, advisory_num: str) -> dict:
    for feature in track_fc["features"]:
        if (
            feature.get("geometry", {}).get("type") == "Point"
            and feature.get("properties", {}).get("TAU") == 0
        ):
            return feature
    raise ValueError(f"no tau=0 forecast point for advisory {advisory_num}")


def _history(best_track: dict, cutoff_cycle: str, lon: float, lat: float) -> dict:
    points = [
        feature
        for feature in best_track["features"]
        if feature["geometry"]["type"] == "Point"
        and int(feature.get("properties", {}).get("DTG", 0)) < int(cutoff_cycle)
    ]
    coordinates = [feature["geometry"]["coordinates"] for feature in points]
    current_coordinate = [lon, lat]
    if not coordinates or coordinates[-1] != current_coordinate:
        coordinates.append(current_coordinate)
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "kind": "observed-history",
                    "source": "NHC GIS Best Track Archive",
                    "through": cutoff_cycle,
                },
                "geometry": {"type": "LineString", "coordinates": coordinates},
            },
            *points,
        ],
    }


def _polygon_center(polygon: list) -> tuple[float, float]:
    points = [point for ring in polygon for point in ring]
    return (
        (min(point[0] for point in points) + max(point[0] for point in points)) / 2,
        (min(point[1] for point in points) + max(point[1] for point in points)) / 2,
    )


def _point_segment_distance_sq(point: list, start: list, end: list) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2
    fraction = max(
        0.0,
        min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)),
    )
    nearest_x = start[0] + fraction * dx
    nearest_y = start[1] + fraction * dy
    return (point[0] - nearest_x) ** 2 + (point[1] - nearest_y) ** 2


def _rdp(points: list, tolerance: float) -> list:
    if len(points) <= 2:
        return points
    max_distance_sq = -1.0
    split_index = 0
    for index, point in enumerate(points[1:-1], start=1):
        distance_sq = _point_segment_distance_sq(point, points[0], points[-1])
        if distance_sq > max_distance_sq:
            max_distance_sq = distance_sq
            split_index = index
    if max_distance_sq <= tolerance * tolerance:
        return [points[0], points[-1]]
    left = _rdp(points[: split_index + 1], tolerance)
    right = _rdp(points[split_index:], tolerance)
    return left[:-1] + right


def _simplify_ring(ring: list, tolerance: float = WINDPROB_SIMPLIFY_DEGREES) -> list:
    """Simplify a closed probability contour while preserving a valid ring."""
    if len(ring) <= 5:
        return ring
    points = ring[:-1] if ring[0] == ring[-1] else ring[:]
    anchor = min(range(len(points)), key=lambda index: (points[index][0], points[index][1]))
    ordered = points[anchor:] + points[:anchor]
    opposite = max(
        range(1, len(ordered)),
        key=lambda index: (ordered[index][0] - ordered[0][0]) ** 2
        + (ordered[index][1] - ordered[0][1]) ** 2,
    )
    first_arc = _rdp(ordered[: opposite + 1], tolerance)
    second_arc = _rdp(ordered[opposite:] + [ordered[0]], tolerance)
    simplified = first_arc[:-1] + second_arc
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    return simplified if len(simplified) >= 4 else ring

def _clip_ring(ring: list, west: float, east: float, south: float, north: float) -> list:
    """Clip one closed lon/lat ring to a rectangular display domain."""
    if not ring:
        return []
    points = [list(point[:2]) for point in (ring[:-1] if ring[0] == ring[-1] else ring)]

    def clip(points: list, inside, intersect) -> list:
        if not points:
            return []
        output = []
        previous = points[-1]
        previous_inside = inside(previous)
        for current in points:
            current_inside = inside(current)
            if current_inside:
                if not previous_inside:
                    output.append(intersect(previous, current))
                output.append(current)
            elif previous_inside:
                output.append(intersect(previous, current))
            previous = current
            previous_inside = current_inside
        return output

    def vertical(first: list, second: list, longitude: float) -> list:
        x1, y1 = first
        x2, y2 = second
        if x1 == x2:
            return [longitude, y1]
        ratio = (longitude - x1) / (x2 - x1)
        return [longitude, y1 + ratio * (y2 - y1)]

    def horizontal(first: list, second: list, latitude: float) -> list:
        x1, y1 = first
        x2, y2 = second
        if y1 == y2:
            return [x1, latitude]
        ratio = (latitude - y1) / (y2 - y1)
        return [x1 + ratio * (x2 - x1), latitude]

    points = clip(points, lambda point: point[0] >= west, lambda a, b: vertical(a, b, west))
    points = clip(points, lambda point: point[0] <= east, lambda a, b: vertical(a, b, east))
    points = clip(points, lambda point: point[1] >= south, lambda a, b: horizontal(a, b, south))
    points = clip(points, lambda point: point[1] <= north, lambda a, b: horizontal(a, b, north))
    if not points:
        return []
    deduped = []
    for point in points:
        if not deduped or point != deduped[-1]:
            deduped.append(point)
    if len(deduped) < 3:
        return []
    if deduped[0] != deduped[-1]:
        deduped.append(deduped[0])
    return deduped


def _simplify_windprob(feature_collection: dict) -> dict:
    features = []
    for feature in feature_collection.get("features", []):
        geometry = feature.get("geometry")
        if not geometry or geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            features.append(feature)
            continue
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        simplified = [[_simplify_ring(ring) for ring in polygon] for polygon in polygons]
        next_coordinates = simplified if geometry["type"] == "MultiPolygon" else simplified[0]
        features.append({**feature, "geometry": {**geometry, "coordinates": next_coordinates}})
    return {**feature_collection, "features": features}


def _filter_wsp_for_ida(feature_collection: dict) -> dict:
    """Keep Ida's component from basin-wide WSP probability polygons.

    The archived cycle files combine every active Atlantic and eastern-Pacific
    storm into one MultiPolygon per probability band and carry no storm ID.
    Components are geographically disjoint, so their bounding-box centers
    cleanly separate Ida's Gulf field from Nora and the eastern Atlantic.
    """
    west, east, south, north = -100, -75, 15, 40
    features = []
    for feature in feature_collection["features"]:
        geometry = feature["geometry"]
        if not geometry or geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        polygons = (
            geometry["coordinates"]
            if geometry["type"] == "MultiPolygon"
            else [geometry["coordinates"]]
        )
        ida_polygons = []
        for polygon in polygons:
            center = _polygon_center(polygon)
            if not center or not (west <= center[0] <= east and south <= center[1] <= north):
                continue
            rings = [_clip_ring(_simplify_ring(ring), west, east, south, north) for ring in polygon]
            rings = [ring for ring in rings if ring]
            if rings:
                ida_polygons.append(rings)
        if not ida_polygons:
            continue
        features.append(
            {
                **feature,
                "geometry": {"type": "MultiPolygon", "coordinates": ida_polygons},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def simplify_existing() -> None:
    paths = sorted(OUT_DIR.rglob("windprob*.geojson"))
    for path in paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        _write_json(path, _simplify_windprob(data))
    print(f"gulf-watch: simplified {len(paths)} existing Ida wind-probability files")


def _build_satellite(advisory: dict, output_dir: Path) -> str:
    issued_slug = advisory["satellite_issued"].replace("-", "").replace(":", "")
    filename = f"satellite-{issued_slug[0:8]}-{issued_slug[9:13].lower()}z.webp"
    target = output_dir / filename
    if target.exists():
        return filename

    existing = advisory.get("existing_satellite")
    if existing:
        shutil.copy2(OUT_DIR / existing, target)
        return filename

    key = advisory["satellite_key"]
    raw_path = Path(tempfile.gettempdir()) / Path(key).name
    try:
        print(f"  GOES: downloading {Path(key).name}")
        raw_path.write_bytes(_get(f"{GOES_BASE}/{key}").content)
        subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("build_goes_overlay.py")),
                str(raw_path),
                str(target),
                "--bounds",
                *[str(value) for pair in SATELLITE_BOUNDS for value in pair],
                *(["--infrared"] if advisory.get("satellite_mode") == "infrared" else []),
            ],
            check=True,
        )
    finally:
        raw_path.unlink(missing_ok=True)
    return filename

def _build_radar(advisory: dict, output_dir: Path) -> str:
    """Download a projection-correct Gulf crop of IEM's archived NEXRAD mosaic."""
    issued_slug = advisory["issued"].replace("-", "").replace(":", "")
    filename = f"radar-{issued_slug[0:8]}-{issued_slug[9:13].lower()}z.png"
    target = output_dir / filename
    if target.exists():
        return filename

    params = {
        "SERVICE": "WMS",
        "REQUEST": "GetMap",
        "VERSION": "1.3.0",
        "LAYERS": "nexrad-n0q-wmst",
        "STYLES": "",
        "CRS": "EPSG:3857",
        "BBOX": RADAR_WEB_MERCATOR_BBOX,
        "WIDTH": "1200",
        "HEIGHT": "1034",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "TIME": advisory["issued"],
    }
    print(f"  NEXRAD: downloading historical mosaic at {advisory['issued']}")
    target.write_bytes(_get(f"{RADAR_WMS_URL}?{urlencode(params)}").content)
    return filename


def _build_advisory(advisory: dict, adeck_full: str, best_track: dict) -> dict:
    num = advisory["num"]
    archive_num = advisory["archive_num"]
    cycle = advisory["cycle"]
    output_dir = OUT_DIR / "advisories" / archive_num
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"gulf-watch: Ida advisory {num} ({advisory['issued']})")

    gis_url = f"https://www.nhc.noaa.gov/gis/forecast/archive/{STORM_ID}_5day_{archive_num}.zip"
    merged = shp.zip_to_geojson(_get(gis_url).content)
    cone_fc = _select_features(merged, _is_cone)
    track_fc = _select_features(merged, _is_track)
    wwlines_fc = _select_features(merged, _is_wwlines)

    wind_url = f"https://www.nhc.noaa.gov/gis/forecast/archive/{STORM_ID}_fcst_{archive_num}.zip"
    wind_merged = shp.zip_to_geojson(_get(wind_url).content)
    wind_field_fc = _select_features(wind_merged, lambda name: "initialradii" in name.lower())

    adeck_lines = [
        line
        for line in adeck_full.splitlines()
        if len(fields := [field.strip() for field in line.split(",")]) >= 3 and fields[2] <= cycle
    ]
    parsed = adeck.parse_adeck("\n".join(adeck_lines))

    text_base = "https://www.nhc.noaa.gov/archive/2021/al09"
    text_json = text.build_text_json(
        discussion_shtml=_get(f"{text_base}/{STORM_ID}.discus.{archive_num}.shtml").text,
        discussion_issued=advisory["issued"],
        advisory_shtml=_get(f"{text_base}/{STORM_ID}.public.{archive_num}.shtml").text,
        advisory_issued=advisory["issued"],
    )
    probs_json = probs.parse_probs(
        _get(f"{text_base}/{STORM_ID}.wndprb.{archive_num}.shtml").text
    )

    wsp_url = f"https://www.nhc.noaa.gov/gis/forecast/archive/{cycle}_wsp_120hr5km.zip"
    wsp_merged = shp.zip_to_geojson(_get(wsp_url).content)
    windprob_by_kt = {
        threshold: _filter_wsp_for_ida(
            _select_features(
                wsp_merged,
                lambda name, threshold=threshold: f"wsp{threshold}" in name,
            )
        )
        for threshold in (34, 50, 64)
    }

    current_feature = _current_point(track_fc, num)
    current = current_feature["properties"]
    lon, lat = map(float, current_feature["geometry"]["coordinates"])
    valid_day, valid_time = str(current["VALIDTIME"]).split("/")
    history_cutoff = f"{cycle[:6]}{valid_day}{valid_time[:2]}"
    vmax_kt = int(current["MAXWIND"])
    in_gulf = nhc.in_gulf_box(lat, lon)
    history_fc = _history(best_track, history_cutoff, lon, lat)
    satellite_file = _build_satellite(advisory, output_dir)
    radar_file = _build_radar(advisory, output_dir)

    files = {
        "cone": "cone.geojson",
        "track": "track.geojson",
        "history": "history.geojson",
        "wwlines": "wwlines.geojson",
        "models": "models.geojson",
        "intensity": "intensity.json",
        "text": "text.json",
        "probs": "probs.json",
        "windprob": "windprob.geojson",
        "windprob50": "windprob-58mph.geojson",
        "windprob64": "windprob-74mph.geojson",
        "windfield": "windfield.geojson",
    }
    for name, data in {
        "cone.geojson": cone_fc,
        "track.geojson": track_fc,
        "history.geojson": history_fc,
        "wwlines.geojson": wwlines_fc,
        "models.geojson": parsed["models_geojson"],
        "intensity.json": parsed["intensity"],
        "text.json": text_json,
        "probs.json": probs_json,
        "windprob.geojson": windprob_by_kt[34],
        "windprob-58mph.geojson": windprob_by_kt[50],
        "windprob-74mph.geojson": windprob_by_kt[64],
        "windfield.geojson": wind_field_fc,
    }.items():
        _write_json(output_dir / name, data)

    prefix = f"ida/advisories/{archive_num}"
    return {
        "id": STORM_ID,
        "name": "Ida",
        "classification": str(current["STORMTYPE"]),
        "intensityMph": round(vmax_kt * adeck.KT_TO_MPH),
        "pressureMb": int(current["MSLP"]),
        "movementDir": nhc.deg_to_compass(int(current["TCDIR"])),
        "movementMph": int(current["TCSPD"]),
        "lat": lat,
        "lon": lon,
        "advisoryNum": num,
        "advisoryTime": advisory["issued"],
        "nextAdvisoryTime": advisory["next"],
        "inGulfBox": in_gulf,
        "modelCycle": parsed["cycle"],
        "files": {key: f"{prefix}/{value}" for key, value in files.items()},
        "satellite": {
            "image": f"{prefix}/{satellite_file}",
            "issued": advisory["satellite_issued"],
            "sourceLabel": "NOAA/NESDIS GOES-16 ABI",
            "sourceUrl": f"{GOES_BASE}/index.html",
            "bounds": SATELLITE_BOUNDS,
        },
        "radar": {
            "image": f"{prefix}/{radar_file}",
            "issued": advisory["issued"],
            "sourceLabel": "IEM / NEXRAD",
            "sourceUrl": "https://mesonet.agron.iastate.edu/docs/nexrad_composites/",
            "bounds": RADAR_BOUNDS,
        },
    }


def build() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("gulf-watch: fetching shared Ida archives")
    adeck_full = gzip.decompress(_get(ADECK_URL).content).decode("latin-1")
    best_track = shp.zip_to_geojson(_get(BEST_TRACK_ZIP_URL).content)
    snapshots = [_build_advisory(item, adeck_full, best_track) for item in ADVISORIES]

    # The first snapshot remains at storms[0] for backwards compatibility;
    # the optional advisories list is what enables in-place historical replay.
    storm = {**snapshots[0], "advisories": snapshots}
    outlook_geojson = {"type": "FeatureCollection", "features": []}
    outlook_json = {
        "issued": snapshots[0]["advisoryTime"],
        "text": "Historical sample replay -- no genesis outlook applies.",
    }
    manifest = {
        "generated": snapshots[0]["advisoryTime"],
        "mode": "active",
        "storms": [storm],
        "outlook": {
            "geojson": "ida/outlook.geojson",
            "text": "ida/outlook.json",
            "issued": snapshots[0]["advisoryTime"],
        },
        "errors": [],
        "_demo": (
            "HISTORICAL SAMPLE -- HURRICANE IDA. Real archived NHC/ATCF data "
            "for advisories 5-15, with cycle-matched GIS, guidance, text, wind, "
            "history, GOES-16, and NEXRAD products."
        ),
    }
    _write_json(OUT_DIR / "manifest.json", manifest)
    _write_json(OUT_DIR / "outlook.geojson", outlook_geojson)
    _write_json(OUT_DIR / "outlook.json", outlook_json)
    print(f"gulf-watch: wrote {len(snapshots)} Ida advisory frames to {OUT_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--simplify-existing", action="store_true")
    args = parser.parse_args()
    simplify_existing() if args.simplify_existing else build()
