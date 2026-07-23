"""NHC Tropical Weather Outlook (TWO) ingest for Gulf Watch.

Produces the quiet-season "genesis areas" layer (outlook.geojson) and the
plain-text outlook (outlook.json) from two NHC sources:

- Genesis areas shapefile zip: https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip
- Atlantic outlook text (RSS): https://www.nhc.noaa.gov/index-at.xml

Pure functions, no network I/O -- callers fetch the bytes/text and pass them
in (see shared-contracts.md for the 30s-timeout/one-retry fetch policy that
belongs in the caller).

Shapefile schema note (verified against the fixture committed 2026-07-22,
an active-storm day): NHC's current gtwo_shapefiles.zip does NOT ship
separate 2-day and 7-day shapefiles distinguished by name (there is no
"7day"/"2day" substring in any member). Instead it bundles three layers --
gtwo_areas_<timestamp>, gtwo_points_<timestamp>, gtwo_lines_<timestamp> --
and every record on every layer carries BOTH the 2-day and 7-day outlook as
sibling fields: BASIN, AREA, PROB2DAY, RISK2DAY, PROB7DAY, RISK7DAY. So
"select the 7-day layer" means selecting the 7-day *fields* (PROB7DAY /
RISK7DAY) off the areas+points layers, not a differently-named shapefile
member. The lines layer is dropped (Gulf Watch shows the areas polygons +
representative points, not the connecting lines).

Basin note: gtwo_shapefiles.zip is a combined Atlantic + East Pacific
product (BASIN field distinguishes them). The Gulf Watch is an Atlantic/
Gulf-of-Mexico dashboard, so non-Atlantic features are dropped -- otherwise
an East Pacific invest would render as a "genesis area" on a New Orleans
tropical weather desk, which would be actively misleading.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime

from gulfwatch import shp

GTWO_SHAPEFILES_URL = "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"
INDEX_AT_URL = "https://www.nhc.noaa.gov/index-at.xml"

# The TWO text item's title, as it actually appears in the Atlantic RSS feed.
ATLANTIC_TITLE_SUBSTR = "Tropical Weather Outlook"

# Only gtwo shapefile layers whose basename matches one of these prefixes
# are genesis "areas" or "points" (the "lines" layer is dropped).
_KEPT_LAYER_PREFIXES = ("gtwo_areas_", "gtwo_points_")

_ATLANTIC_BASIN = "atlantic"

_PROB_DIGITS_RE = re.compile(r"(\d+)")
_BR_TAG_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_ANY_TAG_RE = re.compile(r"<[^>]+>")


def normalize_risk(prob_pct: int) -> str:
    """Normalize a 7-day genesis probability (0-100) to low/medium/high.

    Thresholds per task brief: <40 low, 40-60 medium (inclusive both ends),
    >60 high.
    """
    if prob_pct > 60:
        return "high"
    if prob_pct >= 40:
        return "medium"
    return "low"


def _parse_prob7day(raw: str) -> int:
    """Parse a PROB7DAY-style field (e.g. "90%", "20 percent") to an int
    percentage. Raises ValueError if no digits are found."""
    match = _PROB_DIGITS_RE.search(raw or "")
    if not match:
        raise ValueError(f"could not parse a probability out of {raw!r}")
    return int(match.group(1))


def filter_and_normalize(geojson: dict) -> dict:
    """Filter a merged gtwo shapefile FeatureCollection (as produced by
    shp.zip_to_geojson) down to the 7-day genesis areas+points, dropping
    the connecting-lines layer and any non-Atlantic-basin features, and
    normalize each kept feature's RISK7DAY to low/medium/high.

    Pure function over a FeatureCollection dict -- independent of how the
    zip was read, so it's directly unit-testable with a synthetic
    FeatureCollection regardless of what any particular day's real fixture
    happens to contain.

    A feature whose PROB7DAY can't be parsed to a percentage (e.g. a bare
    non-numeric string) is dropped rather than raising -- one malformed
    genesis area shouldn't take down the whole outlook product.
    """
    features = []
    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        shapefile_name = props.get("shapefile", "")
        if not shapefile_name.startswith(_KEPT_LAYER_PREFIXES):
            continue
        if (props.get("BASIN") or "").strip().lower() != _ATLANTIC_BASIN:
            continue

        prob7day_raw = props.get("PROB7DAY", "")
        try:
            risk = normalize_risk(_parse_prob7day(prob7day_raw))
        except ValueError:
            # A single malformed/unparseable PROB7DAY (e.g. a bare "Low"
            # with no digits) must not take down the whole outlook product
            # -- drop just this feature and keep going. See task-3-report.md.
            continue

        kept_props = {**props, "RISK7DAY": risk}
        features.append({**feature, "properties": kept_props})

    return {"type": "FeatureCollection", "features": features}


def _iso_z(dt) -> str:
    """Format an (aware) datetime as ISO 8601 UTC ("...Z"), converting to
    UTC first. pubDate values carry their own offset (NHC's own feed uses
    GMT, but RFC 2822 allows any offset, e.g. "-0400"), so this must not
    just stamp "Z" onto the original wall-clock time."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_outlook_text(rss_xml: str) -> dict:
    """Parse the Atlantic TWO RSS feed (index-at.xml) into
    {"issued": <ISO8601 Z>, "text": <plain text, HTML-free>}.

    The TWO text is the <description> of the <item> whose <title> contains
    "Tropical Weather Outlook" (the feed's actual title is "Atlantic
    Tropical Weather Outlook"). <br/> tags are converted to newlines; any
    other HTML tags are stripped outright.
    """
    root = ET.fromstring(rss_xml)
    two_item = None
    for item in root.iter("item"):
        title = item.findtext("title") or ""
        if ATLANTIC_TITLE_SUBSTR in title:
            two_item = item
            break

    if two_item is None:
        raise ValueError(
            f"no RSS item with a title containing {ATLANTIC_TITLE_SUBSTR!r} found"
        )

    raw_description = two_item.findtext("description") or ""
    text = _BR_TAG_RE.sub("\n", raw_description)
    text = _ANY_TAG_RE.sub("", text)
    text = text.strip()

    raw_pub_date = two_item.findtext("pubDate") or ""
    issued = _iso_z(parsedate_to_datetime(raw_pub_date))

    return {"issued": issued, "text": text}


def build_outlook(gtwo_zip: bytes, rss_xml: str) -> tuple[dict, dict]:
    """Build (outlook.geojson, outlook.json) from the raw gtwo shapefile zip
    bytes and the raw Atlantic RSS XML text."""
    merged = shp.zip_to_geojson(gtwo_zip)
    geojson = filter_and_normalize(merged)
    outlook_json = parse_outlook_text(rss_xml)
    return geojson, outlook_json
