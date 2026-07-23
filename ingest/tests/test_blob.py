"""Tests for the Vercel Blob REST client's retry policy.

Only the 30s-timeout/one-10s-retry network policy is exercised here --
header correctness is only verifiable against a live store (Task 4 Step 4),
not under test. `requests.put`/`requests.get` are monkeypatched directly
since blob.py deliberately uses `requests` itself rather than an injectable
fetch (see pipeline.py's docstring for why).
"""

from __future__ import annotations

import pytest

from gulfwatch import blob


@pytest.fixture(autouse=True)
def no_real_sleep(monkeypatch):
    # Never actually sleep 10s in tests, even on the retry path.
    monkeypatch.setattr(blob.time, "sleep", lambda seconds: None)


@pytest.fixture(autouse=True)
def blob_env(monkeypatch):
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "fake-token")
    monkeypatch.setenv("BLOB_BASE_URL", "https://fake.public.blob.vercel-storage.com")


class _FakePutResponse:
    def __init__(self, status_code=200):
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeGetResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._json_data


def test_put_bytes_retries_once_then_succeeds(monkeypatch):
    calls = []

    def fake_put(url, headers=None, data=None, timeout=None):
        calls.append(url)
        if len(calls) == 1:
            raise ConnectionError("simulated transient failure")
        return _FakePutResponse(200)

    monkeypatch.setattr(blob.requests, "put", fake_put)

    blob.put_bytes("manifest.json", b"{}", "application/json")

    assert len(calls) == 2


def test_put_bytes_raises_when_both_attempts_fail(monkeypatch):
    def fake_put(url, headers=None, data=None, timeout=None):
        raise ConnectionError("simulated permanent failure")

    monkeypatch.setattr(blob.requests, "put", fake_put)

    with pytest.raises(ConnectionError):
        blob.put_bytes("manifest.json", b"{}", "application/json")


def test_put_json_uses_the_same_retry_path(monkeypatch):
    calls = []

    def fake_put(url, headers=None, data=None, timeout=None):
        calls.append(url)
        if len(calls) == 1:
            raise ConnectionError("simulated transient failure")
        return _FakePutResponse(200)

    monkeypatch.setattr(blob.requests, "put", fake_put)

    blob.put_json("state.json", {"storms": {}})

    assert len(calls) == 2


def test_get_json_retries_once_then_succeeds(monkeypatch):
    calls = []

    def fake_get(url, timeout=None):
        calls.append(url)
        if len(calls) == 1:
            raise ConnectionError("simulated transient failure")
        return _FakeGetResponse(200, json_data={"ok": True})

    monkeypatch.setattr(blob.requests, "get", fake_get)

    result = blob.get_json("state.json")

    assert result == {"ok": True}
    assert len(calls) == 2


def test_get_json_raises_when_both_attempts_fail(monkeypatch):
    def fake_get(url, timeout=None):
        raise ConnectionError("simulated permanent failure")

    monkeypatch.setattr(blob.requests, "get", fake_get)

    with pytest.raises(ConnectionError):
        blob.get_json("state.json")


def test_get_json_404_returns_none_without_retry(monkeypatch):
    calls = []

    def fake_get(url, timeout=None):
        calls.append(url)
        return _FakeGetResponse(404)

    monkeypatch.setattr(blob.requests, "get", fake_get)

    result = blob.get_json("state.json")

    assert result is None
    assert len(calls) == 1  # a clean 404 is not a transient failure -- no retry
