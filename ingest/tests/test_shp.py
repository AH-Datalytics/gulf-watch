"""Tests for the NHC GIS shapefile-zip to GeoJSON converter."""

from pathlib import Path

import pytest

from gulfwatch.shp import zip_to_geojson

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_cone.zip"

# Bertha's al022026_5day_014A.zip bundles four shapefile layers -- basenames
# as they actually appear in the committed fixture.
CONE_LAYER = "al022026-014A_5day_pgn"
TRACK_LINE_LAYER = "al022026-014A_5day_lin"
TRACK_POINTS_LAYER = "al022026-014A_5day_pts"
WW_LINES_LAYER = "al022026-014A_ww_wwlin"


@pytest.fixture(scope="module")
def geojson():
    zip_bytes = FIXTURE_PATH.read_bytes()
    return zip_to_geojson(zip_bytes)


def features_for(geojson, layer):
    return [f for f in geojson["features"] if f["properties"]["shapefile"] == layer]


def test_top_level_shape(geojson):
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) >= 1


def test_every_feature_has_stormname_property(geojson):
    # STORMNAME is present on every layer in this fixture.
    for feature in geojson["features"]:
        assert feature["properties"]["STORMNAME"] in ("Bertha", "Tropical Storm Bertha")


def test_all_four_bundled_layers_present(geojson):
    tags = {f["properties"]["shapefile"] for f in geojson["features"]}
    assert tags == {CONE_LAYER, TRACK_LINE_LAYER, TRACK_POINTS_LAYER, WW_LINES_LAYER}


def test_cone_polygon_geometry_and_properties(geojson):
    cone_features = features_for(geojson, CONE_LAYER)
    assert len(cone_features) == 1
    cone = cone_features[0]
    assert cone["type"] == "Feature"
    assert cone["geometry"]["type"] == "Polygon"
    assert len(cone["geometry"]["coordinates"][0]) > 2
    assert cone["properties"]["STORMNAME"] == "Bertha"
    assert cone["properties"]["STORMTYPE"] == "TS"
    assert cone["properties"]["ADVISNUM"] == "14A"


def test_track_points_geometry_and_count(geojson):
    points = features_for(geojson, TRACK_POINTS_LAYER)
    assert len(points) == 4
    for feature in points:
        assert feature["geometry"]["type"] == "Point"
        assert len(feature["geometry"]["coordinates"]) == 2
    taus = sorted(f["properties"]["TAU"] for f in points)
    assert taus == [0, 12, 24, 36]


def test_track_line_geometry(geojson):
    lines = features_for(geojson, TRACK_LINE_LAYER)
    assert len(lines) == 1
    assert lines[0]["geometry"]["type"] in ("LineString", "MultiLineString")


def test_ww_lines_geometry_and_properties(geojson):
    ww_features = features_for(geojson, WW_LINES_LAYER)
    assert len(ww_features) == 4
    for feature in ww_features:
        assert feature["geometry"]["type"] in ("LineString", "MultiLineString")
        assert feature["properties"]["TCWW"] in ("TWA", "TWR")


def test_missing_dbf_or_shx_sibling_is_skipped(tmp_path):
    # A .shp with no matching .dbf/.shx in the zip should be silently skipped
    # rather than crashing the whole conversion.
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("orphan.shp", b"not a real shapefile")
    result = zip_to_geojson(buf.getvalue())
    assert result == {"type": "FeatureCollection", "features": []}
