"""Tests for gulfwatch.aifs (ECMWF AIFS AI-model TC track ingest).

Phase-2 stub (see aifs.py module docstring for the spike outcome that led
here): `fetch_aifs_tracks` is not yet a real fetch/decode -- it always
returns `[]` and never raises. These tests pin that contract so pipeline.py
can keep relying on "AIFS never blocks a run" while phase 2 is pending, and
so a future real implementation replacing this stub has to consciously
update (not silently break) this file.
"""

from __future__ import annotations

from gulfwatch.aifs import fetch_aifs_tracks


def test_fetch_aifs_tracks_stub_returns_empty_list():
    assert fetch_aifs_tracks("al022026") == []


def test_fetch_aifs_tracks_stub_accepts_fetch_impl_without_using_it():
    # fetch_impl is part of the Task 5 interface contract (mirrors
    # pipeline.py's injectable fetch/store doubles) but the stub never
    # calls it -- passing one that would raise if invoked proves that.
    def boom(*_args, **_kwargs):
        raise RuntimeError("fetch_impl should never be called by the stub")

    assert fetch_aifs_tracks("al022026", fetch_impl=boom) == []
