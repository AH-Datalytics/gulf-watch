"""Tests for the ATCF a-deck (model guidance) parser."""

from pathlib import Path

import pytest

from gulfwatch.adeck import parse_adeck, MODELS, INTENSITY_ONLY, KT_TO_MPH

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "adeck_sample.dat"


@pytest.fixture(scope="module")
def result():
    text = FIXTURE_PATH.read_text()
    return parse_adeck(text)


def feature_for(result, model):
    for f in result["models_geojson"]["features"]:
        if f["properties"]["model"] == model:
            return f
    return None


def series_for(result, model):
    for s in result["intensity"]["series"]:
        if s["model"] == model:
            return s
    return None


def test_constants():
    assert KT_TO_MPH == 1.15078
    assert MODELS["OFCL"] == ("Official", "official")
    assert INTENSITY_ONLY == {"DSHP", "LGEM"}


def test_top_level_shape(result):
    assert set(result.keys()) == {"models_geojson", "intensity", "cycle"}
    assert result["models_geojson"]["type"] == "FeatureCollection"
    assert result["intensity"]["cycle"] == result["cycle"]


def test_latest_cycle_only(result):
    # Only the later of the two cycles present in the fixture is used.
    assert result["cycle"] == "2026072212"

    ofcl = feature_for(result, "OFCL")
    assert ofcl is not None
    # The old-cycle position (25.5, -87.5) must not appear anywhere in the track.
    assert [-87.5, 25.5] not in ofcl["geometry"]["coordinates"]
    # tau=0 point should be the new-cycle position.
    assert ofcl["geometry"]["coordinates"][0] == [-88.0, 26.0]


def test_clp5_excluded_entirely(result):
    assert feature_for(result, "CLP5") is None
    assert series_for(result, "CLP5") is None


def test_dshp_intensity_only(result):
    # DSHP is intensity-only: no track feature, but present in intensity series.
    assert feature_for(result, "DSHP") is None
    dshp_series = series_for(result, "DSHP")
    assert dshp_series is not None
    assert dshp_series["label"] == "SHIPS"
    assert dshp_series["kind"] == "physics"
    assert [p["tauH"] for p in dshp_series["points"]] == [0, 12]


def test_tau_dedupe(result):
    # OFCL tau=0 appears 3x in the fixture (radii-duplicated rows) -> one point.
    ofcl = feature_for(result, "OFCL")
    taus_expected_points = 3  # tau 0, 12, 24
    assert len(ofcl["geometry"]["coordinates"]) == taus_expected_points


def test_latlon_decode_signs(result):
    # 265N -> 26.5, 0897W -> -89.7
    hfsa = feature_for(result, "HFSA")
    assert hfsa is not None
    assert hfsa["geometry"]["coordinates"][0] == [-89.7, 26.5]


def test_kt_to_mph_rounding(result):
    # 90 kt -> 104 mph (round(90 * 1.15078) == 104)
    ofcl_series = series_for(result, "OFCL")
    tau0 = next(p for p in ofcl_series["points"] if p["tauH"] == 0)
    assert tau0["mph"] == 104


def test_models_geojson_properties_match_contract(result):
    avno = feature_for(result, "AVNO")
    assert avno["properties"] == {
        "model": "AVNO",
        "label": "GFS",
        "kind": "physics",
        "cycle": "2026072212",
    }
    assert avno["geometry"]["type"] == "LineString"


def test_junk_zero_latlon_row_skipped(result):
    # AVNO tau=48 has lat/lon of 0 and should be skipped entirely (not just
    # excluded from intensity) -- AVNO track should only have tau 0 and 12.
    avno = feature_for(result, "AVNO")
    assert len(avno["geometry"]["coordinates"]) == 2
    avno_series = series_for(result, "AVNO")
    assert [p["tauH"] for p in avno_series["points"]] == [0, 12]


def test_missing_vmax_skips_entire_row(result):
    # HFSA tau=12 has a blank vmax field -> entire row dropped (no track point,
    # no intensity point). Only tau=0 should remain for HFSA.
    hfsa = feature_for(result, "HFSA")
    assert len(hfsa["geometry"]["coordinates"]) == 1
    hfsa_series = series_for(result, "HFSA")
    assert [p["tauH"] for p in hfsa_series["points"]] == [0]


def test_vmax_zero_keeps_track_but_not_intensity(result):
    # TVCA tau=0 has vmax=0 (present but non-positive): keep the track point,
    # drop it from the intensity series.
    tvca = feature_for(result, "TVCA")
    assert len(tvca["geometry"]["coordinates"]) == 2
    tvca_series = series_for(result, "TVCA")
    assert [p["tauH"] for p in tvca_series["points"]] == [12]
