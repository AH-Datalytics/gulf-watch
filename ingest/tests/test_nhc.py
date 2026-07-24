"""Tests for the NHC current storms (CurrentStorms.json) parser."""

import json
from pathlib import Path

import pytest

from gulfwatch.nhc import (
    GULF_LAT_MAX,
    GULF_LAT_MIN,
    GULF_LON_MAX,
    GULF_LON_MIN,
    Storm,
    deg_to_compass,
    in_gulf_box,
    parse_current_storms,
    storm_in_gulf,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "current_storms.json"


@pytest.fixture(scope="module")
def storms():
    data = json.loads(FIXTURE_PATH.read_text())
    return parse_current_storms(data)


@pytest.fixture
def bertha(storms):
    return next(s for s in storms if s.id == "al022026")


@pytest.fixture
def fausto(storms):
    return next(s for s in storms if s.id == "ep062026")


def test_gulf_box_constants():
    assert (GULF_LON_MIN, GULF_LON_MAX) == (-98.0, -80.0)
    assert (GULF_LAT_MIN, GULF_LAT_MAX) == (18.0, 31.0)


def test_in_gulf_box():
    assert in_gulf_box(29.9, -90.1) is True
    assert in_gulf_box(25.0, -60.0) is False


def test_parse_returns_both_fixture_storms(storms):
    assert len(storms) == 2
    assert {s.id for s in storms} == {"al022026", "ep062026"}


def test_bertha_fields_match_fixture(bertha):
    # Real Bertha data committed at ingest/tests/fixtures/current_storms.json.
    assert bertha.id == "al022026"
    assert bertha.name == "Bertha"
    assert bertha.classification == "TS"
    assert bertha.intensity_kt == 40
    assert bertha.pressure_mb == 1002
    assert bertha.movement_dir == 260
    assert bertha.movement_mph == 7
    assert bertha.lat == 29.5
    assert bertha.lon == -90.5
    assert bertha.advisory_num == "014a"
    assert bertha.advisory_time == "2026-07-23T00:00:00Z"
    assert bertha.next_advisory_time == "2026-07-23T06:00:00Z"


def test_bertha_in_gulf_box_is_true(bertha):
    # Real assertion: Bertha is in the Gulf box right now.
    assert in_gulf_box(bertha.lat, bertha.lon) is True


def test_bertha_text_product_urls_and_issued_times(bertha):
    # forecastDiscussion/publicAdvisory/windSpeedProbabilities URLs + the
    # discussion's own issuance, carried through for gulfwatch.text/probs.
    assert bertha.discussion_url == "https://www.nhc.noaa.gov/text/MIATCDAT2.shtml"
    assert bertha.discussion_issued == "2026-07-22T21:00:00Z"
    assert bertha.advisory_url == "https://www.nhc.noaa.gov/text/MIATCPAT2.shtml"
    # publicAdvisory's issued time is Storm.advisory_time itself -- no
    # separate/duplicate field needed (see nhc.py).
    assert bertha.advisory_time == "2026-07-23T00:00:00Z"
    assert bertha.probs_url == "https://www.nhc.noaa.gov/text/MIAPWSAT2.shtml"


def test_bertha_gis_urls_all_explicit_from_json(bertha):
    # All three GIS product fields point at the same "5day" package zip for
    # this advisory -- that's expected NHC behavior, not a bug.
    expected = "https://www.nhc.noaa.gov/gis/forecast/archive/al022026_5day_014A.zip"
    assert bertha.gis_urls == {
        "cone": expected,
        "track": expected,
        "wwlines": expected,
        "windfield": "https://www.nhc.noaa.gov/gis/forecast/archive/al022026_fcst_014A.zip",
    }


def test_fausto_wwlines_falls_back_to_latest_pattern(fausto):
    # Fausto's windWatchesWarnings is null in the fixture -> fallback pattern.
    assert (
        fausto.gis_urls["wwlines"]
        == "https://www.nhc.noaa.gov/storm_graphics/api/EP062026_WW_latest.zip"
    )
    # cone/track are present explicitly in the fixture.
    assert (
        fausto.gis_urls["cone"]
        == "https://www.nhc.noaa.gov/gis/forecast/archive/ep062026_5day_016.zip"
    )
    assert (
        fausto.gis_urls["track"]
        == "https://www.nhc.noaa.gov/gis/forecast/archive/ep062026_5day_016.zip"
    )
    assert fausto.gis_urls["windfield"] == "https://www.nhc.noaa.gov/gis/forecast/archive/ep062026_fcst_016.zip"


def test_fausto_not_in_gulf_box(fausto):
    assert in_gulf_box(fausto.lat, fausto.lon) is False


@pytest.mark.parametrize(
    "deg,expected",
    [
        (0, "N"),
        (11, "N"),
        (90, "E"),
        (180, "S"),
        (247, "WSW"),
        (258.75, "W"),
        (260, "W"),  # Bertha's movementDir
        (270, "W"),
        (281.24, "W"),
        (349, "N"),
        (360, "N"),
    ],
)
def test_deg_to_compass(deg, expected):
    assert deg_to_compass(deg) == expected


def test_storm_in_gulf_true_by_current_position(bertha):
    assert storm_in_gulf(bertha, None) is True


def test_storm_in_gulf_false_when_far_and_no_track():
    storm = Storm(
        id="ep992026",
        name="Test",
        classification="TS",
        intensity_kt=40,
        pressure_mb=1002,
        movement_dir=260,
        movement_mph=7,
        lat=17.2,
        lon=-122.0,
        advisory_num="001",
        advisory_time="2026-07-22T21:00:00Z",
        next_advisory_time="2026-07-23T03:00:00Z",
        gis_urls={},
    )
    assert storm_in_gulf(storm, None) is False


def test_storm_in_gulf_true_via_forecast_track_point_only():
    # Position is well outside the box, but a forecast track point is inside.
    storm = Storm(
        id="ep992026",
        name="Test",
        classification="TS",
        intensity_kt=40,
        pressure_mb=1002,
        movement_dir=260,
        movement_mph=7,
        lat=17.2,
        lon=-122.0,
        advisory_num="001",
        advisory_time="2026-07-22T21:00:00Z",
        next_advisory_time="2026-07-23T03:00:00Z",
        gis_urls={},
    )
    track_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-122.0, 17.2], [-90.0, 25.0]],
                },
                "properties": {},
            }
        ],
    }
    assert storm_in_gulf(storm, track_geojson) is True


def test_storm_in_gulf_false_when_track_never_enters_box():
    storm = Storm(
        id="ep992026",
        name="Test",
        classification="TS",
        intensity_kt=40,
        pressure_mb=1002,
        movement_dir=260,
        movement_mph=7,
        lat=17.2,
        lon=-122.0,
        advisory_num="001",
        advisory_time="2026-07-22T21:00:00Z",
        next_advisory_time="2026-07-23T03:00:00Z",
        gis_urls={},
    )
    track_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-122.0, 17.2], [-115.0, 20.0]],
                },
                "properties": {},
            }
        ],
    }
    assert storm_in_gulf(storm, track_geojson) is False
