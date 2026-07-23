"""ECMWF AIFS AI-model tropical cyclone track ingest (optional product).

Intended contract (Task 5 brief / shared-contracts.md): fetch + decode the
ECMWF open-data AIFS ("aifs-single") tropical cyclone track product
(`type="tf"`, BUFR format -- only produced while a storm is active) and
return LineString features with properties
`{"model": "AIFS", "label": "AIFS (ECMWF)", "kind": "ai", "cycle": ...}`,
matched to the requested storm by ATCF id / name fields in the BUFR, falling
back to a <2 deg distance check against the storm's tau-0 position when
matching is unreliable. AIFS runs only at 00z/12z, so its own cycle may
differ from the a-deck cycle used elsewhere in models.geojson -- callers
must NOT assume they match.

SPIKE OUTCOME (2026-07-22, this repo's Windows dev machine, live conditions:
TS Bertha / AL022026 active in the Gulf -- ideal spike timing): STOPPED per
the Task 5 brief's SPIKE STOP RULE, after hitting the exact wall the brief
called out in advance. Findings:

  1. `pip install ecmwf-opendata eccodes` succeeds cleanly (eccodes==2.47.0,
     ecmwf-opendata==0.3.31, both pure-Python wheels).
  2. `import eccodes` raises
     `RuntimeError: Cannot find the ecCodes library` at import time. The
     PyPI `eccodes` package is only cffi *bindings*; it does not bundle the
     compiled ecCodes C library on Windows. `findlibs.find("eccodes")`
     confirms no system install is discoverable either. The normal fix is
     `conda install -c conda-forge eccodes` (no conda/mamba present on this
     machine) or building the C library from source (needs a Fortran
     toolchain) -- both out of scope for a 30-minute spike.
  3. Independently of (2), `ecmwf.opendata.Client(model="aifs-single")
     .latest(type="tf")` raised
     `ValueError: Cannot establish latest date for {...'type': ['tf']...}`
     for today's date/params, meaning even the *fetch* side needs more
     discovery work (exact date/time/stream arguments) before decoding
     could be attempted at all.

Per the brief's explicit preference ("ship v1 without AIFS over stalling"),
this module is stubbed: `fetch_aifs_tracks` always returns `[]` and never
raises. pipeline.py still wraps the call in its own try/except (see
`_process_adeck`), so the degradation path is real and tested even though
nothing can currently trigger it from inside this module.

TODO(phase2):
  1. Get `import eccodes` working: either move ingest to a Linux runner with
     `apt-get install -y libeccodes0` (matches the brief's "or ubuntu-latest"
     alternative, untested here) or set up conda-forge's `eccodes` locally.
  2. Re-run the `ecmwf.opendata.Client(source="ecmwf",
     model="aifs-single").retrieve(type="tf", step=0, target=...)` fetch
     with explicit `date=`/`time=`/`stream=` (don't rely on `.latest()`'s
     auto-resolution, which failed in the spike) and confirm the product is
     actually being published for the storm in question.
  3. Decode the BUFR with `eccodes.codes_bufr_new_from_file` +
     `codes_set(handle, "unpack", 1)`; find the real key names for
     storm identifier / ATCF id / name in a real downloaded file (unknown
     until step 1-2 unblock this) and match against `storm_atcf_id`, falling
     back to the <2 deg-from-tau-0-position rule from the brief when no
     identifier field matches reliably.
  4. Save a trimmed real BUFR fixture to
     `ingest/tests/fixtures/aifs_tf_sample.bufr` and TDD the decode against
     it (Step 2 of the task brief: fixture decodes to >=1 LineString with
     the correct properties; any exception path -> []).
  5. Only then reintroduce `ecmwf-opendata` / `eccodes` to
     ingest/requirements.txt -- deliberately left out of it for now since
     nothing in the shipped code imports them.
"""

from __future__ import annotations


def fetch_aifs_tracks(storm_atcf_id: str, fetch_impl=None) -> list[dict]:
    """Fetch + decode the current ECMWF AIFS AI-model TC track ("tf" BUFR
    product) for `storm_atcf_id`, returning a list of GeoJSON LineString
    Feature dicts with properties
    `{"model": "AIFS", "label": "AIFS (ECMWF)", "kind": "ai", "cycle": ...}`.

    `fetch_impl` is accepted per the Task 5 interface contract (an
    injectable fetch callable, mirroring pipeline.py's `fetch`/`store`
    doubles) but is unused by this stub.

    Phase-2 stub -- see module docstring's SPIKE OUTCOME / TODO(phase2).
    Always returns `[]` and never raises: there is no real fetch/decode
    attempt to fail. Kept as a real function (rather than deleting the
    module) so pipeline.py has a stable seam to call today and phase 2 can
    fill in without changing the pipeline wiring.
    """
    return []
