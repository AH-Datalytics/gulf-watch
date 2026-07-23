"""Vercel Blob REST client for Gulf Watch ingest.

Writes go through the Vercel Blob REST PUT endpoint using
`BLOB_READ_WRITE_TOKEN`; reads go directly against the public store base URL
(`BLOB_BASE_URL`) since everything this pipeline uploads is public-read (see
shared-contracts.md's blob paths list).

This module always uses `requests` directly rather than an injectable
`fetch` -- pipeline.py is the piece that needs fetch/store injected for
testing (see its docstring); blob.py itself is exercised live in Task 4
Step 4, not under the Step 1/2 fake-double tests.
"""

from __future__ import annotations

import json
import os
import time

import requests

# PUT target for writes. Public reads go through BLOB_BASE_URL instead (a
# per-store public CDN base, e.g. "https://<store>.public.blob.vercel-storage.com").
BLOB_PUT_BASE = "https://blob.vercel-storage.com"

TIMEOUT_S = 30
# One retry after a 10s backoff, per shared-contracts.md's Global
# Constraints network policy. Uses the module-level `time.sleep` (rather
# than a hardcoded call) so tests can monkeypatch `blob.time.sleep` to a
# no-op instead of actually sleeping 10s.
RETRY_BACKOFF_S = 10


def _with_retry(operation):
    """Call `operation()` (a zero-arg callable wrapping one request), retry
    once after a 10s backoff on any exception, and re-raise the second
    attempt's exception if it also fails."""
    last_exc = None
    for attempt in (1, 2):
        try:
            return operation()
        except Exception as exc:  # noqa: BLE001 - deliberately broad, single retry point
            last_exc = exc
            if attempt == 1:
                time.sleep(RETRY_BACKOFF_S)
    raise last_exc


def _token() -> str:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not set")
    return token


def _base_url() -> str:
    base = os.environ.get("BLOB_BASE_URL")
    if not base:
        raise RuntimeError("BLOB_BASE_URL is not set")
    return base.rstrip("/")


def put_bytes(path: str, data: bytes, content_type: str) -> None:
    """PUT raw bytes to the Vercel Blob store at `path`, overwriting any
    existing blob there (Gulf Watch always wants the same well-known paths
    from shared-contracts.md, never randomized ones).

    Header values below are per the Task 4 brief's spec -- PENDING LIVE
    VERIFICATION against a real Vercel Blob store (Step 4 of this task). If
    the API rejects any of these, check the current Vercel Blob REST docs
    and correct here; record what actually worked in this comment.
    """
    headers = {
        "Authorization": f"Bearer {_token()}",
        "x-api-version": "7",
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
        "Content-Type": content_type,
    }

    def _do():
        resp = requests.put(
            f"{BLOB_PUT_BASE}/{path}", headers=headers, data=data, timeout=TIMEOUT_S
        )
        resp.raise_for_status()
        return resp

    _with_retry(_do)


def put_json(path: str, obj: dict) -> None:
    """PUT `obj` as JSON to `path` (see put_bytes)."""
    put_bytes(path, json.dumps(obj).encode("utf-8"), "application/json")


def get_json(path: str) -> dict | None:
    """GET a JSON blob from the public read base URL. Returns None on a 404
    (blob not created yet -- e.g. state.json on the very first run).

    A 404 is a normal, definitive "not found" answer -- it is not retried
    and does not raise. Anything else non-2xx (or a transport-level
    exception, e.g. a connection error) goes through the same one-retry
    policy as put_bytes.
    """

    def _do():
        resp = requests.get(f"{_base_url()}/{path}", timeout=TIMEOUT_S)
        if resp.status_code != 404:
            resp.raise_for_status()
        return resp

    resp = _with_retry(_do)
    if resp.status_code == 404:
        return None
    return resp.json()
