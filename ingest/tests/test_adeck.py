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
    assert MODELS["OFCL"] == ("Official", "official", "official")
    assert INTENSITY_ONLY == {"DSHP", "LGEM", "IVCN"}


def test_top_level_shape(result):
    assert set(result.keys()) == {"models_geojson", "intensity", "cycle"}
    assert result["models_geojson"]["type"] == "FeatureCollection"
    assert result["intensity"]["cycle"] == result["cycle"]


def test_latest_cycle_only(result):
    # OFCL's own latest cycle is 2026072212 (it never appears at 2026072218).
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
        "group": "deterministic",
        "cycle": "2026072218",
    }
    assert avno["geometry"]["type"] == "LineString"


def test_junk_zero_latlon_row_skipped(result):
    # AVNO's own latest cycle (2026072218) has a tau=48 row with lat/lon of 0
    # that should be skipped entirely (not just excluded from intensity) --
    # AVNO track should only have tau 0 and 6 (its earlier 2026072212 tau 0/12
    # rows are superseded by its own newer cycle).
    avno = feature_for(result, "AVNO")
    assert len(avno["geometry"]["coordinates"]) == 2
    avno_series = series_for(result, "AVNO")
    assert [p["tauH"] for p in avno_series["points"]] == [0, 6]


def test_missing_vmax_skips_entire_row(result):
    # HFSA tau=12 has a blank vmax field -> entire row dropped (no track point,
    # no intensity point). Only tau=0 should remain for HFSA.
    hfsa = feature_for(result, "HFSA")
    assert len(hfsa["geometry"]["coordinates"]) == 1
    hfsa_series = series_for(result, "HFSA")
    assert [p["tauH"] for p in hfsa_series["points"]] == [0]


def test_per_model_latest_cycle(result):
    # AVNO (GFS, runs every 6h) has a newer cycle (2026072218) in the fixture
    # than EMXI (ECMWF, only runs 00z/12z), which exists solely at
    # 2026072212. Each whitelisted model must be filtered to its OWN latest
    # cycle -- a single global-latest filter would wrongly drop EMXI (and
    # every other model) entirely whenever some other model has a newer run.
    emxi = feature_for(result, "EMXI")
    assert emxi is not None
    assert emxi["properties"]["cycle"] == "2026072212"

    avno = feature_for(result, "AVNO")
    assert avno is not None
    assert avno["properties"]["cycle"] == "2026072218"

    # The top-level cycle (and intensity.json's cycle) reflect the newest
    # cycle across all models, not any single model's cycle.
    assert result["cycle"] == "2026072218"
    assert result["intensity"]["cycle"] == "2026072218"


def test_malformed_vmax_row_skipped_not_raised():
    # T1a (final review): a non-numeric, non-blank vmax field (e.g. a
    # placeholder like "****") must be skipped like any other malformed row
    # -- not raise out of parse_adeck and kill every model for the storm.
    # tau=12's vmax is malformed here; only tau=0 should survive for OFCL.
    text = (
        "AL, 09, 2026072200, 03, OFCL,   0, 255N,  875W,  85,  970, HU\n"
        "AL, 09, 2026072200, 03, OFCL,  12, 256N,  876W, ****,  968, HU\n"
    )
    result = parse_adeck(text)
    ofcl = feature_for(result, "OFCL")
    assert ofcl is not None
    assert len(ofcl["geometry"]["coordinates"]) == 1
    assert ofcl["geometry"]["coordinates"][0] == [-87.5, 25.5]
    ofcl_series = series_for(result, "OFCL")
    assert [p["tauH"] for p in ofcl_series["points"]] == [0]


def test_vmax_zero_keeps_track_but_not_intensity(result):
    # TVCA tau=0 has vmax=0 (present but non-positive): keep the track point,
    # drop it from the intensity series.
    tvca = feature_for(result, "TVCA")
    assert len(tvca["geometry"]["coordinates"]) == 2
    tvca_series = series_for(result, "TVCA")
    assert [p["tauH"] for p in tvca_series["points"]] == [12]


# --- Round 2 (v2 addendum): expanded whitelist / group / ensemble tests ---


def test_group_field_present_for_named_models(result):
    ofcl = feature_for(result, "OFCL")
    assert ofcl["properties"]["group"] == "official"

    avno = feature_for(result, "AVNO")
    assert avno["properties"]["group"] == "deterministic"
    tvca = feature_for(result, "TVCA")
    assert tvca["properties"]["group"] == "consensus"


def test_gefs_ensemble_member_recognized():
    text = (
        "AL, 09, 2026072200, 03, OFCL,   0, 255N,  875W,  85,  970, HU\n"
        "AL, 09, 2026072200, 03, AP01,   0, 256N,  876W,  60,  990, HU\n"
        "AL, 09, 2026072200, 03, AP01,  12, 257N,  878W,  65,  985, HU\n"
    )
    result = parse_adeck(text)
    ap01 = feature_for(result, "AP01")
    assert ap01 is not None
    assert ap01["properties"]["kind"] == "ensemble"
    assert ap01["properties"]["group"] == "ensemble"
    assert ap01["properties"]["label"] == "GEFS 01"
    assert len(ap01["geometry"]["coordinates"]) == 2
    # Ensemble members never contribute an intensity series entry (would
    # clutter the intensity chart with 30+ extra lines with no per-member
    # toggle to isolate one).
    assert series_for(result, "AP01") is None


def test_ecmwf_ensemble_member_recognized():
    text = "AL, 09, 2026072200, 03, UE07,   0, 256N,  876W,  60,  990, HU\n"
    result = parse_adeck(text)
    ue07 = feature_for(result, "UE07")
    assert ue07 is not None
    assert ue07["properties"]["kind"] == "ensemble"
    assert ue07["properties"]["group"] == "ensemble"
    assert ue07["properties"]["label"] == "ECMWF Ens 07"


def test_unrecognized_tech_still_skipped():
    # A tech that matches neither a named model nor the ensemble patterns
    # (e.g. CARQ, or a 3-digit oddball) is still skipped entirely, same as
    # before the whitelist expansion.
    text = "AL, 09, 2026072200, 03, CARQ,   0, 255N,  875W,  85,  970, HU\n"
    result = parse_adeck(text)
    assert feature_for(result, "CARQ") is None
    assert result["models_geojson"]["features"] == []


def test_ivcn_zero_position_still_yields_intensity():
    # IVCN (Intensity Consensus) structurally reports 0N/0W for every row in
    # real ATCF data (confirmed against the Hurricane Ida al092021 archive
    # deck) -- unlike AVNO's junk tau=48 zero-position row (which IS
    # dropped, see test_junk_zero_latlon_row_skipped), IVCN's zero position
    # is the normal case for this track-less intensity aid and must not
    # suppress its intensity value.
    text = (
        "AL, 09, 2026072200, 03, IVCN,   0,   0N,    0W,  70,    0, HU\n"
        "AL, 09, 2026072200, 03, IVCN,  12,   0N,    0W,  79,    0, HU\n"
    )
    result = parse_adeck(text)
    assert feature_for(result, "IVCN") is None  # INTENSITY_ONLY: no map track
    ivcn_series = series_for(result, "IVCN")
    assert ivcn_series is not None
    assert [p["tauH"] for p in ivcn_series["points"]] == [0, 12]
    assert ivcn_series["points"][0]["mph"] == round(70 * KT_TO_MPH)
