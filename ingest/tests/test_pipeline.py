"""Tests for the ingest orchestrator (poll -> convert -> upload ->
manifest.json), using fake fetch/store doubles per the Task 4 brief -- no
real network or Blob store calls happen anywhere in this file.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest

from gulfwatch import nhc, outlook
from gulfwatch.pipeline import ADECK_URL_TEMPLATE, run
import gulfwatch.pipeline as pipeline_module

FIXTURES = Path(__file__).parent / "fixtures"
CURRENT_STORMS_JSON = json.loads((FIXTURES / "current_storms.json").read_text())
SAMPLE_CONE_ZIP = (FIXTURES / "sample_cone.zip").read_bytes()
GTWO_ZIP = (FIXTURES / "gtwo_shapefiles.zip").read_bytes()
INDEX_AT_XML = (FIXTURES / "index-at.xml").read_text(encoding="utf-8")

# Bertha (al022026): the only Atlantic/Gulf storm in current_storms.json,
# real advisory-14a data with cone/track/wwlines all pointing at the same
# bundled "5day" zip -- see task-nhc.py's own tests for the raw values.
BERTHA_GIS_URL = "https://www.nhc.noaa.gov/gis/forecast/archive/al022026_5day_014A.zip"
BERTHA_ADECK_URL = ADECK_URL_TEMPLATE.format(stormid="al022026")

# The TWO RSS item's pubDate in the committed index-at.xml fixture (see
# test_outlook.py's test_real_fixture_issued_parses_to_iso8601).
OUTLOOK_ISSUED = "2026-07-22T23:06:25Z"

BERTHA_ADECK_TEXT = (
    "AL, 02, 2026072200, 03, OFCL,   0, 295N,  905W,  40, 1002, TS\n"
    "AL, 02, 2026072200, 03, OFCL,  12, 296N,  913W,  40, 1000, TS\n"
)


def _adeck_gz(text: str) -> bytes:
    return gzip.compress(text.encode("latin-1"))


# ---------------------------------------------------------------------------
# Fake fetch/store doubles
# ---------------------------------------------------------------------------


class FakeResponse:
    """Minimal requests.Response look-alike: .content, .text, .json(),
    .raise_for_status()."""

    def __init__(self, *, content=None, text=None, json_data=None, status_code=200):
        self._content = content
        self._text = text
        self._json_data = json_data
        self.status_code = status_code

    @property
    def content(self):
        return self._content

    @property
    def text(self):
        if self._text is not None:
            return self._text
        return (self._content or b"").decode("utf-8")

    def json(self):
        if self._json_data is not None:
            return self._json_data
        return json.loads(self.text)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeFetch:
    """Routes url -> FakeResponse. Urls in `raising` raise instead of
    returning a response (both retry attempts, so callers see a real
    failure after pipeline.py's one-retry policy)."""

    def __init__(self, routes: dict, raising: set | None = None):
        self.routes = routes
        self.raising = raising or set()
        self.calls: list[str] = []

    def __call__(self, url, timeout=None):
        self.calls.append(url)
        if url in self.raising:
            raise RuntimeError(f"simulated network failure: {url}")
        if url not in self.routes:
            raise AssertionError(f"unexpected fetch url (no route registered): {url}")
        return self.routes[url]


class FakeStore:
    """In-memory get_json/put_json/put_bytes double. `raising_paths` lets a
    test make a specific put_json path fail (e.g. to test per-product error
    labeling) without touching every other path."""

    def __init__(self, initial: dict | None = None, raising_paths: set | None = None):
        self.data = dict(initial or {})
        self.put_calls: list[str] = []
        self.raising_paths = raising_paths or set()

    def get_json(self, path):
        return self.data.get(path)

    def put_json(self, path, obj):
        if path in self.raising_paths:
            raise RuntimeError(f"simulated store failure: {path}")
        self.data[path] = obj
        self.put_calls.append(path)

    def put_bytes(self, path, data, content_type):
        if path in self.raising_paths:
            raise RuntimeError(f"simulated store failure: {path}")
        self.data[path] = data
        self.put_calls.append(path)


def _outlook_routes():
    return {
        outlook.INDEX_AT_URL: FakeResponse(text=INDEX_AT_XML),
        outlook.GTWO_SHAPEFILES_URL: FakeResponse(content=GTWO_ZIP),
    }


@pytest.fixture(autouse=True)
def no_real_sleep(monkeypatch):
    # Never actually sleep 10s in tests, even when a retry path is hit.
    monkeypatch.setattr("gulfwatch.pipeline.time.sleep", lambda seconds: None)


# ---------------------------------------------------------------------------
# Quiet path: no storms -> outlook refreshed, mode == "quiet"
# ---------------------------------------------------------------------------


def test_quiet_path_no_storms_outlook_refreshed():
    routes = {nhc.CURRENT_STORMS_URL: FakeResponse(json_data={"activeStorms": []})}
    routes.update(_outlook_routes())
    fetch = FakeFetch(routes)
    store = FakeStore()

    manifest = run(fetch=fetch, store=store)

    assert manifest["mode"] == "quiet"
    assert manifest["storms"] == []
    assert manifest["errors"] == []
    assert manifest["outlook"] == {
        "geojson": "outlook.geojson",
        "text": "outlook.json",
        "issued": OUTLOOK_ISSUED,
    }
    assert "outlook.geojson" in store.put_calls
    assert "outlook.json" in store.put_calls
    assert "manifest.json" in store.put_calls
    assert "state.json" in store.put_calls
    assert store.data["state.json"] == {"storms": {}, "outlook_issued": OUTLOOK_ISSUED}


# ---------------------------------------------------------------------------
# Active path: Bertha (in Gulf box) -> mode == "active", all five storm
# files uploaded, state advanced.
# ---------------------------------------------------------------------------


def test_active_path_all_five_storm_files_uploaded_and_state_advanced():
    routes = {
        nhc.CURRENT_STORMS_URL: FakeResponse(json_data=CURRENT_STORMS_JSON),
        BERTHA_GIS_URL: FakeResponse(content=SAMPLE_CONE_ZIP),
        BERTHA_ADECK_URL: FakeResponse(content=_adeck_gz(BERTHA_ADECK_TEXT)),
    }
    routes.update(_outlook_routes())
    fetch = FakeFetch(routes)
    store = FakeStore()

    manifest = run(fetch=fetch, store=store)

    assert manifest["mode"] == "active"
    assert manifest["errors"] == []
    # Fausto (ep062026) is East Pacific -- excluded, only Bertha remains.
    assert [s["id"] for s in manifest["storms"]] == ["al022026"]

    bertha = manifest["storms"][0]
    assert bertha["name"] == "Bertha"
    assert bertha["classification"] == "TS"
    assert bertha["intensityMph"] == round(40 * 1.15078)  # 46
    assert bertha["pressureMb"] == 1002
    assert bertha["movementDir"] == "W"  # movement_dir 260 deg -> compass W
    assert bertha["movementMph"] == 7
    assert bertha["lat"] == 29.5
    assert bertha["lon"] == -90.5
    assert bertha["advisoryNum"] == "014a"
    assert bertha["advisoryTime"] == "2026-07-23T00:00:00Z"
    assert bertha["nextAdvisoryTime"] == "2026-07-23T06:00:00Z"
    assert bertha["inGulfBox"] is True
    assert bertha["modelCycle"] == "2026072200"
    assert bertha["files"] == {
        "cone": "storms/al022026/cone.geojson",
        "track": "storms/al022026/track.geojson",
        "wwlines": "storms/al022026/wwlines.geojson",
        "models": "storms/al022026/models.geojson",
        "intensity": "storms/al022026/intensity.json",
    }

    for path in bertha["files"].values():
        assert path in store.put_calls

    cone_fc = store.data["storms/al022026/cone.geojson"]
    assert {f["properties"]["shapefile"] for f in cone_fc["features"]} == {
        "al022026-014A_5day_pgn"
    }
    track_fc = store.data["storms/al022026/track.geojson"]
    assert {f["properties"]["shapefile"] for f in track_fc["features"]} == {
        "al022026-014A_5day_lin",
        "al022026-014A_5day_pts",
    }
    ww_fc = store.data["storms/al022026/wwlines.geojson"]
    assert {f["properties"]["shapefile"] for f in ww_fc["features"]} == {
        "al022026-014A_ww_wwlin"
    }

    assert store.data["state.json"]["storms"]["al022026"] == {
        "advisory": "014a",
        "cycle": "2026072200",
    }

    # cone/track/wwlines share one bundled zip in this fixture -- must be
    # fetched (and converted) only once, not three times.
    assert fetch.calls.count(BERTHA_GIS_URL) == 1


# ---------------------------------------------------------------------------
# No-change path: same advisory + a-deck cycle already in state.json ->
# no storm GIS/a-deck uploads (and no GIS re-fetch at all).
# ---------------------------------------------------------------------------


def test_no_change_path_same_advisory_and_cycle_skips_storm_uploads():
    initial_state = {
        "storms": {"al022026": {"advisory": "014a", "cycle": "2026072200"}},
        "outlook_issued": OUTLOOK_ISSUED,  # unchanged too, isolates this test's assertion
    }
    # A prior run's track.geojson, already showing Bertha's position inside
    # the Gulf box -- this run must reuse it rather than refetching GIS.
    prior_track_fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-90.5, 29.5]},
                "properties": {"shapefile": "al022026-014A_5day_pts"},
            }
        ],
    }
    store = FakeStore(
        {
            "state.json": initial_state,
            "storms/al022026/track.geojson": prior_track_fc,
        }
    )
    routes = {
        nhc.CURRENT_STORMS_URL: FakeResponse(json_data=CURRENT_STORMS_JSON),
        BERTHA_ADECK_URL: FakeResponse(content=_adeck_gz(BERTHA_ADECK_TEXT)),
    }
    routes.update(_outlook_routes())
    # Deliberately no GIS zip route registered -- FakeFetch raises
    # AssertionError if the pipeline tries to fetch it.
    fetch = FakeFetch(routes)

    manifest = run(fetch=fetch, store=store)

    assert manifest["mode"] == "active"
    assert manifest["errors"] == []
    bertha = manifest["storms"][0]
    assert bertha["advisoryNum"] == "014a"
    assert bertha["modelCycle"] == "2026072200"
    assert bertha["inGulfBox"] is True

    storm_upload_paths = {
        "storms/al022026/cone.geojson",
        "storms/al022026/track.geojson",
        "storms/al022026/wwlines.geojson",
        "storms/al022026/models.geojson",
        "storms/al022026/intensity.json",
    }
    assert not (storm_upload_paths & set(store.put_calls))
    assert "outlook.geojson" not in store.put_calls
    assert "outlook.json" not in store.put_calls
    assert BERTHA_GIS_URL not in fetch.calls


# ---------------------------------------------------------------------------
# Error path: cone download raises -> manifest has an errors entry, other
# products still uploaded.
# ---------------------------------------------------------------------------


def test_error_path_cone_failure_still_uploads_other_products():
    cone_url = "https://fake.example/cone.zip"
    track_url = "https://fake.example/track.zip"
    ww_url = "https://fake.example/ww.zip"

    bertha_raw = dict(CURRENT_STORMS_JSON["activeStorms"][0])
    storms_json = {
        "activeStorms": [
            {
                **bertha_raw,
                "trackCone": {**bertha_raw["trackCone"], "zipFile": cone_url},
                "forecastTrack": {**bertha_raw["forecastTrack"], "zipFile": track_url},
                "windWatchesWarnings": {
                    **bertha_raw["windWatchesWarnings"],
                    "zipFile": ww_url,
                },
            }
        ]
    }

    routes = {
        nhc.CURRENT_STORMS_URL: FakeResponse(json_data=storms_json),
        track_url: FakeResponse(content=SAMPLE_CONE_ZIP),
        ww_url: FakeResponse(content=SAMPLE_CONE_ZIP),
        BERTHA_ADECK_URL: FakeResponse(content=_adeck_gz(BERTHA_ADECK_TEXT)),
    }
    routes.update(_outlook_routes())
    fetch = FakeFetch(routes, raising={cone_url})
    store = FakeStore()

    manifest = run(fetch=fetch, store=store)

    assert manifest["errors"] == [
        {"product": "al022026.cone", "message": "simulated network failure: https://fake.example/cone.zip"}
    ]

    assert "storms/al022026/track.geojson" in store.put_calls
    assert "storms/al022026/wwlines.geojson" in store.put_calls
    assert "storms/al022026/models.geojson" in store.put_calls
    assert "storms/al022026/intensity.json" in store.put_calls
    assert "storms/al022026/cone.geojson" not in store.put_calls

    bertha = manifest["storms"][0]
    # Resolved via storm.lat/lon (29.5, -90.5) directly -- storm_in_gulf
    # doesn't even need the track (which also happened to succeed here).
    assert bertha["inGulfBox"] is True

    # cone_url is retried once (per the 30s/one-retry-at-10s-backoff policy)
    # before giving up.
    assert fetch.calls.count(cone_url) == 2


# ---------------------------------------------------------------------------
# Bonus: one malformed storm entry in CurrentStorms.json must not discard
# every other storm in the feed (critical integration fact from the task
# brief -- nhc.parse_current_storms has no per-item try/except of its own).
# ---------------------------------------------------------------------------


def test_malformed_storm_entry_does_not_kill_the_run():
    bad = {"id": "al992026", "name": "Malformed"}  # missing required fields
    good = dict(CURRENT_STORMS_JSON["activeStorms"][0])  # Bertha, valid
    storms_json = {"activeStorms": [bad, good]}

    routes = {
        nhc.CURRENT_STORMS_URL: FakeResponse(json_data=storms_json),
        BERTHA_GIS_URL: FakeResponse(content=SAMPLE_CONE_ZIP),
        BERTHA_ADECK_URL: FakeResponse(content=_adeck_gz(BERTHA_ADECK_TEXT)),
    }
    routes.update(_outlook_routes())
    fetch = FakeFetch(routes)
    store = FakeStore()

    manifest = run(fetch=fetch, store=store)

    assert [s["id"] for s in manifest["storms"]] == ["al022026"]
    error_products = {e["product"] for e in manifest["errors"]}
    assert "al992026" in error_products


# ---------------------------------------------------------------------------
# Regression: a shared GIS URL (the common case -- cone/track/wwlines all
# point at one bundled zip) that fails must be fetched exactly once (plus
# its one retry), not once per product key. Each of the three products
# still gets its own manifest.errors entry (so callers can see all three
# products are missing), but no *extra* HTTP attempts happen beyond the
# single fetch's own retry.
# ---------------------------------------------------------------------------


def test_shared_gis_url_failure_dedupes_fetch_attempts():
    routes = {
        nhc.CURRENT_STORMS_URL: FakeResponse(json_data=CURRENT_STORMS_JSON),
        BERTHA_ADECK_URL: FakeResponse(content=_adeck_gz(BERTHA_ADECK_TEXT)),
    }
    routes.update(_outlook_routes())
    # Bertha's cone/track/wwlines gis_urls all point at BERTHA_GIS_URL in the
    # fixture -- make that one shared URL fail.
    fetch = FakeFetch(routes, raising={BERTHA_GIS_URL})
    store = FakeStore()

    manifest = run(fetch=fetch, store=store)

    error_products = {e["product"] for e in manifest["errors"]}
    assert error_products == {"al022026.cone", "al022026.track", "al022026.wwlines"}
    assert len(manifest["errors"]) == 3

    # Exactly one fetch attempt + one retry for the shared URL -- NOT one
    # attempt+retry pair per product key (which would be 6 calls).
    assert fetch.calls.count(BERTHA_GIS_URL) == 2

    for path in (
        "storms/al022026/cone.geojson",
        "storms/al022026/track.geojson",
        "storms/al022026/wwlines.geojson",
    ):
        assert path not in store.put_calls


# ---------------------------------------------------------------------------
# Minor fix: models.geojson and intensity.json are two separate uploads and
# must get two separately-labeled error entries, not both blamed on
# "{id}.models".
# ---------------------------------------------------------------------------


def test_adeck_models_and_intensity_upload_failures_labeled_separately():
    store = FakeStore(raising_paths={"storms/al022026/intensity.json"})
    routes = {
        nhc.CURRENT_STORMS_URL: FakeResponse(json_data=CURRENT_STORMS_JSON),
        BERTHA_GIS_URL: FakeResponse(content=SAMPLE_CONE_ZIP),
        BERTHA_ADECK_URL: FakeResponse(content=_adeck_gz(BERTHA_ADECK_TEXT)),
    }
    routes.update(_outlook_routes())
    fetch = FakeFetch(routes)

    manifest = run(fetch=fetch, store=store)

    error_products = {e["product"] for e in manifest["errors"]}
    assert error_products == {"al022026.intensity"}
    assert "al022026.models" not in error_products
    # models.geojson upload itself succeeded independently of intensity's failure.
    assert "storms/al022026/models.geojson" in store.put_calls
    assert "storms/al022026/intensity.json" not in store.put_calls


# ---------------------------------------------------------------------------
# AIFS graceful degradation (Task 5): gulfwatch.aifs.fetch_aifs_tracks is
# stubbed to always return [] and never raise (see aifs.py's SPIKE
# OUTCOME), but pipeline.py wraps the call in its own try/except regardless
# -- this test proves that guarantee directly by monkeypatching a raising
# fetch_aifs_tracks, independent of whether the real implementation ever
# raises. A raising AIFS fetcher must still produce a full manifest (all
# other storm products uploaded, mode/inGulfBox computed normally) plus one
# "aifs" error entry -- it must never take down the run.
# ---------------------------------------------------------------------------


def test_aifs_failure_degrades_gracefully_and_still_produces_full_manifest(monkeypatch):
    def raising_fetch_aifs_tracks(storm_atcf_id, fetch_impl=None):
        raise RuntimeError("simulated BUFR decode failure")

    monkeypatch.setattr(
        pipeline_module.aifs, "fetch_aifs_tracks", raising_fetch_aifs_tracks
    )

    routes = {
        nhc.CURRENT_STORMS_URL: FakeResponse(json_data=CURRENT_STORMS_JSON),
        BERTHA_GIS_URL: FakeResponse(content=SAMPLE_CONE_ZIP),
        BERTHA_ADECK_URL: FakeResponse(content=_adeck_gz(BERTHA_ADECK_TEXT)),
    }
    routes.update(_outlook_routes())
    fetch = FakeFetch(routes)
    store = FakeStore()

    manifest = run(fetch=fetch, store=store)

    assert manifest["errors"] == [
        {"product": "aifs", "message": "simulated BUFR decode failure"}
    ]

    # The rest of the run still completed normally: full manifest entry,
    # all five storm files uploaded, mode computed correctly.
    assert manifest["mode"] == "active"
    bertha = manifest["storms"][0]
    assert bertha["id"] == "al022026"
    assert bertha["inGulfBox"] is True
    for path in bertha["files"].values():
        assert path in store.put_calls

    # models.geojson still holds the a-deck-derived features (OFCL) -- just
    # with no AIFS features concatenated in, since the fetch raised.
    models_fc = store.data["storms/al022026/models.geojson"]
    assert {f["properties"]["model"] for f in models_fc["features"]} == {"OFCL"}
