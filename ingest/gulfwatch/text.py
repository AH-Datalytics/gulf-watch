"""Plain-text NHC per-storm text products for Gulf Watch: Forecast
Discussion + Public Advisory, extracted from .shtml text-product pages'
<pre> body (storms/{id}/text.json -- see shared-contracts.md).

Pure functions, no network I/O -- callers (pipeline.py) fetch the raw
.shtml page text and pass it in, same pattern as outlook.py.
"""

from __future__ import annotations

import html
import re

_PRE_RE = re.compile(r"<pre>(.*?)</pre>", re.IGNORECASE | re.DOTALL)
_ANY_TAG_RE = re.compile(r"<[^>]+>")

# NHC text products carry a 3-line WMO/AWIPS transmission header at the top
# of the <pre> block before the product's own title line:
#   000
#   WTNT42 KNHC 232037        <- WMO abbreviated heading
#   TCDAT2                    <- AWIPS product code
# followed by zero or more blank/whitespace-only lines, then the title
# line itself (e.g. "Tropical Storm Bertha Discussion Number  18").
_HEADER_LINE_COUNT = 3


def extract_pre_text(shtml: str) -> str:
    """Return the first <pre>...</pre> block's text, with any inline HTML
    tags stripped (keeping their visible text -- NHC text products
    occasionally hyperlink graphic URLs inline inside the <pre> block
    itself) and HTML entities unescaped.

    Raises ValueError if no <pre> block is found.
    """
    match = _PRE_RE.search(shtml)
    if not match:
        raise ValueError("no <pre> block found in shtml text product")
    text = _ANY_TAG_RE.sub("", match.group(1))
    return html.unescape(text)


def strip_header(text: str) -> str:
    """Strip the 3-line WMO/AWIPS transmission header off an NHC text
    product body, plus any blank line(s) between that header and the
    product's own title line. Keeps everything from the title line
    onward (shared-contracts.md: "strip headers minimally, keep body").
    """
    lines = text.split("\n")
    body_lines = lines[_HEADER_LINE_COUNT:]
    i = 0
    while i < len(body_lines) and not body_lines[i].strip():
        i += 1
    return "\n".join(body_lines[i:]).strip()


def parse_text_product(shtml: str) -> str:
    """Extract + header-strip an NHC text product .shtml page down to its
    plain-text body (title line onward)."""
    return strip_header(extract_pre_text(shtml))


def build_text_json(
    discussion_shtml: str,
    discussion_issued: str,
    advisory_shtml: str,
    advisory_issued: str,
) -> dict:
    """Build the storms/{id}/text.json shape (see shared-contracts.md) from
    the two raw .shtml page texts plus their CurrentStorms.json issuance
    timestamps (already ISO 8601 Z -- see nhc.py's Storm.discussion_issued
    / Storm.advisory_time)."""
    return {
        "discussion": {
            "issued": discussion_issued,
            "text": parse_text_product(discussion_shtml),
        },
        "publicAdvisory": {
            "issued": advisory_issued,
            "text": parse_text_product(advisory_shtml),
        },
    }
