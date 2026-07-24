"""Tests for the Tropical Weather Outlook (genesis areas + TWO text) parser."""

from pathlib import Path

import pytest

from gulfwatch.outlook import (
    build_outlook,
    filter_and_normalize,
    normalize_risk,
    parse_outlook_text,
    ATLANTIC_TITLE_SUBSTR,
    GTWO_SHAPEFILES_URL,
    INDEX_AT_URL,
)

GTWO_ZIP_PATH = Path(__file__).parent / "fixtures" / "gtwo_shapefiles.zip"
RSS_XML_PATH = Path(__file__).parent / "fixtures" / "index-at.xml"


@pytest.fixture(scope="module")
def gtwo_zip_bytes():
    return GTWO_ZIP_PATH.read_bytes()


@pytest.fixture(scope="module")
def rss_xml_text():
    return RSS_XML_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def result(gtwo_zip_bytes, rss_xml_text):
    return build_outlook(gtwo_zip_bytes, rss_xml_text)


# ---------------------------------------------------------------------------
# Module constants
# ---------------------------------------------------------------------------


def test_source_urls():
    assert GTWO_SHAPEFILES_URL == "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"
    assert INDEX_AT_URL == "https://www.nhc.noaa.gov/index-at.xml"


# ---------------------------------------------------------------------------
# Risk normalization (unit-tested directly -- independent of fixture content)
# ---------------------------------------------------------------------------


def test_normalize_risk_thresholds():
    assert normalize_risk(0) == "low"
    assert normalize_risk(39) == "low"
    assert normalize_risk(40) == "medium"
    assert normalize_risk(50) == "medium"
    assert normalize_risk(60) == "medium"
    assert normalize_risk(61) == "high"
    assert normalize_risk(100) == "high"


# ---------------------------------------------------------------------------
# Filtering + normalization logic against a small synthetic FeatureCollection
# (covers the logic regardless of what today's fixture happens to contain).
# ---------------------------------------------------------------------------


def _synthetic_geojson():
    """A hand-built FeatureCollection shaped like shp.zip_to_geojson's output
    for a gtwo_shapefiles.zip containing areas/points/lines layers, mixing
    Atlantic and Pacific basins and low/medium/high probabilities."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
                "properties": {
                    "shapefile": "gtwo_areas_202607220600",
                    "BASIN": "Atlantic",
                    "AREA": "1",
                    "PROB2DAY": "10%",
                    "RISK2DAY": "Low",
                    "PROB7DAY": "30%",
                    "RISK7DAY": "Low",
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [0, 0]},
                "properties": {
                    "shapefile": "gtwo_points_202607220600",
                    "BASIN": "Atlantic",
                    "AREA": "1",
                    "PROB2DAY": "10%",
                    "RISK2DAY": "Low",
                    "PROB7DAY": "30%",
                    "RISK7DAY": "Low",
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[10, 10], [11, 10], [11, 11], [10, 10]]]},
                "properties": {
                    "shapefile": "gtwo_areas_202607220600",
                    "BASIN": "Atlantic",
                    "AREA": "2",
                    "PROB2DAY": "40%",
                    "RISK2DAY": "Medium",
                    "PROB7DAY": "50%",
                    "RISK7DAY": "Medium",
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[20, 20], [21, 20], [21, 21], [20, 20]]]},
                "properties": {
                    "shapefile": "gtwo_areas_202607220600",
                    "BASIN": "Atlantic",
                    "AREA": "3",
                    "PROB2DAY": "70%",
                    "RISK2DAY": "High",
                    "PROB7DAY": "80 percent",
                    "RISK7DAY": "High",
                },
            },
            # Line layer for area 3 -- must be dropped (not areas/points).
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": [[20, 20], [21, 21]]},
                "properties": {
                    "shapefile": "gtwo_lines_202607220600",
                    "BASIN": "Atlantic",
                    "AREA": "3",
                    "PROB2DAY": "70%",
                    "RISK2DAY": "High",
                    "PROB7DAY": "80 percent",
                    "RISK7DAY": "High",
                },
            },
            # Pacific basin area -- must be dropped (Gulf Watch is Atlantic-only).
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[30, 30], [31, 30], [31, 31], [30, 30]]]},
                "properties": {
                    "shapefile": "gtwo_areas_202607220600",
                    "BASIN": "Pacific",
                    "AREA": "1",
                    "PROB2DAY": "50%",
                    "RISK2DAY": "Medium",
                    "PROB7DAY": "90%",
                    "RISK7DAY": "High",
                },
            },
        ],
    }


@pytest.fixture(scope="module")
def synthetic_filtered():
    return filter_and_normalize(_synthetic_geojson())


def test_synthetic_only_atlantic_areas_and_points_kept(synthetic_filtered):
    assert synthetic_filtered["type"] == "FeatureCollection"
    shapefiles = {f["properties"]["shapefile"] for f in synthetic_filtered["features"]}
    assert shapefiles == {"gtwo_areas_202607220600", "gtwo_points_202607220600"}
    # 3 Atlantic areas + 1 Atlantic point = 4; the line and the Pacific area are dropped.
    assert len(synthetic_filtered["features"]) == 4
    for feature in synthetic_filtered["features"]:
        assert feature["properties"]["BASIN"] == "Atlantic"


def test_synthetic_risk_normalized_per_feature(synthetic_filtered):
    by_area = {f["properties"]["AREA"]: f["properties"] for f in synthetic_filtered["features"]}
    assert by_area["1"]["RISK7DAY"] == "low"       # 30% -> low
    assert by_area["2"]["RISK7DAY"] == "medium"    # 50% -> medium
    assert by_area["3"]["RISK7DAY"] == "high"      # "80 percent" -> high

    # PROB7DAY is preserved verbatim from the shapefile alongside the
    # normalized RISK7DAY.
    assert by_area["1"]["PROB7DAY"] == "30%"
    assert by_area["3"]["PROB7DAY"] == "80 percent"


def test_synthetic_empty_input_yields_empty_output():
    empty = {"type": "FeatureCollection", "features": []}
    assert filter_and_normalize(empty) == {"type": "FeatureCollection", "features": []}


# ---------------------------------------------------------------------------
# Real fixture: gtwo_shapefiles.zip
#
# As downloaded 2026-07-22, this zip's members are gtwo_areas_<ts>.shp,
# gtwo_lines_<ts>.shp, and gtwo_points_<ts>.shp (NOT "*_7day_areas" style
# names) -- NHC's current gtwo shapefile schema puts BOTH the 2-day and
# 7-day outlook on the same areas/points/lines records, as PROB2DAY/
# RISK2DAY and PROB7DAY/RISK7DAY fields, rather than shipping separate
# 2-day and 7-day shapefiles. There is no "7day" substring in any member
# name. See task-3-report.md for the full field/member inventory.
#
# On 2026-07-22 there's an active storm (TS Bertha) and the Atlantic RSS
# text says "Tropical cyclone formation is not expected during the next 7
# days" -- consistent with the fixture's only genesis areas being tagged
# BASIN=Pacific, which the Atlantic-only Gulf Watch dashboard must not
# show. So today's real-fixture geojson.features is legitimately [].
# ---------------------------------------------------------------------------


def test_real_fixture_geojson_is_only_7day_atlantic_areas_and_points(result):
    geojson, _outlook_json = result
    assert geojson["type"] == "FeatureCollection"
    for feature in geojson["features"]:
        props = feature["properties"]
        assert props["shapefile"].startswith(("gtwo_areas_", "gtwo_points_"))
        assert props["BASIN"] == "Atlantic"
        assert props["RISK7DAY"] in ("low", "medium", "high")
        assert "PROB7DAY" in props

    # Documented fixture reality: zero Atlantic genesis areas on 2026-07-22
    # (active storm Bertha, no other invests per the TWO text). This is the
    # correct assertion for today's fixture, not a bug in the filter.
    assert geojson["features"] == []


def test_real_fixture_text_nonempty_and_html_free(result):
    _geojson, outlook_json = result
    text = outlook_json["text"]
    assert isinstance(text, str)
    assert len(text.strip()) > 0
    assert "<" not in text
    assert ">" not in text
    assert "Tropical Weather Outlook" in text


def test_real_fixture_issued_parses_to_iso8601(result):
    _geojson, outlook_json = result
    issued = outlook_json["issued"]
    # ISO 8601 UTC, matching the rest of the pipeline's "...Z" convention.
    assert issued.endswith("Z")
    from datetime import datetime

    datetime.fromisoformat(issued.replace("Z", "+00:00"))
    # Use the official time printed in the bulletin body, not the RSS
    # publication timestamp (23:06:25Z).
    assert issued == "2026-07-23T00:00:00Z"


def test_real_fixture_top_level_shape(result):
    geojson, outlook_json = result
    assert set(outlook_json.keys()) == {"issued", "text"}
    assert geojson["type"] == "FeatureCollection"


# ---------------------------------------------------------------------------
# parse_outlook_text in isolation
# ---------------------------------------------------------------------------


def test_parse_outlook_text_picks_the_two_item(rss_xml_text):
    parsed = parse_outlook_text(rss_xml_text)
    assert set(parsed.keys()) == {"issued", "text"}
    assert "Tropical Weather Outlook" in parsed["text"]
    assert ATLANTIC_TITLE_SUBSTR in "Atlantic Tropical Weather Outlook"


def test_parse_outlook_text_strips_br_tags():
    rss = """<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
<title>Atlantic Tropical Weather Outlook</title>
<description>line one&lt;br /&gt;line two&lt;br/&gt;line three</description>
<pubDate>Wed, 22 Jul 2026 23:06:25 GMT</pubDate>
</item>
</channel></rss>"""
    parsed = parse_outlook_text(rss)
    assert "<" not in parsed["text"]
    assert "line one" in parsed["text"]
    assert "line three" in parsed["text"]
    assert parsed["issued"] == "2026-07-22T23:06:25Z"


def test_parse_outlook_text_prefers_official_bulletin_time_over_pubdate():
    rss = """<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
<title>Atlantic Tropical Weather Outlook</title>
<description>Tropical Weather Outlook&lt;br/&gt;NWS National Hurricane Center Miami FL&lt;br/&gt;200 PM EDT Fri Jul 24 2026</description>
<pubDate>Fri, 24 Jul 2026 17:13:24 GMT</pubDate>
</item>
</channel></rss>"""
    parsed = parse_outlook_text(rss)
    assert parsed["issued"] == "2026-07-24T18:00:00Z"


def test_parse_outlook_text_raises_when_two_item_missing():
    rss = """<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
<title>Some Other Advisory</title>
<description>not it</description>
<pubDate>Wed, 22 Jul 2026 23:06:25 GMT</pubDate>
</item>
</channel></rss>"""
    with pytest.raises(ValueError):
        parse_outlook_text(rss)


def test_parse_outlook_text_strips_a_non_br_tag():
    # _ANY_TAG_RE must strip HTML tags other than <br> too (e.g. a stray
    # <b> NHC or an upstream RSS proxy might emit), not just <br/>.
    rss = """<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
<title>Atlantic Tropical Weather Outlook</title>
<description>plain &lt;b&gt;bold&lt;/b&gt; text</description>
<pubDate>Wed, 22 Jul 2026 23:06:25 GMT</pubDate>
</item>
</channel></rss>"""
    parsed = parse_outlook_text(rss)
    assert parsed["text"] == "plain bold text"
    assert "<" not in parsed["text"] and ">" not in parsed["text"]


def test_parse_outlook_text_converts_non_gmt_pubdate_to_utc():
    # Today's real fixture happens to use GMT (offset +0000), which masks a
    # bug where the ISO conversion appended "Z" without first converting to
    # UTC. -0400 (EDT, NHC Miami's own local zone) makes the bug visible:
    # 18:06:25 -0400 is 22:06:25Z, not 18:06:25Z.
    rss = """<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
<title>Atlantic Tropical Weather Outlook</title>
<description>text</description>
<pubDate>Wed, 22 Jul 2026 18:06:25 -0400</pubDate>
</item>
</channel></rss>"""
    parsed = parse_outlook_text(rss)
    assert parsed["issued"] == "2026-07-22T22:06:25Z"


# ---------------------------------------------------------------------------
# Malformed PROB7DAY handling
# ---------------------------------------------------------------------------


def test_filter_and_normalize_skips_feature_with_unparseable_prob7day():
    # A bare "Low"/"N/A"-style PROB7DAY (no digits) must not crash the whole
    # outlook product over one malformed area -- the feature is dropped and
    # the rest of the FeatureCollection still comes through. See
    # task-3-report.md for the reasoning.
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [0, 0]},
                "properties": {
                    "shapefile": "gtwo_points_202607220600",
                    "BASIN": "Atlantic",
                    "AREA": "1",
                    "PROB7DAY": "Low",  # unparseable -- no digits
                    "RISK7DAY": "Low",
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [1, 1]},
                "properties": {
                    "shapefile": "gtwo_points_202607220600",
                    "BASIN": "Atlantic",
                    "AREA": "2",
                    "PROB7DAY": "30%",
                    "RISK7DAY": "Low",
                },
            },
        ],
    }
    result = filter_and_normalize(geojson)
    kept_areas = {f["properties"]["AREA"] for f in result["features"]}
    assert kept_areas == {"2"}
    assert result["features"][0]["properties"]["RISK7DAY"] == "low"
