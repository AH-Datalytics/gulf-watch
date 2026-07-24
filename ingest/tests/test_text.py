"""Tests for gulfwatch.text: plain-text NHC per-storm text products
(Forecast Discussion + Public Advisory), extracted from .shtml <pre> bodies.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from gulfwatch.text import build_text_json, extract_pre_text, parse_text_product, strip_header

FIXTURES = Path(__file__).parent / "fixtures"
BERTHA_DISCUSSION_SHTML = (FIXTURES / "bertha_discussion.shtml").read_text(encoding="utf-8")
BERTHA_PUBLIC_ADVISORY_SHTML = (FIXTURES / "bertha_public_advisory.shtml").read_text(
    encoding="utf-8"
)


# ---------------------------------------------------------------------------
# extract_pre_text: synthetic edge cases
# ---------------------------------------------------------------------------


def test_extract_pre_text_synthetic_simple():
    html = "<html><body><pre>hello\nworld</pre></body></html>"
    assert extract_pre_text(html) == "hello\nworld"


def test_extract_pre_text_strips_inline_tags_but_keeps_their_text():
    # Real NHC public advisories sometimes hyperlink graphic URLs inline
    # inside the <pre> block itself.
    html = "<pre>see <a href='https://x.example/y'>x.example/y</a> for more</pre>"
    assert extract_pre_text(html) == "see x.example/y for more"


def test_extract_pre_text_unescapes_html_entities():
    html = "<pre>Caf&eacute; &amp; more</pre>"
    assert extract_pre_text(html) == "Café & more"


def test_extract_pre_text_raises_when_no_pre_block():
    with pytest.raises(ValueError):
        extract_pre_text("<html><body>no pre here</body></html>")


# ---------------------------------------------------------------------------
# strip_header: synthetic edge cases
# ---------------------------------------------------------------------------


def test_strip_header_strips_three_line_wmo_header_and_blank_line():
    text = "000\nWTNT42 KNHC 232037\nTCDAT2\n \nTitle Line Here\nBody text.\n"
    assert strip_header(text) == "Title Line Here\nBody text."


def test_strip_header_handles_no_blank_line_between_code_and_title():
    text = "000\nWTNT42 KNHC 232037\nTCDAT2\nTitle Line Here\nBody text.\n"
    assert strip_header(text) == "Title Line Here\nBody text."


# ---------------------------------------------------------------------------
# parse_text_product: real fixtures
# ---------------------------------------------------------------------------


def test_parse_text_product_real_discussion_fixture():
    body = parse_text_product(BERTHA_DISCUSSION_SHTML)
    assert body.startswith("Tropical Storm Bertha Discussion Number  18")
    assert "Bertha has been moving along the northern Gulf coast" in body
    assert "WTNT42 KNHC 232037" not in body
    assert "TCDAT2" not in body
    assert "$$" in body
    assert "Forecaster Cangialosi/R. Zelinsky" in body


def test_parse_text_product_real_public_advisory_fixture():
    body = parse_text_product(BERTHA_PUBLIC_ADVISORY_SHTML)
    assert body.startswith("BULLETIN\nTropical Depression Bertha Intermediate Advisory Number 18A")
    assert "MAXIMUM SUSTAINED WINDS...35 MPH...55 KM/H" in body
    assert "WTNT32 KNHC 232339" not in body
    assert "TCPAT2" not in body
    # Inline <a href> hyperlinks in the body text must be stripped to their
    # visible link text.
    assert "<a href" not in body
    assert "hurricanes.gov/graphics_at2.shtml?rainqpf" in body


# ---------------------------------------------------------------------------
# build_text_json: shape
# ---------------------------------------------------------------------------


def test_build_text_json_shape():
    result = build_text_json(
        discussion_shtml=BERTHA_DISCUSSION_SHTML,
        discussion_issued="2026-07-22T21:00:00Z",
        advisory_shtml=BERTHA_PUBLIC_ADVISORY_SHTML,
        advisory_issued="2026-07-23T00:00:00Z",
    )
    assert set(result.keys()) == {"discussion", "publicAdvisory"}
    assert result["discussion"]["issued"] == "2026-07-22T21:00:00Z"
    assert result["discussion"]["text"].startswith(
        "Tropical Storm Bertha Discussion Number  18"
    )
    assert result["publicAdvisory"]["issued"] == "2026-07-23T00:00:00Z"
    assert result["publicAdvisory"]["text"].startswith("BULLETIN")
