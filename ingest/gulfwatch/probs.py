"""NHC Wind Speed Probability (PWS) text product parser for Gulf Watch.

Extracts the 120h cumulative wind speed probability (34/50/64 kt) for a
small whitelist of Gulf Coast points from the PWS text product's "WIND
SPEED PROBABILITIES FOR SELECTED LOCATIONS" table (storms/{id}/probs.json
-- see shared-contracts.md).

Pure function module, no network I/O -- reuses gulfwatch.text's <pre>
extraction + WMO/AWIPS header stripping (the PWS .shtml page has the exact
same shtml-with-<pre> shape as the discussion/public-advisory products).
"""

from __future__ import annotations

import re

from gulfwatch.text import extract_pre_text, strip_header

# Only these 5 Gulf Coast points are ever surfaced -- most PWS advisories
# won't include all (or any) of them; a point simply absent from the table
# is omitted from the output, not zero-filled. Order here is the output
# order (New Orleans first), independent of the table's own row order.
TARGET_POINTS = ["NEW ORLEANS LA", "GRAND ISLE LA", "HOUMA LA", "SLIDELL LA", "GULFPORT MS"]

_TABLE_HEADER_RE = re.compile(
    r"-\s*-\s*-\s*-\s*WIND SPEED PROBABILITIES FOR SELECTED LOCATIONS", re.IGNORECASE
)

# A location-block row: an optional location name (present only on a
# block's first/34kt line; continuation 50kt/64kt lines have none), then
# the kt threshold (34/50/64), then the rest of the row's columns.
_KT_ROW_RE = re.compile(r"^(?P<name>.*?)\s+(?P<kt>34|50|64)\s+(?P<rest>.+)$")

_PAREN_NUM_RE = re.compile(r"\((\s*\d+)\)")
_BARE_INT_RE = re.compile(r"(\d+)")


def _normalize(name: str) -> str:
    """Whitespace-collapse + uppercase a location name for
    case-insensitive whitelist matching."""
    return " ".join(name.split()).upper()


def _cumulative_120h(rest: str) -> int:
    """The 120h cumulative value is the LAST parenthesized number on the
    row (columns 2-7 are "OP(CP)" or "X(CP)"); if a row has no parens at
    all, fall back to the last bare integer on the line."""
    parens = _PAREN_NUM_RE.findall(rest)
    if parens:
        return int(parens[-1])
    bare = _BARE_INT_RE.findall(rest)
    if bare:
        return int(bare[-1])
    return 0


def _parse_table(table_text: str) -> dict[str, dict[int, int]]:
    """Parse the PWS table body into {normalized_location: {34: v, 50: v,
    64: v}}. A blank line ends the current location's block (so a
    continuation 50/64kt line can never leak into the next location)."""
    blocks: dict[str, dict[int, int]] = {}
    current_name: str | None = None
    for raw_line in table_text.split("\n"):
        line = raw_line.rstrip()
        if not line.strip():
            current_name = None
            continue
        match = _KT_ROW_RE.match(line)
        if not match:
            continue
        name_part = match.group("name").strip()
        if name_part:
            current_name = _normalize(name_part)
        if current_name is None:
            continue
        kt = int(match.group("kt"))
        blocks.setdefault(current_name, {})[kt] = _cumulative_120h(match.group("rest"))
    return blocks


def parse_probs(shtml: str) -> list[dict]:
    """Parse a PWS .shtml text product page down to the whitelisted
    storms/{id}/probs.json array (see shared-contracts.md), ordered by
    TARGET_POINTS. Points not present in the table are omitted entirely --
    that's the normal, expected case for most advisories, not an error."""
    body = strip_header(extract_pre_text(shtml))
    header_match = _TABLE_HEADER_RE.search(body)
    if not header_match:
        return []

    table_text = body[header_match.end() :]
    sign_off = table_text.find("$$")
    if sign_off != -1:
        table_text = table_text[:sign_off]

    blocks = _parse_table(table_text)

    results = []
    for point in TARGET_POINTS:
        if point not in blocks:
            continue
        kts = blocks[point]
        results.append(
            {
                "point": point,
                "ts34": kts.get(34, 0),
                "kt50": kts.get(50, 0),
                "hurricane64": kts.get(64, 0),
            }
        )
    return results
