"""Gulf Watch ingest orchestrator: poll -> convert -> upload -> manifest.json.

Ties together gulfwatch.nhc / gulfwatch.adeck / gulfwatch.shp /
gulfwatch.outlook / gulfwatch.aifs into one pipeline run. See
shared-contracts.md for the exact manifest.json shape, blob paths, source
URLs, error rules, and Gulf box this module must honor exactly.

`run(fetch=requests.get, store=blob)` is the sole public entry point; both
`fetch` and `store` are injectable so tests can pass fake doubles (see
tests/test_pipeline.py) instead of hitting the network / a real Blob store.
`ingest.py` is the CLI entry point that calls `run()` with the real
defaults.

Network policy (shared-contracts.md Global Constraints): every fetch gets a
30s timeout and exactly one retry after a 10s backoff, all funneled through
the single `_fetch_with_retry` helper below. Every product's fetch/convert/
upload is wrapped in its own try/except and recorded in manifest["errors"]
on failure -- one bad product (or one malformed storm entry) must never
take down the whole run.
"""

from __future__ import annotations

import gzip
import time
from datetime import datetime, timezone

import requests

from gulfwatch import adeck, aifs, blob, nhc, outlook, probs, shp, text

FETCH_TIMEOUT_S = 30
RETRY_BACKOFF_S = 10

# A-deck (model guidance) URL template -- see shared-contracts.md. This
# lives here rather than in adeck.py: adeck.py is a pure text parser with no
# network I/O or URL constants of its own (unlike nhc.py/outlook.py, which
# already own the URLs they're associated with); pipeline.py is the one
# place that owns every fetch URL it uses directly.
ADECK_URL_TEMPLATE = "https://ftp.nhc.noaa.gov/atcf/aid_public/a{stormid}.dat.gz"


def _fetch_with_retry(fetch, url):
    """Fetch `url` via the injected `fetch(url, timeout=...)` callable, with
    one retry after a 10s backoff on any exception (network error or a
    raise_for_status() 4xx/5xx). Re-raises the second attempt's exception if
    it also fails."""
    last_exc = None
    for attempt in (1, 2):
        try:
            resp = fetch(url, timeout=FETCH_TIMEOUT_S)
            resp.raise_for_status()
            return resp
        except Exception as exc:  # noqa: BLE001 - deliberately broad, single retry point
            last_exc = exc
            if attempt == 1:
                time.sleep(RETRY_BACKOFF_S)
    raise last_exc


def _iso_z_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# GIS zip splitting
#
# NHC now ships one bundled "_5day_" zip per advisory containing the cone
# polygon, forecast track line, forecast track points, and watch/warning
# lines together (controller-verified against a live advisory, 2026-07-22;
# confirmed against the committed fixture ingest/tests/fixtures/
# sample_cone.zip, whose four members are:
#   al022026-014A_5day_pgn   (cone polygon)
#   al022026-014A_5day_lin   (forecast track line)
#   al022026-014A_5day_pts   (forecast track points)
#   al022026-014A_ww_wwlin   (watch/warning lines)
# shp.zip_to_geojson merges every shapefile in a zip into one
# FeatureCollection, tagging each feature with a "shapefile" property
# holding the source .shp member's basename. The predicates below split
# that merged FeatureCollection back into the three per-product layers.
# They're also correct for the CurrentStorms.json *_latest.zip fallback
# pattern, where cone/track/ww are three separate single-layer zips --
# each zip's own single layer just matches its own predicate and no other.
#
#   - cone:    "pgn" in the shapefile name.
#   - wwlines: "ww" in the shapefile name -- checked as its own independent
#              predicate (not "elif" ordering) because "..._ww_wwlin" also
#              contains the substring "lin", so the track predicate below
#              explicitly excludes anything with "ww" in it.
#   - track:   ("lin" or "pts" in the name) AND "ww" not in it. track.
#              geojson ends up holding BOTH the line and the point features.
# ---------------------------------------------------------------------------


def _select_features(geojson: dict, predicate) -> dict:
    features = [
        f
        for f in geojson.get("features", [])
        if predicate(f.get("properties", {}).get("shapefile", ""))
    ]
    return {"type": "FeatureCollection", "features": features}


def _is_cone(name: str) -> bool:
    return "pgn" in name


def _is_wwlines(name: str) -> bool:
    return "ww" in name


def _is_track(name: str) -> bool:
    return ("lin" in name or "pts" in name) and "ww" not in name


def _storm_paths(stormid: str) -> dict:
    base = f"storms/{stormid}"
    return {
        "cone": f"{base}/cone.geojson",
        "track": f"{base}/track.geojson",
        "wwlines": f"{base}/wwlines.geojson",
        "models": f"{base}/models.geojson",
        "intensity": f"{base}/intensity.json",
        "text": f"{base}/text.json",
        "probs": f"{base}/probs.json",
    }


_GIS_PREDICATES = {"cone": _is_cone, "track": _is_track, "wwlines": _is_wwlines}


def _process_gis(storm, paths, fetch, store, errors):
    """Fetch+convert+upload cone/track/wwlines for one storm whose advisory
    just changed.

    Each unique URL across the three gis_urls keys is fetched and converted
    exactly once up front (whether that attempt succeeds or fails) -- the
    common case today is all three keys pointing at the same bundled zip,
    and a failure there must not trigger three separate fetch-and-retry
    attempts (six HTTP calls) for what is really one download. Each of the
    three product keys then gets its own try/except around
    extract-and-upload (or its own error entry, reusing the cached
    exception, if its URL's fetch failed) -- so one bad *upload* still
    can't take out the others, even when their downloads succeeded.

    Returns the freshly-built track FeatureCollection (or None if the
    track product's own fetch/convert/upload failed), for the
    storm_in_gulf check.
    """
    unique_urls = {storm.gis_urls[key] for key in _GIS_PREDICATES}
    fetched: dict[str, dict] = {}
    fetch_errors: dict[str, Exception] = {}
    for url in unique_urls:
        try:
            resp = _fetch_with_retry(fetch, url)
            fetched[url] = shp.zip_to_geojson(resp.content)
        except Exception as exc:  # noqa: BLE001 - recorded per-product below
            fetch_errors[url] = exc

    track_fc = None
    for key, predicate in _GIS_PREDICATES.items():
        url = storm.gis_urls[key]
        if url in fetch_errors:
            errors.append(
                {"product": f"{storm.id}.{key}", "message": str(fetch_errors[url])}
            )
            continue
        try:
            fc = _select_features(fetched[url], predicate)
            store.put_json(paths[key], fc)
        except Exception as exc:
            errors.append({"product": f"{storm.id}.{key}", "message": str(exc)})
            continue
        if key == "track":
            track_fc = fc

    return track_fc


def _process_text_products(storm, paths, fetch, store, errors):
    """Fetch+build+upload text.json (Forecast Discussion + Public Advisory)
    and probs.json (wind speed probabilities) for one storm whose advisory
    just changed.

    text.json and probs.json are two independent products, each wrapped in
    its own try/except and labeled "{storm.id}.text" / "{storm.id}.probs"
    in manifest.errors -- one's failure (a missing URL field on this
    storm's CurrentStorms.json entry, a bad fetch, or a parse error) must
    never block the other's upload, same isolation guarantee as
    cone/track/wwlines in _process_gis above.
    """
    try:
        if not storm.discussion_url:
            raise ValueError("forecastDiscussion.url missing from CurrentStorms.json")
        if not storm.advisory_url:
            raise ValueError("publicAdvisory.url missing from CurrentStorms.json")
        discussion_resp = _fetch_with_retry(fetch, storm.discussion_url)
        advisory_resp = _fetch_with_retry(fetch, storm.advisory_url)
        text_json = text.build_text_json(
            discussion_shtml=discussion_resp.text,
            discussion_issued=storm.discussion_issued,
            advisory_shtml=advisory_resp.text,
            advisory_issued=storm.advisory_time,
        )
        store.put_json(paths["text"], text_json)
    except Exception as exc:
        errors.append({"product": f"{storm.id}.text", "message": str(exc)})

    try:
        if not storm.probs_url:
            raise ValueError("windSpeedProbabilities.url missing from CurrentStorms.json")
        probs_resp = _fetch_with_retry(fetch, storm.probs_url)
        probs_json = probs.parse_probs(probs_resp.text)
        store.put_json(paths["probs"], probs_json)
    except Exception as exc:
        errors.append({"product": f"{storm.id}.probs", "message": str(exc)})


def _process_adeck(storm, paths, prev_cycle, fetch, store, errors):
    """Fetch+decompress+parse this storm's a-deck, re-uploading
    models.geojson/intensity.json only if the parsed cycle differs from the
    prior known cycle (state.json). The a-deck is fetched every run
    regardless of whether the cycle turns out to have changed --
    CurrentStorms.json carries no field that reveals the a-deck's cycle
    without downloading and parsing the file itself, so "did the cycle
    change" can only be answered after the fact.

    Also folds in gulfwatch.aifs.fetch_aifs_tracks (ECMWF's AI-model TC
    track, an optional product with its own independent 00z/12z cycle --
    see aifs.py) whenever models.geojson is (re)built. AIFS is currently
    stubbed to always return [] (see aifs.py's SPIKE OUTCOME); the
    try/except here is what actually delivers the "AIFS never blocks a run"
    guarantee and is exercised directly in test_pipeline.py by monkeypatching
    a raising fetch_aifs_tracks.

    Returns the (possibly unchanged) cycle to persist in state.json.
    """
    url = ADECK_URL_TEMPLATE.format(stormid=storm.id)
    try:
        resp = _fetch_with_retry(fetch, url)
        # A-decks can contain odd/non-UTF-8 bytes -- decode latin-1 per
        # shared-contracts.md.
        text = gzip.decompress(resp.content).decode("latin-1")
        parsed = adeck.parse_adeck(text)
    except Exception as exc:
        errors.append({"product": f"{storm.id}.adeck", "message": str(exc)})
        return prev_cycle

    new_cycle = parsed["cycle"]
    if new_cycle != prev_cycle:
        # AIFS (ECMWF's AI model) is an optional, independently-cycled
        # product (see aifs.py) -- concatenated onto the a-deck-derived
        # models.geojson here rather than uploaded separately. It gets its
        # own try/except (product "aifs", not "{storm.id}.aifs" -- see
        # shared-contracts.md's manifest.errors example) so that ANY
        # failure (fetch, BUFR decode, or even an import error surfacing at
        # call time) degrades to "no AIFS features this run" without
        # touching the a-deck models that already succeeded.
        try:
            aifs_features = aifs.fetch_aifs_tracks(storm.id)
        except Exception as exc:  # noqa: BLE001 - AIFS must never block a run
            aifs_features = []
            errors.append({"product": "aifs", "message": str(exc)})

        models_geojson = parsed["models_geojson"]
        if aifs_features:
            models_geojson = {
                "type": "FeatureCollection",
                "features": [*models_geojson["features"], *aifs_features],
            }

        # models.geojson and intensity.json are two separate uploads with
        # their own failure modes -- label and isolate them independently
        # rather than blaming both on "models" if only one put fails.
        try:
            store.put_json(paths["models"], models_geojson)
        except Exception as exc:
            errors.append({"product": f"{storm.id}.models", "message": str(exc)})
        try:
            store.put_json(paths["intensity"], parsed["intensity"])
        except Exception as exc:
            errors.append({"product": f"{storm.id}.intensity", "message": str(exc)})
    return new_cycle


def _resolve_track_for_gulf_check(advisory_changed, fresh_track_fc, track_path, store):
    """The FeatureCollection to feed storm_in_gulf: freshly built this run
    if the advisory changed and that build succeeded, otherwise whatever is
    already on the blob store from a prior run (best-effort; a storm whose
    advisory hasn't changed still has a valid prior track on the store)."""
    if advisory_changed and fresh_track_fc is not None:
        return fresh_track_fc
    try:
        return store.get_json(track_path)
    except Exception:
        return None


def _process_storm(storm, prev_storm_state, fetch, store, errors):
    """Process one Atlantic storm: conditionally refresh its GIS + a-deck
    products, then build its manifest entry and next state.json entry."""
    paths = _storm_paths(storm.id)
    prev_advisory = prev_storm_state.get("advisory")
    prev_cycle = prev_storm_state.get("cycle")

    advisory_changed = storm.advisory_num != prev_advisory
    fresh_track_fc = None
    if advisory_changed:
        fresh_track_fc = _process_gis(storm, paths, fetch, store, errors)
        _process_text_products(storm, paths, fetch, store, errors)

    new_cycle = _process_adeck(storm, paths, prev_cycle, fetch, store, errors)

    track_for_check = _resolve_track_for_gulf_check(
        advisory_changed, fresh_track_fc, paths["track"], store
    )
    in_gulf = nhc.storm_in_gulf(storm, track_for_check)

    manifest_entry = {
        "id": storm.id,
        "name": storm.name,
        "classification": storm.classification,
        "intensityMph": round(storm.intensity_kt * adeck.KT_TO_MPH),
        "pressureMb": storm.pressure_mb,
        "movementDir": nhc.deg_to_compass(storm.movement_dir),
        "movementMph": storm.movement_mph,
        "lat": storm.lat,
        "lon": storm.lon,
        "advisoryNum": storm.advisory_num,
        "advisoryTime": storm.advisory_time,
        "nextAdvisoryTime": storm.next_advisory_time,
        "inGulfBox": in_gulf,
        "modelCycle": new_cycle,
        "files": {
            "cone": paths["cone"],
            "track": paths["track"],
            "wwlines": paths["wwlines"],
            "models": paths["models"],
            "intensity": paths["intensity"],
            "text": paths["text"],
            "probs": paths["probs"],
        },
    }
    next_state = {"advisory": storm.advisory_num, "cycle": new_cycle}
    return manifest_entry, next_state


def _process_outlook(state, fetch, store, errors):
    """Refresh outlook.geojson/outlook.json when the Atlantic TWO RSS
    pubDate has changed since the last run. Returns the issued time to
    persist in state.json (unchanged from `state` if nothing changed, or if
    a fetch/parse/upload failed along the way)."""
    prev_issued = state.get("outlook_issued")

    try:
        rss_resp = _fetch_with_retry(fetch, outlook.INDEX_AT_URL)
        rss_xml = rss_resp.text
        issued = outlook.parse_outlook_text(rss_xml)["issued"]
    except Exception as exc:
        errors.append({"product": "outlook", "message": str(exc)})
        return prev_issued

    if issued == prev_issued:
        return issued

    try:
        gtwo_resp = _fetch_with_retry(fetch, outlook.GTWO_SHAPEFILES_URL)
        geojson, outlook_json = outlook.build_outlook(gtwo_resp.content, rss_xml)
        store.put_json("outlook.geojson", geojson)
        store.put_json("outlook.json", outlook_json)
    except Exception as exc:
        errors.append({"product": "outlook", "message": str(exc)})
        return prev_issued

    return issued


def run(fetch=requests.get, store=blob) -> dict:
    """Poll NHC feeds, convert, upload changed products, and return the
    manifest dict written to manifest.json (see shared-contracts.md)."""
    state = store.get_json("state.json") or {"storms": {}, "outlook_issued": None}
    errors: list[dict] = []

    try:
        current_resp = _fetch_with_retry(fetch, nhc.CURRENT_STORMS_URL)
        current_data = current_resp.json()
    except Exception as exc:
        # CurrentStorms.json is the one feed whose failure must NOT degrade
        # to "synthesize an empty/quiet run": doing so would write a fresh
        # quiet manifest.json + state.json over whatever storm is currently
        # live on the public site during a transient NHC outage, silently
        # erasing it. Distinct from a legitimately empty activeStorms list
        # (a normal, valid quiet run -- that keeps writing normally below).
        # Write nothing to the store and propagate: ingest.py's top-level
        # try/except prints "FAILED - {exc}" and exits 1 for this run,
        # leaving last-good manifest/state untouched for the next run to
        # retry against.
        print(
            "gulf-watch ingest: CurrentStorms.json fetch failed after retry -- "
            f"aborting run, last-good manifest/state left untouched: {exc}"
        )
        raise

    # Parse one raw storm entry at a time (rather than the whole payload in
    # one nhc.parse_current_storms() call) so a single malformed entry
    # raises and is recorded per-storm without discarding every other
    # storm in the feed -- nhc.parse_current_storms itself has no
    # per-item try/except (see task-4-report.md).
    all_storms = []
    for raw in current_data.get("activeStorms", []):
        try:
            all_storms.extend(nhc.parse_current_storms({"activeStorms": [raw]}))
        except Exception as exc:
            errors.append({"product": raw.get("id", "unknown_storm"), "message": str(exc)})

    prev_storms_state = state.get("storms", {})
    new_storms_state: dict = {}
    manifest_storms = []

    for storm in all_storms:
        if not storm.id.startswith("al"):
            continue  # Atlantic basin only, per task brief
        try:
            entry, next_state = _process_storm(
                storm, prev_storms_state.get(storm.id, {}), fetch, store, errors
            )
            manifest_storms.append(entry)
            new_storms_state[storm.id] = next_state
        except Exception as exc:
            # A bad storm mid-processing must not kill the whole run;
            # carry its previous state forward unchanged so it isn't lost.
            errors.append({"product": storm.id, "message": str(exc)})
            if storm.id in prev_storms_state:
                new_storms_state[storm.id] = prev_storms_state[storm.id]

    outlook_issued = _process_outlook(state, fetch, store, errors)

    mode = "active" if any(s["inGulfBox"] for s in manifest_storms) else "quiet"

    manifest = {
        "generated": _iso_z_now(),
        "mode": mode,
        "storms": manifest_storms,
        "outlook": {
            "geojson": "outlook.geojson",
            "text": "outlook.json",
            "issued": outlook_issued,
        },
        "errors": errors,
    }

    store.put_json("manifest.json", manifest)
    # state.json written last, per task brief.
    store.put_json(
        "state.json", {"storms": new_storms_state, "outlook_issued": outlook_issued}
    )

    return manifest
