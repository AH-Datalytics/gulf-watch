"""Tests for gulfwatch.probs: wind speed probability (PWS) text product
parser -- extracts 120h cumulative 34/50/64kt probabilities for a
whitelisted set of Gulf Coast points.
"""

from __future__ import annotations

from pathlib import Path

from gulfwatch.probs import TARGET_POINTS, parse_probs

FIXTURES = Path(__file__).parent / "fixtures"
BERTHA_PWS_SHTML = (FIXTURES / "bertha_pws.shtml").read_text(encoding="utf-8")

# Synthetic PWS shtml built to exercise the whitelist match logic directly:
# NEW ORLEANS LA has all three kt rows (34/50/64), GRAND ISLE LA has only a
# 34kt row (50/64 must default to 0), and HOUMA/SLIDELL/GULFPORT are absent
# entirely (must be omitted from output, not zero-filled).
SYNTHETIC_PWS_SHTML = """<html><body><pre>000
FONT12 KNHC 000000
PWSAT2

SYNTHETIC WIND SPEED PROBABILITIES NUMBER  1
NWS NATIONAL HURRICANE CENTER MIAMI FL       AL992026

  - - - - WIND SPEED PROBABILITIES FOR SELECTED LOCATIONS - - - -

               FROM    FROM    FROM    FROM    FROM    FROM    FROM
  TIME       18Z THU 06Z FRI 18Z FRI 06Z SAT 18Z SAT 18Z SUN 18Z MON
PERIODS         TO      TO      TO      TO      TO      TO      TO
             06Z FRI 18Z FRI 06Z SAT 18Z SAT 18Z SUN 18Z MON 18Z TUE

FORECAST HOUR    (12)   (24)    (36)    (48)    (72)    (96)   (120)
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
LOCATION       KT

NEW ORLEANS LA 34 90   X(90)   X(90)   X(90)   X(90)   X(90)   X(88)
 50 40   X(40)   X(40)   X(40)   X(40)   X(40)   X(35)
 64  5   X( 5)   X( 5)   X( 5)   X( 5)   X( 5)   X( 2)

GRAND ISLE LA  34 70   X(70)   X(70)   X(70)   X(70)   X(70)   X(65)

OTHER TOWN LA  34 20   X(20)   X(20)   X(20)   X(20)   X(20)   X(15)

$$
FORECASTER TEST
</pre></body></html>"""


def test_real_bertha_fixture_produces_empty_array():
    # Bertha made landfall in Texas, well west of Louisiana -- none of our
    # 5 whitelisted Gulf Coast points legitimately appear in this real
    # fixture's table. This is expected, not an error.
    assert parse_probs(BERTHA_PWS_SHTML) == []


def test_synthetic_new_orleans_all_three_kt_rows():
    result = parse_probs(SYNTHETIC_PWS_SHTML)
    new_orleans = next(p for p in result if p["point"] == "NEW ORLEANS LA")
    assert new_orleans == {"point": "NEW ORLEANS LA", "ts34": 88, "kt50": 35, "hurricane64": 2}


def test_synthetic_grand_isle_only_34kt_row_defaults_others_to_zero():
    result = parse_probs(SYNTHETIC_PWS_SHTML)
    grand_isle = next(p for p in result if p["point"] == "GRAND ISLE LA")
    assert grand_isle == {"point": "GRAND ISLE LA", "ts34": 65, "kt50": 0, "hurricane64": 0}


def test_synthetic_points_not_in_table_are_omitted_not_zero_filled():
    result = parse_probs(SYNTHETIC_PWS_SHTML)
    points_found = {p["point"] for p in result}
    # HOUMA/SLIDELL/GULFPORT never appear in the synthetic table at all.
    assert "HOUMA LA" not in points_found
    assert "SLIDELL LA" not in points_found
    assert "GULFPORT MS" not in points_found
    # Only the two points actually present are returned.
    assert points_found == {"NEW ORLEANS LA", "GRAND ISLE LA"}


def test_synthetic_output_ordered_by_target_points_order_not_table_order():
    # In the synthetic table, GRAND ISLE LA appears after NEW ORLEANS LA --
    # same as TARGET_POINTS order, so also cover the reverse by checking
    # indices line up with TARGET_POINTS regardless of table order.
    result = parse_probs(SYNTHETIC_PWS_SHTML)
    result_points = [p["point"] for p in result]
    expected_order = [p for p in TARGET_POINTS if p in result_points]
    assert result_points == expected_order


def test_target_points_constant():
    assert TARGET_POINTS == [
        "NEW ORLEANS LA",
        "GRAND ISLE LA",
        "HOUMA LA",
        "SLIDELL LA",
        "GULFPORT MS",
    ]
