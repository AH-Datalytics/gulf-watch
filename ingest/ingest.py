"""Gulf Watch ingest entry point.

Run as `python ingest.py`. Polls NHC feeds, converts, and uploads to Vercel
Blob via gulfwatch.pipeline.run(), producing manifest.json. Exits 0 even
when individual products error (see the printed error count / manifest.
json's "errors" list) -- exits 1 only if the whole run raises.
"""

from __future__ import annotations

import sys

from gulfwatch.pipeline import run


def main() -> int:
    try:
        manifest = run()
    except Exception as exc:  # noqa: BLE001 - top-level guard, see module docstring
        print(f"gulf-watch ingest: FAILED - {exc}")
        return 1

    mode = manifest.get("mode")
    n_storms = len(manifest.get("storms", []))
    n_errors = len(manifest.get("errors", []))
    print(f"gulf-watch ingest: mode={mode} storms={n_storms} errors={n_errors}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
